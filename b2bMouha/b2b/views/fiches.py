# b2b/views/fiches.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
from datetime import datetime, time as time_cls, timedelta
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date
from django.db import transaction
from django.core.paginator import Paginator
from django.db.models import Prefetch, Q

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

from b2b.models import (
    Dossier, Hotel, PreMission, Mission, OrdreMission,
    FicheMouvement, FicheMouvementItem, Vehicule, Chauffeur, AgenceVoyage,
)
from b2b.serializers import (
    FicheMouvementSerializer, FicheMouvementItemSerializer,
)
from .helpers import (
    _user_role, _user_agence,
    _ensure_same_agence_or_superadmin,
)
from b2b.utils import generate_unique_reference


# ---------------------------------------------------------------------
# Utils
# ---------------------------------------------------------------------
def _to_aware(dt):
    if not dt:
        return None
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt

def _parse_dt(s):
    if not s:
        return None
    dt = parse_datetime(s)
    if not dt:
        try:
            dt = datetime.fromisoformat(s)
        except Exception:
            dt = None
    return _to_aware(dt) if dt else None

def _infer_type(dossier):
    if getattr(dossier, "heure_depart", None) and not getattr(dossier, "heure_arrivee", None):
        return "D"
    if getattr(dossier, "heure_arrivee", None) and not getattr(dossier, "heure_depart", None):
        return "A"
    return None

def _first_nonempty(*vals):
    for v in vals:
        if v is None:
            continue
        s = str(v).strip()
        if s and s.lower() not in {"nan", "none", "null", "-"}:
            return s
    return None

def _format_clients(dossier: Dossier | None) -> str:
    if not dossier:
        return ""
    raw = _first_nonempty(
        getattr(dossier, "nom_reservation", None),
        getattr(dossier, "nom", None),
        getattr(dossier, "name", None),
        getattr(dossier, "titulaire", None),
        getattr(dossier, "titular", None),
        getattr(dossier, "clients", None),
    )
    if not raw:
        return ""
    return re.sub(r"\s+", " ", str(raw)).strip()

def _bounds_from_dossiers(dossiers, type_code, given_date=None):
    if type_code == "A":
        times = [d.heure_arrivee for d in dossiers if d.heure_arrivee]
    else:
        times = [d.heure_depart for d in dossiers if d.heure_depart]
    times = [_to_aware(t) for t in times if t]
    if times:
        return (min(times), max(times))
    if given_date:
        d = parse_date(given_date)
        if d:
            start = timezone.make_aware(datetime.combine(d, time_cls.min))
            end = timezone.make_aware(datetime.combine(d, time_cls.max))
            return (start, end)
    return (None, None)

def _fiche_tag(fiche_id: int) -> str:
    # on marque les objets créés depuis une fiche pour pouvoir les retrouver/supprimer
    return f"[FICHE#{fiche_id}]"


