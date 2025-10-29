# -*- coding: utf-8 -*-
from __future__ import annotations
from datetime import datetime
from django.utils import timezone
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from b2b.serializers import UserSerializer
from ..models import Vehicule, OrdreMission

def _overlap(qs, start, end, start_field="date_depart", end_field="date_retour"):
    if not start or not end: return qs
    cond = Q(**{f"{end_field}__gt": start}) & Q(**{f"{start_field}__lt": end})
    return qs.filter(cond)

def _parse_dt_param(s):
    if not s: return None
    try: dt = datetime.fromisoformat(s)
    except Exception: return None
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt

class PublicRentoutListAPIView(APIView):
    permission_classes = [AllowAny]
    def get(self, request):
        exclude_agence = request.query_params.get("exclude_agence")
        type_veh = (request.query_params.get("type") or "").strip().lower()
        min_cap = request.query_params.get("min_capacity")

        qs = Vehicule.objects.select_related("agence").all()
        if type_veh: qs = qs.filter(type__iexact=type_veh)
        if exclude_agence: qs = qs.exclude(agence_id=exclude_agence)
        try:
            if min_cap is not None: qs = qs.filter(capacite__gte=int(min_cap))
        except Exception: pass

        data = [{
            "id": v.id, "type": v.type, "marque": v.marque, "model": v.model,
            "capacite": v.capacite, "immatriculation": v.immatriculation,
            "agence_id": v.agence_id, "agence_nom": getattr(v.agence, "nom", ""),
            "modes_location": ["demi_journee","journee"],
        } for v in qs]
        return Response({"rentout": data}, status=200)

class PublicRideshareListAPIView(APIView):
    permission_classes = [AllowAny]
    def _infer_type(self, dossier):
        if getattr(dossier, "heure_depart", None) and not getattr(dossier, "heure_arrivee", None): return "D"
        if getattr(dossier, "heure_arrivee", None) and not getattr(dossier, "heure_depart", None): return "A"
        return None
    def _mission_pax(self, mission):
        d = getattr(mission.premission, "dossier", None)
        if not d: return 0
        t = self._infer_type(d)
        if t == "A": return int(getattr(d, "nombre_personnes_arrivee", 0) or 0)
        if t == "D": return int(getattr(d, "nombre_personnes_retour", 0) or 0)
        return max(int(getattr(d, "nombre_personnes_arrivee", 0) or 0),
                   int(getattr(d, "nombre_personnes_retour", 0) or 0))
    def get(self, request):
        exclude_agence = request.query_params.get("exclude_agence")
        date_from = _parse_dt_param(request.query_params.get("date_from"))
        date_to   = _parse_dt_param(request.query_params.get("date_to"))
        destination = (request.query_params.get("destination") or "").strip()
        origin      = (request.query_params.get("origin") or "").strip()

        qs = _overlap(
            OrdreMission.objects.select_related(
                "vehicule","chauffeur","mission","mission__premission","mission__premission__agence","mission__premission__dossier"
            ),
            date_from, date_to
        )

        data = []
        for om in qs:
            v, m = om.vehicule, om.mission
            if not v: continue
            agence = getattr(m.premission, "agence", None)
            if exclude_agence and getattr(agence, "id", None) and str(agence.id) == str(exclude_agence): continue
            pax = self._mission_pax(m); cap = int(getattr(v,"capacite",0) or 0)
            dispo = max(0, cap - pax)
            if dispo <= 0: continue
            traj = (om.trajet or "").strip()
            if destination and destination.lower() not in traj.lower(): continue
            if origin:
                d = getattr(m.premission, "dossier", None)
                cands = [getattr(d,"ville",""), getattr(d,"aeroport_depart",""), getattr(d,"aeroport_arrivee","")]
                if not any(origin.lower() in str(c).lower() for c in cands): continue
            data.append({
                "ordre_id": om.id, "mission_id": m.id, "vehicule_id": v.id,
                "vehicule": {
                    "type": v.type, "marque": v.marque, "model": v.model,
                    "capacite": v.capacite, "immatriculation": v.immatriculation,
                },
                "agence_id": getattr(agence,"id",None), "agence_nom": getattr(agence,"nom",""),
                "trajet": traj, "date_depart": om.date_depart, "date_retour": om.date_retour,
                "places_disponibles": dispo, "pax_deja_reserves": pax,
            })
        data.sort(key=lambda x: (-x["places_disponibles"], x["date_depart"] or timezone.now()))
        return Response({"rideshare": data}, status=200)

class PublicResourceSearchAPIView(APIView):
    permission_classes = [AllowAny]
    def get(self, request):
        # rentout
        rentout = PublicRentoutListAPIView().get(request).data["rentout"]
        # rideshare (avec paramètres spécifiques)
        rideshare = PublicRideshareListAPIView().get(request).data["rideshare"]
        return Response({"rentout": rentout, "rideshare": rideshare}, status=200)
    
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data, status=200)