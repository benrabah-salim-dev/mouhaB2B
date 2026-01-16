# b2b/views_calendar.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from django.utils.dateparse import parse_datetime
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from b2b.models import Mission, Vehicule, Chauffeur
from b2b.services.mission_planning import (
    get_vehicle_busy_reason,
    get_driver_busy_reason,
    get_vehicle_last_location,
    get_driver_last_location,
    INACTIVE_STATUSES,
)

def _parse_dt_or_400(s: str):
    dt = parse_datetime(s) if s else None
    if not dt:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


class CalendarMissionsAPIView(APIView):
    """
    GET /api/calendar/missions?from=2025-12-19T00:00:00Z&to=2025-12-20T00:00:00Z
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prof = getattr(request.user, "profile", None)
        agence_id = getattr(prof, "agence_id", None)
        if not agence_id:
            return Response({"detail": "Aucune agence."}, status=403)

        start = _parse_dt_or_400(request.query_params.get("from"))
        end = _parse_dt_or_400(request.query_params.get("to"))
        if not start or not end:
            return Response({"detail": "Paramètres from/to invalides (ISO datetime)."}, status=400)

        qs = (
            Mission.objects
            .filter(agence_id=agence_id)
            .exclude(statut__in=["CANCELLED"])
            .filter(date_heure_debut__lt=end, date_heure_fin__gt=start)
            .select_related("vehicule", "chauffeur")
            .order_by("date_heure_debut")
        )

        out = []
        for m in qs:
            out.append({
                "id": m.id,
                "reference": m.reference,
                "type": m.type,
                "statut": getattr(m, "statut", None),
                "start": m.date_heure_debut,
                "end": m.date_heure_fin,
                "vehicule_id": m.vehicule_id,
                "chauffeur_id": m.chauffeur_id,
                "lieu_depart": getattr(m, "lieu_depart", None),
                "lieu_arrivee": getattr(m, "lieu_arrivee", None),
                "pax": getattr(m, "pax", 0),
            })

        return Response(out, status=200)


class CalendarResourcesAPIView(APIView):
    """
    GET /api/calendar/resources?from=...&to=...
    Retourne véhicules + chauffeurs avec busy + location + busy_reason.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prof = getattr(request.user, "profile", None)
        agence_id = getattr(prof, "agence_id", None)
        if not agence_id:
            return Response({"detail": "Aucune agence."}, status=403)

        start = _parse_dt_or_400(request.query_params.get("from"))
        end = _parse_dt_or_400(request.query_params.get("to"))
        if not start or not end:
            return Response({"detail": "Paramètres from/to invalides (ISO datetime)."}, status=400)

        vehicules = Vehicule.objects.filter(agence_id=agence_id).order_by("immatriculation")
        chauffeurs = Chauffeur.objects.filter(agence_id=agence_id).order_by("nom", "prenom")

        v_out = []
        for v in vehicules:
            reason = get_vehicle_busy_reason(v.id, agence_id, start, end)
            v_out.append({
                "id": v.id,
                "label": str(v),
                "type": getattr(v, "type", None),
                "capacite": getattr(v, "capacite", None),
                "busy": bool(reason),
                "busy_reason": reason,
                "location": get_vehicle_last_location(v, ref_dt=start),
                "last_lat": getattr(v, "last_lat", None),
                "last_lng": getattr(v, "last_lng", None),
            })

        c_out = []
        for c in chauffeurs:
            reason = get_driver_busy_reason(c.id, agence_id, start, end)
            c_out.append({
                "id": c.id,
                "label": str(c),
                "busy": bool(reason),
                "busy_reason": reason,
                "location": get_driver_last_location(c, ref_dt=start),
            })

        return Response({"vehicules": v_out, "chauffeurs": c_out}, status=200)
