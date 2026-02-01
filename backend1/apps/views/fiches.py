# backend1/b2b/views/fiches_mouvement.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Dict, List

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Count, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework import viewsets, status

from apps.views.helpers import _ensure_same_agence_or_superadmin

from apps.models import (
    Dossier,
    FicheMouvement,
    Mission,
    Vehicule,
    Chauffeur,
    MissionRessource,
)
from apps.serializers import FicheMouvementSerializer, MissionSerializer


DEPART_TYPES = ("D", "S")
ARRIVEE_TYPES = ("A", "L")

DEFAULT_ARR_WAIT_MIN = 60
DEFAULT_ARR_BUFFER_MIN = 120
DEFAULT_AIRPORT_MIN = 120
DEFAULT_PICKUP_PER_HOTEL_MIN = 15


# =========================
# Helpers
# =========================
def _as_int(x, default: int) -> int:
    try:
        if x is None or x == "":
            return default
        return int(x)
    except Exception:
        return default


def _combine_date_time(d, t):
    if not d or not t:
        return None
    return datetime.combine(d, t)


def _time_to_hhmm(t):
    return t.strftime("%H:%M") if t else None


def _has_field(model, name: str) -> bool:
    return name in {f.name for f in model._meta.get_fields()}


def _is_hhmm(v: str | None) -> bool:
    return bool(v and re.match(r"^\d{2}:\d{2}$", v))


def _pick_hhmm(it: dict) -> str | None:
    """
    Retourne une heure HH:MM depuis un item schedule, en respectant la saisie agent.
    Accepte plusieurs clés (front/back ont évolué).
    """
    for k in (
        "override_time",
        "heure_pickup",
        "heure_depot",
        "heure_fin_estimee",
        "time",
        "heure",
    ):
        v = (it.get(k) or "").strip()
        if v:
            return v[:5]
    return None


def _dt_to_iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt.isoformat()


def _hhmm_to_dt_near(hhmm: str, ref_dt: datetime) -> datetime:
    """
    Convertit HH:MM en datetime en choisissant le jour le plus logique autour de ref_dt.
    Permet de gérer J-1 / J+1 automatiquement.
    """
    t = datetime.strptime(hhmm, "%H:%M").time()
    base = datetime.combine(ref_dt.date(), t)

    c0 = base
    c_minus = base - timedelta(days=1)
    c_plus = base + timedelta(days=1)

    best = min([c_minus, c0, c_plus], key=lambda d: abs((d - ref_dt).total_seconds()))
    return best


def _group_hotels_from_dossiers(fiche: FicheMouvement) -> List[Dict[str, Any]]:
    """
    Fallback si le front n’envoie rien : on agrège pax par hôtel.
    ⚠️ On ne trie PAS pour ne pas casser un éventuel ordre métier.
    """
    rel = getattr(fiche, "dossiers", None)
    if rel is None:
        return []
    try:
        dossiers = list(rel.all())
    except Exception:
        return []

    agg: Dict[str, int] = {}
    order: List[str] = []
    for d in dossiers:
        hotel_label = getattr(d, "hotel", None) or getattr(getattr(d, "hotel_fk", None), "nom", None)
        hotel_label = (hotel_label or "").strip()
        if not hotel_label:
            continue
        pax = getattr(d, "pax", 0) or 0
        if hotel_label not in agg:
            agg[hotel_label] = 0
            order.append(hotel_label)
        agg[hotel_label] += pax

    return [{"hotel": k, "pax": agg.get(k, 0)} for k in order]