# ---------------------------------------------------------------------
# API: planning par hôtel d’une fiche
# ---------------------------------------------------------------------
class FicheMouvementHotelScheduleAPIView(APIView):
    """
    POST /api/fiches-mouvement/<pk>/hotel-schedule/
    Body: { "hotel_schedule": [ { "hotel": "...", "time": "HH:MM" }, ... ] }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        fiche = get_object_or_404(FicheMouvement, pk=pk)
        _ensure_same_agence_or_superadmin(request, fiche.agence)
        schedule = request.data.get("hotel_schedule", [])
        if not isinstance(schedule, list):
            return Response({"detail": "hotel_schedule doit être une liste."}, status=400)

        cleaned = []
        for it in schedule:
            if not isinstance(it, dict):
                continue
            hotel = (it.get("hotel") or "").strip()
            time_ = (it.get("time") or "").strip()
            if not hotel:
                continue
            if time_ and not re.match(r"^\d{2}:\d{2}$", time_):
                return Response({"detail": f"Heure invalide '{time_}' pour '{hotel}' (HH:MM attendu)."}, status=400)
            cleaned.append({"hotel": hotel, "time": time_ or None})

        fiche.hotel_schedule = cleaned
        fiche.save(update_fields=["hotel_schedule"])
        return Response({"ok": True, "hotel_schedule": fiche.hotel_schedule}, status=200)


# ---------------------------------------------------------------------
# Création d'UNE fiche de mouvement avec N dossiers (persistée en BD)
# ---------------------------------------------------------------------
class CreerFicheMouvementAPIView(APIView):
    """
    Payload:
      {
        "agence": <int> (si superadmin), sinon déduit,
        "name": "optionnel",
        "type": "A" | "D",
        "date": "YYYY-MM-DD",
        "aeroport": "TUN/...",
        "dossier_ids": [1,2,3,...],
        "hotel_schedule": [ { "hotel": "H", "time": "HH:MM" }, ... ] (optionnel)
      }
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        role = _user_role(request.user)
        user_agence = _user_agence(request.user)

        body = request.data.copy()
        if role == "superadmin":
            agence_id = body.get("agence")
            if not agence_id:
                return Response({"detail": "Champ 'agence' requis pour superadmin."}, status=400)
        else:
            if not user_agence:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Aucune agence associée.")
            body["agence"] = user_agence.id

        serializer = FicheMouvementSerializer(data=body, context={"request": request})
        serializer.is_valid(raise_exception=True)
        fiche: FicheMouvement = serializer.save(created_by=request.user)

        hotel_schedule = body.get("hotel_schedule")
        if isinstance(hotel_schedule, list):
            cleaned = []
            for it in hotel_schedule:
                if not isinstance(it, dict):
                    continue
                hotel = (it.get("hotel") or "").strip()
                time_ = (it.get("time") or "").strip()
                if not hotel:
                    continue
                if time_ and not re.match(r"^\d{2}:\d{2}$", time_):
                    return Response({"detail": f"Heure invalide '{time_}' pour '{hotel}' (HH:MM attendu)."}, status=400)
                cleaned.append({"hotel": hotel, "time": time_ or None})
            fiche.hotel_schedule = cleaned
            fiche.save(update_fields=["hotel_schedule"])

        return Response(FicheMouvementSerializer(fiche).data, status=201)


