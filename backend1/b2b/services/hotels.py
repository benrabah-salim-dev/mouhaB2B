# backend1/b2b/services/hotels.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import requests
from django.conf import settings
from django.db import transaction

from b2b.models import Hotel, Zone


def _google_geocode(query: str, language: str = "fr"):
    """
    Google Geocoding API:
    retourne (lat, lng, formatted_address, place_id) ou None
    """
    api_key = getattr(settings, "GOOGLE_MAPS_API_KEY", None)
    if not api_key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY n'est pas configurée.")

    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": query, "key": api_key, "language": language}

    r = requests.get(url, params=params, timeout=10)
    r.raise_for_status()
    data = r.json()

    results = data.get("results") or []
    if not results:
        return None

    top = results[0]
    loc = (top.get("geometry") or {}).get("location") or {}
    lat = loc.get("lat")
    lng = loc.get("lng")
    if lat is None or lng is None:
        return None

    return float(lat), float(lng), top.get("formatted_address"), top.get("place_id")


def find_zone_for_point(lat: float, lng: float):
    """
    Retourne une zone qui contient le point (lat, lng).
    (Pour l'instant : 1ère zone matchée)
    """
    if lat is None or lng is None:
        return None

    for z in Zone.objects.all().order_by("id"):
        try:
            if z.contains_point(lat, lng):
                return z
        except Exception:
            continue
    return None


@transaction.atomic
def get_or_create_hotel_and_assign_zone(hotel_name: str, hint_text: str = None) -> Hotel | None:
    """
    - récupère l’hôtel depuis la DB
    - si lat/lng absents => geocoding Google
    - puis assigne zone si possible
    """
    name = (hotel_name or "").strip()
    if not name:
        return None

    hotel = Hotel.objects.filter(nom__iexact=name).first()
    if not hotel:
        hotel = Hotel.objects.create(nom=name)

    # si déjà enrichi et zone déjà trouvée => ok
    if hotel.lat is not None and hotel.lng is not None and hotel.zone_id is not None:
        return hotel

    # si coords manquent => appel Google
    if hotel.lat is None or hotel.lng is None:
        query = f"{name}, {hint_text}" if hint_text else name
        res = _google_geocode(query)
        if res:
            lat, lng, formatted_address, place_id = res
            hotel.lat = lat
            hotel.lng = lng
            hotel.formatted_address = formatted_address
            hotel.place_id = place_id

    # si coords ok et zone absente => calcule zone
    if hotel.lat is not None and hotel.lng is not None and hotel.zone_id is None:
        z = find_zone_for_point(hotel.lat, hotel.lng)
        if z:
            hotel.zone = z

    hotel.save()
    return hotel