def _ensure_schedule_exists_for_fiche(f: FicheMouvement) -> None:
    """
    Si hotel_schedule est vide => on le génère automatiquement (fallback dossiers).
    Lève ValueError si on ne peut pas.
    """
    if f.hotel_schedule:
        return

    rows = _group_hotels_from_dossiers(f)
    if not rows:
        raise ValueError(f"Fiche {f.id}: pas de hotel_schedule et aucun dossier associé.")

    base_dt = _combine_date_time(f.date, f.horaires)
    if not base_dt:
        raise ValueError(f"Fiche {f.id}: date/horaires invalides.")

    type_mvt = (f.type or "").upper().strip()

    # Départ
    if type_mvt in DEPART_TYPES:
        airport_minutes = DEFAULT_AIRPORT_MIN
        dt_airport = base_dt - timedelta(minutes=airport_minutes)

        total = 0
        out = []
        for it in reversed(rows):
            total += DEFAULT_PICKUP_PER_HOTEL_MIN
            pickup_dt = dt_airport - timedelta(minutes=total)

            out.append(
                {
                    "hotel": it["hotel"],
                    "pax": it.get("pax", 0),
                    "pickup_minutes": DEFAULT_PICKUP_PER_HOTEL_MIN,
                    "heure_vol": _time_to_hhmm(f.horaires),
                    "heure_aeroport": dt_airport.strftime("%H:%M"),
                    "heure_pickup": pickup_dt.strftime("%H:%M"),
                    "override_time": pickup_dt.strftime("%H:%M"),
                    "datetime_vol": _dt_to_iso(base_dt),
                    "datetime_airport": _dt_to_iso(dt_airport),
                    "datetime_pickup": _dt_to_iso(pickup_dt),
                    "airport_minutes": airport_minutes,
                }
            )
        out.reverse()
        f.hotel_schedule = out
        f.save(update_fields=["hotel_schedule"])
        return

    # Arrivée
    if type_mvt in ARRIVEE_TYPES:
        arr_wait = DEFAULT_ARR_WAIT_MIN
        route_min = DEFAULT_ARR_BUFFER_MIN
        dt_aeroport = base_dt + timedelta(minutes=arr_wait)
        dt_depot_default = dt_aeroport + timedelta(minutes=route_min)

        out = []
        for it in rows:
            out.append(
                {
                    "hotel": it["hotel"],
                    "pax": it.get("pax", 0),
                    "heure_vol": _time_to_hhmm(f.horaires),
                    "heure_aeroport": dt_aeroport.strftime("%H:%M"),
                    "heure_depot": dt_depot_default.strftime("%H:%M"),
                    "override_time": dt_depot_default.strftime("%H:%M"),
                    "datetime_vol": _dt_to_iso(base_dt),
                    "datetime_airport": _dt_to_iso(dt_aeroport),
                    "datetime_depot": _dt_to_iso(dt_depot_default),
                    "arr_wait_minutes": arr_wait,
                    "route_minutes": route_min,
                }
            )
        f.hotel_schedule = out
        f.save(update_fields=["hotel_schedule"])
        return

    raise ValueError(f"Fiche {f.id}: type inconnu '{type_mvt}' (attendu A/L/D/S).")


def _parse_dt_safe(v: str):
    dt = parse_datetime(v)
    if not dt:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _kind_from_fiche(f: FicheMouvement) -> str:
    return (f.type or "").upper().strip()


from datetime import datetime, timedelta
from django.utils import timezone

