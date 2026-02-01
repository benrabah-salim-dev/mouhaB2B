# backend1/apps/views/zones.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import math
import random
import requests

from django.conf import settings

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.models import Zone
from apps.serializers import ZoneSerializer


# ========== Helpers Google ==========

def _reverse_city(lat: float, lng: float, language: str = "fr"):
    api_key = getattr(settings, "GOOGLE_MAPS_API_KEY", None)
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY n'est pas configurée dans les settings.")

    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"latlng": f"{lat},{lng}", "key": api_key, "language": language}

    r = requests.get(url, params=params, timeout=10)
    r.raise_for_status()
    data = r.json()

    results = data.get("results") or []
    if not results:
        return None

    city = None
    postal = None

    for comp in results[0].get("address_components", []):
        types = comp.get("types", [])
        if "locality" in types or "postal_town" in types:
            city = comp.get("long_name")
        elif "administrative_area_level_3" in types and not city:
            city = comp.get("long_name")
        elif "administrative_area_level_2" in types and not city:
            city = comp.get("long_name")

        if "postal_code" in types:
            postal = comp.get("long_name")

    if not city:
        return None

    return city, postal


def _sample_points_in_circle(center_lat: float, center_lng: float, radius_m: int, n: int = 20):
    points = []
    lat_meter = 111_320.0
    lng_meter = 111_320.0 * math.cos(math.radians(center_lat))

    for _ in range(n):
        u = random.random()
        v = random.random()
        w = radius_m * math.sqrt(u)
        theta = 2 * math.pi * v
        dx = w * math.cos(theta)
        dy = w * math.sin(theta)

        dlat = dy / lat_meter
        dlng = dx / lng_meter if lng_meter != 0 else 0

        lat = center_lat + dlat
        lng = center_lng + dlng
        points.append((lat, lng))

    return points


def _detect_cities_by_sampling(lat: float, lng: float, radius: int, language: str = "fr"):
    samples = _sample_points_in_circle(lat, lng, radius, n=20)
    cities = set()

    for s_lat, s_lng in samples:
        res = _reverse_city(s_lat, s_lng, language=language)
        if not res:
            continue
        city_name, postal = res
        if city_name:
            cities.add((city_name.upper(), postal))

    return cities


# ========== ViewSet ==========

class ZoneViewSet(viewsets.ModelViewSet):
    """
    Zones: globales (pas de champ agence dans le modèle).
    Donc: tout le monde voit toutes les zones.
    """
    queryset = Zone.objects.all().order_by("nom")
    serializer_class = ZoneSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Zone.objects.all().order_by("nom")

        # petit filtre optionnel par nom (si tu veux côté front)
        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(nom__icontains=q)

        return qs

    @action(detail=False, methods=["get"], url_path="suggest-villes")
    def suggest_cities(self, request):
        """
        GET /api/zones/suggest-villes/?lat=..&lng=..&radius=..
        """
        try:
            lat = float(request.query_params["lat"])
            lng = float(request.query_params["lng"])
            radius = int(request.query_params.get("radius", 10000))
        except (KeyError, ValueError):
            return Response({"detail": "Paramètres lat/lng/radius invalides ou manquants."}, status=400)

        try:
            sampled_cities = _detect_cities_by_sampling(lat, lng, radius, language="fr")
        except RuntimeError as e:
            return Response({"detail": str(e)}, status=500)
        except requests.RequestException as e:
            return Response({"detail": f"Erreur lors de l'appel à Google Geocoding : {e}"}, status=502)

        matched = [{"ville": city_upper, "code_postal": postal} for (city_upper, postal) in sampled_cities]
        matched.sort(key=lambda x: x["ville"])
        return Response(matched)
