# backend1/apps/views/dossiers_to_fiche.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import date as _date
from collections import defaultdict

from django.db import transaction
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.models import Dossier, FicheMouvement, AgenceVoyage
from apps.views.helpers import _ensure_same_agence_or_superadmin


DEPART_TYPES = ("D", "S")
ARRIVEE_TYPES = ("A", "L")


def _safe_int(v, default=0):
    try:
        return int(v or 0)
    except Exception:
        return default


def _parse_date(s):
    # accepte "YYYY-MM-DD"
    if not s:
        return None
    try:
        return timezone.datetime.fromisoformat(str(s)).date()
    except Exception:
        try:
            return timezone.datetime.strptime(str(s), "%Y-%m-%d").date()
        except Exception:
            return None


def _clean_ref(s):
    return (s or "").strip()

class DossiersToFicheAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        agence_id = request.query_params.get("agence")
        kind = (request.query_params.get("kind") or "").strip().lower()

        if not agence_id:
            return Response(
                {"detail": "Paramètre 'agence' obligatoire."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ✅ sécurité agence
        _ensure_same_agence_or_superadmin(request, int(agence_id))

        qs = Dossier.objects.filter(agence_id=agence_id)

        # ✅ SOURCE DE VÉRITÉ : disponible si pas lié à une fiche
        qs = qs.filter(fiche_mouvement__isnull=True)

        # (Optionnel) tu peux garder, mais ça ne doit pas être la condition principale
        # qs = qs.filter(is_transformed=False)

        if kind == "depart":
            qs = qs.filter(type_mouvement__in=DEPART_TYPES)
        elif kind == "arrivee":
            qs = qs.filter(type_mouvement__in=ARRIVEE_TYPES)

        qs = qs.select_related("hotel_fk", "hotel_fk__zone", "zone_fk")

        data = []
        for d in qs.order_by("date", "hotel", "titulaire"):
            hotel_label = d.hotel or (d.hotel_fk.nom if getattr(d, "hotel_fk_id", None) else None)
            hotel_lat = getattr(d.hotel_fk, "lat", None) if getattr(d, "hotel_fk_id", None) else None
            hotel_lng = getattr(d.hotel_fk, "lng", None) if getattr(d, "hotel_fk_id", None) else None

            zone_obj = None
            if getattr(d, "zone_fk_id", None):
                zone_obj = d.zone_fk
            elif getattr(d, "hotel_fk_id", None) and getattr(d.hotel_fk, "zone_id", None):
                zone_obj = d.hotel_fk.zone

            zone_id = zone_obj.id if zone_obj else None
            zone_nom = getattr(zone_obj, "nom", None) if zone_obj else None
            if not zone_nom:
                zone_nom = getattr(zone_obj, "ville", None) if zone_obj else None

            data.append(
                {
                    "id": d.id,
                    "dossier_id": d.id,
                    "type": d.type_mouvement,
                    "date": d.date.isoformat() if d.date else None,
                    "hotel": hotel_label,

                    "zone_id": zone_id,
                    "zone_nom": zone_nom or "—",
                    "hotel_lat": hotel_lat,
                    "hotel_lng": hotel_lng,

                    "titulaire": getattr(d, "titulaire", None),
                    "pax": d.pax,
                    "numero_vol": d.numero_vol,
                    "provenance": d.provenance,
                    "destination": d.destination,
                    "horaires": d.horaires.isoformat() if d.horaires else None,
                    "client_to": d.client,
                    "reference": getattr(d, "reference", None),
                    "observation": getattr(d, "observation", None),
                }
            )

        return Response(data, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        payload = request.data or {}

        agence_id = payload.get("agence")
        dossier_ids = payload.get("dossier_ids") or []
        kind = (payload.get("kind") or "").strip().lower()
        date_str = payload.get("date")
        numero_vol = (payload.get("numero_vol") or "").strip() or None
        aeroport = (payload.get("aeroport") or "").strip() or None

        if not agence_id or not dossier_ids:
            return Response(
                {"detail": "Champs 'agence' et 'dossier_ids' sont obligatoires."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ✅ sécurité agence
        _ensure_same_agence_or_superadmin(request, int(agence_id))

        try:
            agence = AgenceVoyage.objects.get(pk=agence_id)
        except AgenceVoyage.DoesNotExist:
            return Response({"detail": "Agence inconnue."}, status=status.HTTP_400_BAD_REQUEST)

        # ✅ on ne prend QUE des dossiers encore dispo (pas déjà liés à une fiche)
        dossiers = list(
            Dossier.objects.select_for_update()
            .filter(agence=agence, id__in=dossier_ids, fiche_mouvement__isnull=True)
            .select_related("hotel_fk")
        )

        if not dossiers:
            return Response(
                {"detail": "Tous ces dossiers sont déjà reliés à une fiche (ou inexistants)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # type mouvement
        if kind == "arrivee":
            type_mvt = "A"
        elif kind == "depart":
            type_mvt = "D"
        else:
            type_mvt = (dossiers[0].type_mouvement or "A").strip().upper()

        # date
        date_val = _parse_date(date_str) or dossiers[0].date or timezone.now().date()

        # horaires (la plus tôt)
        horaires_list = [d.horaires for d in dossiers if d.horaires]
        horaires_val = min(horaires_list) if horaires_list else None

        # aéroport
        if aeroport:
            if type_mvt in DEPART_TYPES:
                provenance_val = None
                destination_val = aeroport
            else:
                provenance_val = aeroport
                destination_val = None
        else:
            provenance_val = dossiers[0].provenance
            destination_val = dossiers[0].destination

        pax_total = sum(_safe_int(getattr(d, "pax", 0)) for d in dossiers)
        adulte_total = sum(_safe_int(getattr(d, "adulte", 0)) for d in dossiers)
        enfants_total = sum(_safe_int(getattr(d, "enfants", 0)) for d in dossiers)
        bebe_total = sum(_safe_int(getattr(d, "bb_gratuit", getattr(d, "bebe", 0))) for d in dossiers)

        # hotel commun ?
        hotel_fk_id = dossiers[0].hotel_fk_id
        same_hotel = hotel_fk_id and all(d.hotel_fk_id == hotel_fk_id for d in dossiers)
        hotel_obj = dossiers[0].hotel_fk if same_hotel else None

        # multi hôtels -> hotel_schedule
        hotel_schedule = []
        if not same_hotel:
            by_hotel = defaultdict(int)
            for d in dossiers:
                label = d.hotel or (d.hotel_fk.nom if d.hotel_fk_id else "—")
                by_hotel[label] += _safe_int(getattr(d, "pax", 0))
            hotel_schedule = [{"hotel": h, "pax": p} for h, p in by_hotel.items()]

        dossier_refs = [_clean_ref(getattr(d, "reference", "")) for d in dossiers]
        dossier_refs = [r for r in dossier_refs if r]

        if len(dossiers) == 1:
            base_ref = dossier_refs[0] if dossier_refs else f"DOS-{dossiers[0].id}"
        else:
            base_ref = f"AG{agence.id}-{len(dossiers)}DOS"

        ref = f"{base_ref}-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"[:50]

        observations = []
        for d in dossiers:
            if d.observation:
                obs = d.observation.strip()
                if obs and obs not in observations:
                    observations.append(obs)
        observation_val = " | ".join(observations) if observations else None

        fiche = FicheMouvement.objects.create(
            ref=ref,
            agence=agence,
            type=type_mvt,
            date=date_val,
            horaires=horaires_val,
            provenance=provenance_val,
            destination=destination_val,
            numero_vol=numero_vol or dossiers[0].numero_vol,
            client_to=dossiers[0].client,
            pax=pax_total,
            adulte=adulte_total,
            enfants=enfants_total,
            bebe=bebe_total,
            hotel=hotel_obj,
            hotel_schedule=hotel_schedule,
            observation=observation_val,
            created_by=request.user,
        )

        # ✅ lien dossier -> fiche
        for d in dossiers:
            d.fiche_mouvement = fiche
            d.is_transformed = True
            d.save(update_fields=["fiche_mouvement", "is_transformed"])

        return Response({"fiche_ids": [fiche.id]}, status=status.HTTP_201_CREATED)