def _infer_window_and_lieux_from_fiches(fiches: list[FicheMouvement], mission: Mission):
    tz = timezone.get_current_timezone()

    all_pickups: list[datetime] = []
    all_depots: list[datetime] = []

    last_depot_dt: datetime | None = None
    last_depot_hotel: str | None = None

    def safe_dt(v):
        return _parse_dt_safe(v) if v else None

    for f in fiches:
        for it in (f.hotel_schedule or []):
            if not isinstance(it, dict):
                continue

            dt_pick = safe_dt(it.get("datetime_pickup"))
            dt_dep = safe_dt(it.get("datetime_depot"))

            if dt_pick:
                all_pickups.append(dt_pick)

            if dt_dep:
                all_depots.append(dt_dep)
                if last_depot_dt is None or dt_dep > last_depot_dt:
                    last_depot_dt = dt_dep
                    last_depot_hotel = (it.get("hotel") or "").strip() or None

    # base = h.vol
    base_time = mission.horaires or datetime.min.time()
    base = datetime.combine(mission.date, base_time)
    if timezone.is_naive(base):
        base = timezone.make_aware(base, tz)

    aeroport = (mission.aeroport or mission.provenance or mission.destination or "").strip() or None
    kind = _kind_from_fiche(fiches[0]) if fiches else ""

    # ===== DÉPART =====
    if kind in DEPART_TYPES:
        # deadline aéroport = h.vol - 2h
        end_dt = base - timedelta(hours=2)

        # start = 1er pickup saisi
        start_dt = min(all_pickups) if all_pickups else (end_dt - timedelta(hours=1))

        lieu_depart = None
        lieu_arrivee = aeroport
        return start_dt, end_dt, lieu_depart, lieu_arrivee

    # ===== ARRIVÉE =====
    if kind in ARRIVEE_TYPES:
        # start = h.vol
        start_dt = base

        # end = dernier dépôt hôtel (sinon h.vol + 1h)
        end_dt = last_depot_dt if last_depot_dt else (base + timedelta(hours=1))

        lieu_depart = aeroport
        lieu_arrivee = last_depot_hotel or (mission.destination or "").strip() or None
        return start_dt, end_dt, lieu_depart, lieu_arrivee

    # fallback
    start_dt = min(all_pickups or [base])
    end_dt = max(all_depots or [start_dt]) + timedelta(minutes=15)
    return start_dt, end_dt, aeroport, last_depot_hotel


# =========================
# API Create fiche
# =========================
class CreerFicheMouvementAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        prof = getattr(request.user, "profile", None)
        role = getattr(prof, "role", None)
        user_agence = getattr(prof, "agence", None)

        body = request.data.copy()

        if role == "superadmin":
            if not body.get("agence"):
                return Response({"detail": "Champ 'agence' requis pour superadmin."}, status=400)
        else:
            if not user_agence:
                return Response({"detail": "Aucune agence associée."}, status=403)
            body["agence"] = user_agence.id

        serializer = FicheMouvementSerializer(data=body, context={"request": request})
        serializer.is_valid(raise_exception=True)
        fiche = serializer.save(created_by=request.user)

        hotel_schedule = body.get("hotel_schedule")
        if isinstance(hotel_schedule, list):
            fiche.hotel_schedule = hotel_schedule
            fiche.save(update_fields=["hotel_schedule"])

        return Response(FicheMouvementSerializer(fiche, context={"request": request}).data, status=201)


# =========================
# Update horaires (simple)
# =========================
class UpdateHorairesRamassageAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, fiche_id: int):
        fiche = get_object_or_404(FicheMouvement, id=fiche_id)
        _ensure_same_agence_or_superadmin(request, fiche.agence_id)

        rows = request.data.get("rows", [])
        if not isinstance(rows, list):
            return Response({"detail": "Format 'rows' invalide (liste attendue)."}, status=400)

        cleaned = []
        for it in rows:
            if not isinstance(it, dict):
                continue
            hotel = (it.get("hotel") or "").strip()
            hhmm = (it.get("time") or "").strip()
            if not hotel:
                continue
            if hhmm and not re.match(r"^\d{2}:\d{2}$", hhmm):
                return Response({"detail": f"Heure invalide '{hhmm}' (HH:MM)."}, status=400)

            cleaned.append({"hotel": hotel, "override_time": hhmm or None})

        fiche.hotel_schedule = cleaned
        fiche.save(update_fields=["hotel_schedule"])
        return Response({"status": "ok", "updated": len(cleaned)})