# ---------------------------------------------------------------------
# Affectation des ressources depuis une fiche → crée PreMission/Mission/OM
# ---------------------------------------------------------------------
class FicheMouvementAssignResourcesAPIView(APIView):
    """
    POST /api/fiches-mouvement/<pk>/assign-resources/
    Payload:
      { "vehicule_id": <id> (optionnel), "chauffeur_id": <id> (optionnel), "trajet": "texte" (optionnel) }
    Crée, pour CHAQUE dossier de la fiche:
      - PreMission (taggée [FICHE#pk] dans remarques),
      - Mission (plage = min/max des heures des dossiers, ou 08:00→+3h si inconnu),
      - OrdreMission si vehicule & chauffeur fournis.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        fiche = get_object_or_404(FicheMouvement, pk=pk)
        _ensure_same_agence_or_superadmin(request, fiche.agence)

        vehicule_id = request.data.get("vehicule_id")
        chauffeur_id = request.data.get("chauffeur_id")
        trajet = (request.data.get("trajet") or "").strip() or (fiche.aeroport or "")

        vehicule = get_object_or_404(Vehicule, id=vehicule_id) if vehicule_id else None
        chauffeur = get_object_or_404(Chauffeur, id=chauffeur_id) if chauffeur_id else None
        if vehicule:
            _ensure_same_agence_or_superadmin(request, vehicule.agence)
        if chauffeur:
            _ensure_same_agence_or_superadmin(request, chauffeur.agence)

        items = list(
            fiche.items.select_related("dossier", "dossier__hotel").all()
        )
        dossiers = [it.dossier for it in items if it.dossier_id]
        if not dossiers:
            return Response({"detail": "Aucun dossier dans cette fiche."}, status=400)

        # déduire type + date_debut/fin
        t = fiche.type
        heures = []
        for d in dossiers:
            if t == "A" and d.heure_arrivee:
                heures.append(d.heure_arrivee)
            elif t == "D" and d.heure_depart:
                heures.append(d.heure_depart)
            else:
                dt = d.heure_arrivee or d.heure_depart
                if dt:
                    heures.append(dt)

        if heures:
            date_debut = min(heures)
            date_fin = max(heures)
        else:
            hb = datetime.combine(fiche.date, datetime.min.time()).replace(hour=8, minute=0, second=0, microsecond=0)
            date_debut = timezone.make_aware(hb) if timezone.is_naive(hb) else hb
            date_fin = date_debut + timedelta(hours=3)

        tag = _fiche_tag(fiche.id)
        created_oms = []

        for d in dossiers:
            # PreMission taggée
            pre = PreMission.objects.create(
                reference=generate_unique_reference("PRE", PreMission),
                agence=fiche.agence,
                dossier=d,
                trajet_prevu=trajet,
                remarques=f"{tag} Fiche: {fiche.name or fiche.date.isoformat()}",
            )
            # Mission
            mission = pre.creer_mission(
                date_debut=date_debut,
                date_fin=date_fin,
                details=f"{tag} Mission {('Arrivée' if t=='A' else 'Départ')} – Dossier {d.reference} – APT: {fiche.aeroport or '-'}",
            )

            # OM optionnel
            if vehicule and chauffeur:
                om = mission.creer_ordre_mission(
                    vehicule=vehicule,
                    chauffeur=chauffeur,
                    date_depart=mission.date_debut,
                    date_retour=mission.date_fin,
                    trajet=pre.trajet_prevu or d.ville or fiche.aeroport or ""
                )
                created_oms.append(om.reference)

        return Response(
            {
                "ok": True,
                "created_premissions": len(dossiers),
                "created_missions": len(dossiers),
                "created_ordres_mission": len(created_oms),
                "ordres": created_oms,
            },
            status=201,
        )


class FicheMouvementUnlockOMAPIView(APIView):
    """
    POST /api/fiches-mouvement/<pk>/unlock-om/
    Supprime les PreMission/Mission/OrdreMission créés via cette fiche (repérés par le tag [FICHE#pk]).
    Permet de revoir la fiche dans la liste.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        fiche = get_object_or_404(FicheMouvement, pk=pk)
        _ensure_same_agence_or_superadmin(request, fiche.agence)
        tag = _fiche_tag(fiche.id)

        # Retrouver les pre-missions taggées
        premissions = list(
            PreMission.objects.filter(
                agence=fiche.agence,
                remarques__icontains=tag,
                dossier__in=FicheMouvementItem.objects.filter(fiche=fiche).values("dossier_id")
            ).prefetch_related("missions", "missions__ordres_mission")
        )

        deleted_om = 0
        deleted_missions = 0
        deleted_pre = 0

        for pre in premissions:
            for m in pre.missions.all():
                deleted_om += m.ordres_mission.count()
                m.ordres_mission.all().delete()
                m.delete()
                deleted_missions += 1
            pre.delete()
            deleted_pre += 1

        return Response({
            "ok": True,
            "deleted_ordres_mission": deleted_om,
            "deleted_missions": deleted_missions,
            "deleted_premissions": deleted_pre,
        }, status=200)


# ---------------------------------------------------------------------
# CRUD Fiche Mouvement / Items
# ---------------------------------------------------------------------
class FicheMouvementViewSet(ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = FicheMouvement.objects.all()
    serializer_class = FicheMouvementSerializer

    def get_queryset(self):
        qs = (
            FicheMouvement.objects
            .select_related('agence', 'created_by')
            .prefetch_related('items__dossier', 'items__dossier__hotel')
        )
        role = _user_role(self.request.user)
        agence_id = self.request.query_params.get('agence')
        if role == 'superadmin':
            return qs if not agence_id else qs.filter(agence_id=agence_id)
        if role == 'adminagence':
            return qs.filter(agence=_user_agence(self.request.user))
        return FicheMouvement.objects.none()

    def _validate_dossiers_same_agence(self, agence, dossier_ids):
        if not dossier_ids:
            return []
        dossiers = list(Dossier.objects.filter(id__in=dossier_ids))
        if len(dossiers) != len(set(dossier_ids)):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Certains dossiers sont introuvables.")
        for d in dossiers:
            if d.agence_id != getattr(agence, 'id', None):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(f"Dossier {d.reference} appartient à une autre agence.")
        return dossiers

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        role = _user_role(request.user)
        user_agence = _user_agence(request.user)

        body_agence_id = request.data.get('agence') or request.query_params.get('agence')
        if role == 'superadmin':
            if not body_agence_id:
                return Response({"error": "agence requise pour superadmin."}, status=400)
            agence = get_object_or_404(AgenceVoyage, id=body_agence_id)
        else:
            if not user_agence:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("Aucune agence associée.")
            agence = user_agence

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        dossier_ids = serializer.validated_data.pop('dossier_ids', [])
        dossiers = self._validate_dossiers_same_agence(agence, dossier_ids)

        fiche = FicheMouvement.objects.create(
            agence=agence,
            name=serializer.validated_data.get('name', ''),
            type=serializer.validated_data['type'],
            date=serializer.validated_data['date'],
            aeroport=serializer.validated_data.get('aeroport', ''),
            created_by=request.user,
            hotel_schedule=serializer.validated_data.get('hotel_schedule', []),
        )
        for d in dossiers:
            FicheMouvementItem.objects.create(fiche=fiche, dossier=d)

        out = self.get_serializer(fiche)
        headers = self.get_success_headers(out.data)
        return Response(out.data, status=201, headers=headers)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        fiche = self.get_object()
        _ensure_same_agence_or_superadmin(request, fiche.agence)
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(fiche, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        dossier_ids = serializer.validated_data.pop('dossier_ids', None)

        for f in ['name', 'type', 'date', 'aeroport', 'hotel_schedule']:
            if f in serializer.validated_data:
                setattr(fiche, f, serializer.validated_data[f])
        fiche.save()

        if dossier_ids is not None:
            dossiers = self._validate_dossiers_same_agence(fiche.agence, dossier_ids)
            FicheMouvementItem.objects.filter(fiche=fiche).delete()
            for d in dossiers:
                FicheMouvementItem.objects.create(fiche=fiche, dossier=d)

        return Response(self.get_serializer(fiche).data)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        fiche = self.get_object()
        _ensure_same_agence_or_superadmin(request, fiche.agence)
        # supprimer la fiche + items (cascade)
        return super().destroy(request, *args, **kwargs)


class FicheMouvementItemViewSet(ModelViewSet):
    serializer_class = FicheMouvementItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FicheMouvementItem.objects.select_related('fiche', 'fiche__agence', 'dossier')
        role = _user_role(self.request.user)
        if role == 'superadmin':
            return qs.all()
        if role == 'adminagence':
            return qs.filter(fiche__agence=_user_agence(self.request.user))
        return FicheMouvementItem.objects.none()

    def perform_create(self, serializer):
        fiche = serializer.validated_data.get('fiche')
        _ensure_same_agence_or_superadmin(self.request, fiche.agence)
        serializer.save()

    def perform_update(self, serializer):
        fiche = serializer.instance.fiche
        _ensure_same_agence_or_superadmin(self.request, fiche.agence)
        serializer.save()

    def perform_destroy(self, instance):
        _ensure_same_agence_or_superadmin(self.request, instance.fiche.agence)
        instance.delete()


# ---------------------------------------------------------------------
# LISTE “plate” pour le front (et cache les fiches déjà transformées en OM)
# ---------------------------------------------------------------------
class FichesMouvementListAPIView(APIView):
    """
    Sortie par fiche :
      - id, reference (name ou M_YYYY-MM-DD), type, aeroport
      - date_debut = min(heures dossiers selon type) sinon 08:00
      - date_fin   = date_debut + 3h
      - hotel      = nom si 1 seul hôtel sinon "—"
      - hotels     = [{name, pax}] (pour affichage côté front)
      - pax        = somme pax (arrivée/départ)
      - clients    = concat courte
      - observation= concat courte
    Cache les fiches qui ont déjà généré des missions/OM via cette fiche (tag [FICHE#id]).
    Filtres: search, type=A|D, aeroport, date_from, date_to, page/page_size
    """
    permission_classes = [IsAuthenticated]

    def _has_om_for_fiche(self, fiche: FicheMouvement) -> bool:
        tag = _fiche_tag(fiche.id)
        # si au moins une PreMission taggée existe → considérer comme OM généré
        return PreMission.objects.filter(
            agence=fiche.agence,
            remarques__icontains=tag,
            dossier__in=FicheMouvementItem.objects.filter(fiche=fiche).values("dossier_id")
        ).exists()

    def get(self, request):
        role = _user_role(request.user)
        if role not in ("superadmin", "adminagence"):
            return Response({"results": [], "count": 0, "page": 1, "page_size": 20, "total_pages": 0}, status=200)

        qs = (
            FicheMouvement.objects.all()
            .select_related("agence", "created_by")
            .prefetch_related("items__dossier", "items__dossier__hotel")
        )
        if role == "adminagence":
            qs = qs.filter(agence=_user_agence(request.user))

        search = (request.query_params.get("search") or "").strip()
        type_code = (request.query_params.get("type") or "").strip().upper()
        aeroport_filter = (request.query_params.get("aeroport") or "").strip()
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))

        if type_code in ("A", "D"):
            qs = qs.filter(type=type_code)
        if aeroport_filter:
            qs = qs.filter(aeroport__iexact=aeroport_filter)
        if date_from:
            try:
                df = datetime.fromisoformat(date_from).date()
                qs = qs.filter(date__gte=df)
            except Exception:
                pass
        if date_to:
            try:
                dt_ = datetime.fromisoformat(date_to).date()
                qs = qs.filter(date__lte=dt_)
            except Exception:
                pass

        rows = []
        for fiche in qs.order_by("-date", "-id"):
            # cacher celles déjà transformées en OM (via tag)
            if self._has_om_for_fiche(fiche):
                continue

            items = list(fiche.items.all())
            dossiers = [it.dossier for it in items if it.dossier_id]

            t = fiche.type
            apt = fiche.aeroport or ""

            # calcul date_debut
            heures = []
            for d in dossiers:
                if t == "A" and getattr(d, "heure_arrivee", None):
                    heures.append(d.heure_arrivee)
                elif t == "D" and getattr(d, "heure_depart", None):
                    heures.append(d.heure_depart)
                else:
                    dt = getattr(d, "heure_arrivee", None) or getattr(d, "heure_depart", None)
                    if dt:
                        heures.append(dt)

            if heures:
                date_debut = min(heures)
                if timezone.is_naive(date_debut):
                    date_debut = timezone.make_aware(date_debut)
            else:
                hb = datetime.combine(fiche.date, datetime.min.time()).replace(hour=8, minute=0, second=0, microsecond=0)
                date_debut = timezone.make_aware(hb) if timezone.is_naive(hb) else hb

            date_fin = date_debut + timedelta(hours=3)

            # pax par hôtel + total
            hotel_pax = {}
            total_pax = 0
            for d in dossiers:
                hotel_name = (getattr(getattr(d, "hotel", None), "nom", None) or "(Sans hôtel)").strip()
                if t == "A":
                    p = int(getattr(d, "nombre_personnes_arrivee", 0) or 0)
                elif t == "D":
                    p = int(getattr(d, "nombre_personnes_retour", 0) or 0)
                else:
                    p = int(getattr(d, "nombre_personnes_arrivee", 0) or 0) + int(getattr(d, "nombre_personnes_retour", 0) or 0)
                total_pax += p
                hotel_pax[hotel_name] = hotel_pax.get(hotel_name, 0) + p

            hotels_list = [{"name": n, "pax": px} for n, px in hotel_pax.items()]
            hotels_list.sort(key=lambda x: (-x["pax"], x["name"]))
            hotel_display = hotels_list[0]["name"] if len(hotels_list) == 1 else "—"

            # clients & obs (courts)
            clients_list = []
            obs_list = []
            for d in dossiers:
                c = _format_clients(d)
                if c:
                    clients_list.append(c)
                o = (getattr(d, "observation", "") or "").strip()
                if o:
                    obs_list.append(o)
            clients_display = ", ".join(list(dict.fromkeys(clients_list))[:5]) or "—"
            obs_unique = list(dict.fromkeys(obs_list))
            observation = re.sub(r"\s+", " ", " | ".join(obs_unique[:2])).strip()
            if len(observation) > 140:
                observation = observation[:140].rstrip() + "…"

            ref_display = fiche.name or f"M_{fiche.date.isoformat()}"

            rows.append(
                {
                    "id": fiche.id,
                    "reference": ref_display,
                    "type": t,
                    "aeroport": apt,
                    "date_debut": date_debut,
                    "date_fin": date_fin,
                    "hotel": hotel_display,
                    "hotels": hotels_list,
                    "pax": total_pax or None,
                    "clients": clients_display,
                    "observation": observation,
                    "hotel_schedule": fiche.hotel_schedule or [],
                }
            )

        if search:
            s = search.lower()
            def _hit(r):
                return any(
                    s in (str(r.get(k, "")) or "").lower()
                    for k in ("reference", "aeroport", "hotel", "clients", "observation")
                )
            rows = [r for r in rows if _hit(r)]

        paginator = Paginator(rows, page_size)
        page_obj = paginator.get_page(page)
        return Response({
            "results": list(page_obj.object_list),
            "count": paginator.count,
            "page": page_obj.number,
            "page_size": page_size,
            "total_pages": paginator.num_pages,
        }, status=200)


# ---------------------------------------------------------------------
# PDF Ordre de mission (identique au besoin actuel, mono-dossier)
# ---------------------------------------------------------------------
def ordre_mission_pdf(request, ordre_id):
    try:
        ordre = (
            OrdreMission.objects
            .select_related(
                "mission",
                "mission__premission",
                "mission__premission__agence",
                "mission__premission__dossier",
                "mission__premission__dossier__hotel",
                "vehicule",
                "chauffeur",
            )
            .get(id=ordre_id)
        )
    except OrdreMission.DoesNotExist:
        return HttpResponse("Ordre de mission non trouvé.", status=404)

    mission = ordre.mission
    pre = getattr(mission, "premission", None)
    agence = getattr(pre, "agence", None)
    dossier = getattr(pre, "dossier", None)

    def fmt_dt(dt, fmt="%d-%m-%Y %H:%M"):
        try:
            return dt.strftime(fmt) if dt else "—"
        except Exception:
            return "—"

    styles = getSampleStyleSheet()
    style_normal = styles["Normal"]
    style_small_right = ParagraphStyle("small_right", parent=styles["Normal"], alignment=TA_RIGHT, fontSize=10, leading=12)
    style_title = ParagraphStyle("title", parent=styles["Heading1"], alignment=TA_CENTER, fontSize=16, spaceAfter=8)
    style_h2 = ParagraphStyle("h2", parent=styles["Heading2"], alignment=TA_LEFT, fontSize=12, textColor=colors.HexColor("#111827"))

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="ordre_{ordre.reference}.pdf"'
    doc = SimpleDocTemplate(response, pagesize=A4, leftMargin=1.7*cm, rightMargin=1.7*cm, topMargin=1.4*cm, bottomMargin=1.4*cm)
    elements = []

    logo = Paragraph("", style_normal)
    try:
        logo_path = os.path.join(settings.BASE_DIR, "b2b", "static", "b2b", "logo_agence.png")
        if os.path.exists(logo_path):
            logo = Image(logo_path, width=3.2 * cm, height=3.2 * cm)
    except Exception:
        pass

    agence_nom = _first_nonempty(getattr(agence, "nom", None)) or "—"
    agence_adresse = _first_nonempty(getattr(agence, "adresse", None)) or "—"
    agence_tel = _first_nonempty(getattr(agence, "telephone", None)) or "—"
    agence_email = _first_nonempty(getattr(agence, "email", None)) or "—"

    agence_info = Paragraph(
        f"<b>{agence_nom}</b><br/>{agence_adresse}<br/>"
        f"Tél : {agence_tel} &nbsp;&nbsp;|&nbsp;&nbsp; Email : {agence_email}",
        style_small_right,
    )
    header = Table([[logo, agence_info]], colWidths=[6.5 * cm, 11.5 * cm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(header)
    elements.append(Spacer(1, 6))
    elements.append(Table([[""]], colWidths=[18*cm], style=TableStyle([("LINEBELOW", (0,0), (-1,0), 0.5, colors.HexColor("#e5e7eb"))])))
    elements.append(Spacer(1, 6))

    # (le reste du PDF a été raccourci pour la brièveté)
    elements.append(Paragraph("ORDRE DE MISSION", style_title))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph(f"Référence : {ordre.reference}", style_normal))
    elements.append(Paragraph(f"Date : {fmt_dt(ordre.date_depart, '%d-%m-%Y')}", style_normal))
    elements.append(Paragraph(f"Chauffeur : {getattr(ordre.chauffeur,'nom','')} {getattr(ordre.chauffeur,'prenom','')}", style_normal))
    elements.append(Paragraph(f"Véhicule : {getattr(getattr(ordre,'vehicule',None),'immatriculation','—')}", style_normal))
    doc.build(elements)
    return response