# =========================
# ViewSet FicheMouvement
# =========================
class FicheMouvementViewSet(viewsets.ModelViewSet):
    queryset = FicheMouvement.objects.all()
    serializer_class = FicheMouvementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()

        # Filtre soft-delete si champ existe
        if _has_field(FicheMouvement, "is_deleted"):
            qs = qs.filter(is_deleted=False)

        agence_id = self.request.query_params.get("agence")
        mission_isnull = self.request.query_params.get("mission__isnull")
        date_str = self.request.query_params.get("date")

        if agence_id:
            try:
                agence_id_int = int(agence_id)
            except Exception:
                agence_id_int = None
            if agence_id_int:
                _ensure_same_agence_or_superadmin(self.request, agence_id_int)
                qs = qs.filter(agence_id=agence_id_int)

        if mission_isnull in ("true", "1", "yes"):
            if _has_field(FicheMouvement, "mission"):
                qs = qs.filter(mission__isnull=True)

        if date_str:
            try:
                qs = qs.filter(date=date_str)
            except Exception:
                pass

        return qs

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        fiche = self.get_object()
        _ensure_same_agence_or_superadmin(request, int(fiche.agence_id))

        Dossier.objects.filter(fiche_mouvement=fiche).update(
            fiche_mouvement=None,
            is_transformed=False,
        )

        fiche.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # =====================================
    # CALCUL SCHEDULE (ARRIVEE + DEPART)
    # =====================================
    @action(detail=True, methods=["post"], url_path="hotel-schedule")
    @transaction.atomic
    def hotel_schedule(self, request, pk=None):
        fiche: FicheMouvement = self.get_object()

        rows = request.data.get("hotel_schedule")
        if rows is None:
            rows = _group_hotels_from_dossiers(fiche)

        if not isinstance(rows, list):
            return Response({"detail": "hotel_schedule doit être une liste."}, status=status.HTTP_400_BAD_REQUEST)

        if not fiche.horaires:
            return Response({"detail": "La fiche n'a pas d'heure (horaires)."}, status=status.HTTP_400_BAD_REQUEST)

        base_dt = _combine_date_time(fiche.date, fiche.horaires)
        if not base_dt:
            return Response({"detail": "Date/heure invalide."}, status=status.HTTP_400_BAD_REQUEST)

        type_mvt = (fiche.type or "").upper().strip()
        has_forced_times = any(isinstance(it, dict) and _is_hhmm(_pick_hhmm(it)) for it in rows)

        # ARRIVÉE (A/L)
        if type_mvt in ARRIVEE_TYPES:
            arr_wait = _as_int(request.data.get("arr_wait_minutes"), DEFAULT_ARR_WAIT_MIN)
            route_min = _as_int(request.data.get("route_minutes"), DEFAULT_ARR_BUFFER_MIN)

            dt_vol = base_dt
            dt_aeroport = base_dt + timedelta(minutes=arr_wait)
            dt_depot_default = dt_aeroport + timedelta(minutes=route_min)

            cleaned = []
            for it in rows:
                if not isinstance(it, dict):
                    continue

                hotel = (it.get("hotel") or "").strip()
                pax = _as_int(it.get("pax"), 0)
                if not hotel:
                    continue

                forced = _pick_hhmm(it)
                if _is_hhmm(forced):
                    dt_depot = _hhmm_to_dt_near(forced[:5], dt_depot_default)
                    heure_depot = forced[:5]
                else:
                    dt_depot = dt_depot_default
                    heure_depot = dt_depot.strftime("%H:%M")

                cleaned.append(
                    {
                        "hotel": hotel,
                        "pax": pax,
                        "heure_vol": _time_to_hhmm(fiche.horaires),
                        "heure_aeroport": dt_aeroport.strftime("%H:%M"),
                        "heure_depot": heure_depot,
                        "override_time": heure_depot,
                        "datetime_vol": _dt_to_iso(dt_vol),
                        "datetime_airport": _dt_to_iso(dt_aeroport),
                        "datetime_depot": _dt_to_iso(dt_depot),
                        "arr_wait_minutes": arr_wait,
                        "route_minutes": route_min,
                    }
                )

            fiche.hotel_schedule = cleaned
            fiche.save(update_fields=["hotel_schedule"])
            return Response(self.get_serializer(fiche).data, status=status.HTTP_200_OK)

        # DÉPART (D/S)
        if type_mvt in DEPART_TYPES:
            airport_minutes = _as_int(request.data.get("airport_minutes"), DEFAULT_AIRPORT_MIN)

            dt_vol = base_dt
            dt_airport = base_dt - timedelta(minutes=airport_minutes)

            if has_forced_times:
                cleaned = []
                for it in rows:
                    if not isinstance(it, dict):
                        continue
                    hotel = (it.get("hotel") or "").strip()
                    if not hotel:
                        continue
                    pax = _as_int(it.get("pax"), 0)

                    hhmm_val = _pick_hhmm(it)
                    hhmm_val = hhmm_val[:5] if _is_hhmm(hhmm_val) else None
                    dt_pickup = _hhmm_to_dt_near(hhmm_val, dt_airport) if hhmm_val else None

                    cleaned.append(
                        {
                            "hotel": hotel,
                            "pax": pax,
                            "pickup_minutes": _as_int(it.get("pickup_minutes"), DEFAULT_PICKUP_PER_HOTEL_MIN),
                            "heure_vol": _time_to_hhmm(fiche.horaires),
                            "heure_aeroport": dt_airport.strftime("%H:%M"),
                            "heure_pickup": hhmm_val,
                            "override_time": hhmm_val,
                            "datetime_vol": _dt_to_iso(dt_vol),
                            "datetime_airport": _dt_to_iso(dt_airport),
                            "datetime_pickup": _dt_to_iso(dt_pickup) if dt_pickup else None,
                            "airport_minutes": airport_minutes,
                        }
                    )

                fiche.hotel_schedule = cleaned
                fiche.save(update_fields=["hotel_schedule"])
                return Response(self.get_serializer(fiche).data, status=status.HTTP_200_OK)

            cleaned_input = []
            for it in rows:
                if not isinstance(it, dict):
                    continue

                hotel = (it.get("hotel") or "").strip()
                pax = _as_int(it.get("pax"), 0)
                pickup_min = _as_int(it.get("pickup_minutes"), DEFAULT_PICKUP_PER_HOTEL_MIN)
                if not hotel:
                    continue

                cleaned_input.append({"hotel": hotel, "pax": pax, "pickup_minutes": pickup_min})

            total = 0
            reversed_out = []
            for it in reversed(cleaned_input):
                total += it["pickup_minutes"]
                pickup_dt = dt_airport - timedelta(minutes=total)

                reversed_out.append(
                    {
                        "hotel": it["hotel"],
                        "pax": it["pax"],
                        "pickup_minutes": it["pickup_minutes"],
                        "heure_vol": _time_to_hhmm(fiche.horaires),
                        "heure_aeroport": dt_airport.strftime("%H:%M"),
                        "heure_pickup": pickup_dt.strftime("%H:%M"),
                        "override_time": pickup_dt.strftime("%H:%M"),
                        "datetime_vol": _dt_to_iso(dt_vol),
                        "datetime_airport": _dt_to_iso(dt_airport),
                        "datetime_pickup": _dt_to_iso(pickup_dt),
                        "airport_minutes": airport_minutes,
                    }
                )

            reversed_out.reverse()
            fiche.hotel_schedule = reversed_out
            fiche.save(update_fields=["hotel_schedule"])
            return Response(self.get_serializer(fiche).data, status=status.HTTP_200_OK)

        return Response(
            {"detail": f"Type fiche inconnu '{type_mvt}'. Attendu A/L/D/S."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # -------------------------------------
    # Transfert (link fiche -> mission)
    # -------------------------------------
    @action(detail=True, methods=["post"], url_path="transfert")
    @transaction.atomic
    def transfert(self, request, pk=None):
        fiche: FicheMouvement = self.get_object()
        data = request.data or {}

        rows = data.get("rows")
        if isinstance(rows, list) and rows:
            fiche.hotel_schedule = rows

        if not _has_field(FicheMouvement, "mission"):
            fiche.save(update_fields=["hotel_schedule"])
            return Response({"ok": True, "detail": "Champ FK 'mission' absent dans FicheMouvement."}, status=200)

        if not fiche.mission_id:
            m = Mission.objects.create(
                agence=fiche.agence,
                type="T",
                reference=data.get("reference")
                or f"M-{fiche.agence_id}-{fiche.id}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                date=data.get("date") or fiche.date,
                horaires=fiche.horaires,
                numero_vol=data.get("numero_vol") or (fiche.numero_vol or ""),
                aeroport=data.get("aeroport") or (fiche.provenance or fiche.destination or "") or "",
                created_by=request.user,
                is_converted_from_fiche=True,
            )
            fiche.mission = m
        else:
            m = fiche.mission
            m.numero_vol = data.get("numero_vol") or m.numero_vol or ""
            m.aeroport = data.get("aeroport") or m.aeroport or ""
            m.date = data.get("date") or m.date
            if data.get("horaires"):
                m.horaires = data.get("horaires")
            m.save(update_fields=["numero_vol", "aeroport", "date", "horaires"])

        fiche.save(update_fields=["hotel_schedule", "mission"])
        return Response({"ok": True, "mission_id": fiche.mission_id}, status=200)

    # =====================================================
    # ✅ TO MISSION : fiches + ressources => mission
    # - window/lieux calculés selon règles métier
    # =====================================================
    @action(detail=False, methods=["post"], url_path="to-mission")
    @transaction.atomic
    def to_mission(self, request):
        data = request.data or {}
        fiche_ids = data.get("fiche_ids") or []

        if not isinstance(fiche_ids, list) or not fiche_ids:
            return Response({"detail": "fiche_ids doit être une liste non vide."}, status=400)

        qs = (
            FicheMouvement.objects.filter(id__in=fiche_ids)
            .select_related("agence")
            .select_for_update()
        )

        if _has_field(FicheMouvement, "is_deleted"):
            qs = qs.filter(is_deleted=False)

        if not qs.exists():
            return Response({"detail": "Aucune fiche trouvée."}, status=400)

        first = qs.first()

        if qs.exclude(agence_id=first.agence_id).exists():
            return Response({"detail": "Toutes les fiches doivent appartenir à la même agence."}, status=400)

        _ensure_same_agence_or_superadmin(request, first.agence_id)

        # =========================
        # Fleet (2 formats)
        # =========================
        vehicule = None
        chauffeur_main = None

        vehicule_id = data.get("vehicule_id")
        chauffeur_ids = data.get("chauffeur_ids") or []

        if vehicule_id:
            vehicule = Vehicule.objects.select_for_update().filter(
                id=vehicule_id,
                agence_id=first.agence_id,
            ).first()
            if vehicule is None:
                return Response({"detail": f"Véhicule introuvable ou hors agence (id={vehicule_id})."}, status=400)

        if isinstance(chauffeur_ids, list) and chauffeur_ids:
            chauffeur_main = Chauffeur.objects.select_for_update().filter(
                id=chauffeur_ids[0],
                agence_id=first.agence_id,
            ).first()
            if chauffeur_main is None:
                return Response({"detail": f"Chauffeur introuvable ou hors agence (id={chauffeur_ids[0]})."}, status=400)

        # fallback ancien format
        if vehicule is None and chauffeur_main is None:
            meta_fleet = data.get("meta_fleet") or []
            if isinstance(meta_fleet, list):
                for it in meta_fleet:
                    if not isinstance(it, dict):
                        continue

                    if it.get("id") and vehicule is None:
                        vehicule = Vehicule.objects.select_for_update().filter(
                            id=it["id"],
                            agence_id=first.agence_id,
                        ).first()
                        if vehicule is None:
                            return Response({"detail": f"Véhicule introuvable ou hors agence (id={it['id']})."}, status=400)

                    if it.get("chauffeur_id") and chauffeur_main is None:
                        chauffeur_main = Chauffeur.objects.select_for_update().filter(
                            id=it["chauffeur_id"],
                            agence_id=first.agence_id,
                        ).first()
                        if chauffeur_main is None:
                            return Response(
                                {"detail": f"Chauffeur introuvable ou hors agence (id={it['chauffeur_id']})."},
                                status=400,
                            )

        if vehicule is None and chauffeur_main is None:
            return Response(
                {
                    "vehicule": ["Sélectionne au moins un véhicule ou un chauffeur."],
                    "chauffeur": ["Sélectionne au moins un véhicule ou un chauffeur."],
                },
                status=400,
            )

        # Observations merge
        observations = []
        for f in qs:
            if f.observation:
                observations.append(f.observation.strip())
        mission_observation = "\n".join(dict.fromkeys(observations))

        # ensure schedule exists
        try:
            for f in qs:
                _ensure_schedule_exists_for_fiche(f)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)

        # Create mission (remplit vehicule/chauffeur)
        mission = Mission.objects.create(
            agence=first.agence,
            type="T",
            reference=f"M-{first.agence_id}-{timezone.now().strftime('%Y%m%d%H%M%S')}",
            date=first.date,
            horaires=first.horaires,
            numero_vol=first.numero_vol,
            aeroport=data.get("aeroport") or first.provenance or first.destination,
            observation=mission_observation,
            created_by=request.user,
            is_converted_from_fiche=True,
            vehicule=vehicule,
            chauffeur=chauffeur_main,
        )

        if _has_field(FicheMouvement, "mission"):
            qs.update(mission=mission)

        # =========================
        # ✅ Fenêtre + lieux métier
        # =========================
        start_dt = _parse_dt_safe(data.get("date_heure_debut") or "")
        end_dt = _parse_dt_safe(data.get("date_heure_fin") or "")

        fiches_list = list(qs)

        if not start_dt or not end_dt:
            start_dt, end_dt, lieu_depart, lieu_arrivee = _infer_window_and_lieux_from_fiches(fiches_list, mission)
        else:
            _, _, lieu_depart, lieu_arrivee = _infer_window_and_lieux_from_fiches(fiches_list, mission)

        if end_dt <= start_dt:
            end_dt = start_dt + timedelta(minutes=30)

        # MissionRessource (UNE ligne vehicule + chauffeur)
        try:
            MissionRessource.objects.update_or_create(
                mission=mission,
                defaults={
                    "vehicule": vehicule,
                    "chauffeur": chauffeur_main,
                    "date_heure_debut": start_dt,
                    "date_heure_fin": end_dt,
                    "lieu_depart": lieu_depart,
                    "lieu_arrivee": lieu_arrivee,
                },
            )
        except ValidationError as e:
            return Response({"detail": e.message_dict if hasattr(e, "message_dict") else str(e)}, status=400)

        return Response(MissionSerializer(mission, context={"request": request}).data, status=201)

    # -------------------------------------
    # Revert / Corbeille (1 fiche)
    # -------------------------------------
    @action(detail=True, methods=["post"], url_path="revert-to-dossier")
    @transaction.atomic
    def revert_one_to_dossier(self, request, pk=None):
        fiche: FicheMouvement = self.get_object()
        _ensure_same_agence_or_superadmin(request, int(fiche.agence_id))

        Dossier.objects.filter(fiche_mouvement=fiche).update(
            fiche_mouvement=None,
            is_transformed=False,
        )

        if _has_field(FicheMouvement, "mission"):
            fiche.mission = None
            fiche.save(update_fields=["mission"])

        fiche.delete()
        return Response({"ok": True, "fiche_id": int(pk)}, status=200)

    # -------------------------------------
    # Revert / Corbeille (multiple)
    # -------------------------------------
    @action(detail=False, methods=["post"], url_path="revert-to-dossier")
    @transaction.atomic
    def revert_many_to_dossier(self, request):
        fiche_ids = request.data.get("fiche_ids") or []
        if not isinstance(fiche_ids, list) or not fiche_ids:
            return Response({"detail": "fiche_ids doit être une liste non vide."}, status=400)

        qs = FicheMouvement.objects.select_for_update().filter(id__in=fiche_ids)

        if _has_field(FicheMouvement, "is_deleted"):
            qs = qs.filter(is_deleted=False)

        first = qs.first()
        if not first:
            return Response({"detail": "Aucune fiche trouvée."}, status=400)

        _ensure_same_agence_or_superadmin(request, first.agence_id)

        if qs.exclude(agence_id=first.agence_id).exists():
            return Response({"detail": "Toutes les fiches doivent être de la même agence."}, status=400)

        Dossier.objects.filter(fiche_mouvement__in=qs).update(
            fiche_mouvement=None,
            is_transformed=False,
        )

        if _has_field(FicheMouvement, "mission"):
            qs.update(mission=None)

        count = qs.count()
        qs.delete()

        return Response({"ok": True, "deleted": count}, status=200)


# =========================
# Aggregations
# =========================
class FichesAggregationsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        agence = getattr(getattr(request.user, "profile", None), "agence", None)
        if not agence:
            return Response({"detail": "Aucune agence associée à l'utilisateur."}, status=400)

        qs = FicheMouvement.objects.filter(agence=agence)
        if _has_field(FicheMouvement, "is_deleted"):
            qs = qs.filter(is_deleted=False)

        def normalize_list(x):
            if not x:
                return []
            if isinstance(x, list):
                return [v for v in x if v]
            return [x]

        dates = normalize_list(request.query_params.getlist("date") or request.query_params.get("date"))
        aeroport_vals = normalize_list(request.query_params.getlist("aeroport") or request.query_params.get("aeroport"))
        vols = normalize_list(request.query_params.getlist("vol") or request.query_params.get("vol"))
        hotels = normalize_list(request.query_params.getlist("hotel") or request.query_params.get("hotel"))
        tos = normalize_list(request.query_params.getlist("to") or request.query_params.get("to"))

        if dates:
            qs = qs.filter(date__in=dates)
        if aeroport_vals:
            qs = qs.filter(Q(provenance__in=aeroport_vals) | Q(destination__in=aeroport_vals))
        if vols:
            qs = qs.filter(numero_vol__in=vols)
        if tos:
            qs = qs.filter(client_to__in=tos)

        # hotel est FK -> "hotel__nom"
        if hotels and _has_field(FicheMouvement, "hotel"):
            qs = qs.filter(Q(hotel__nom__in=hotels) | Q(hotel__isnull=False, hotel__nom__in=hotels))

        dates_agg = list(qs.values("date").annotate(dossiers=Count("id")).order_by("date"))
        aero_prov = list(qs.values("provenance").annotate(dossiers=Count("id")).order_by("provenance"))
        aero_dest = list(qs.values("destination").annotate(dossiers=Count("id")).order_by("destination"))
        vols_agg = list(qs.values("numero_vol").annotate(pax=Sum("pax")).order_by("numero_vol"))
        tos_agg = list(qs.values("client_to").annotate(pax=Sum("pax")).order_by("client_to"))

        hotels_agg = []
        if _has_field(FicheMouvement, "hotel"):
            hotels_agg = list(qs.values("hotel__nom").annotate(pax=Sum("pax")).order_by("hotel__nom"))

        return Response(
            {
                "dates": dates_agg,
                "aeroports": {"provenance": aero_prov, "destination": aero_dest},
                "vols": vols_agg,
                "client_to": tos_agg,
                "hotels": hotels_agg,
            }
        )
