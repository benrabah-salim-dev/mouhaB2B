# b2b/services/geocoding.py
import os
import json
import urllib.parse
import urllib.request
from typing import Optional, Dict, Any, List

DEFAULT_TIMEOUT = float(os.getenv("GEO_TIMEOUT", "4.0"))
DEFAULT_USER_AGENT = os.getenv("GEO_USER_AGENT", "b2b-mouha/1.0 (+contact@example.com)")
DEFAULT_COUNTRY = os.getenv("GEO_DEFAULT_COUNTRY", "Tunisia").strip()  # ex: "Tunisia" ou "France"
DEFAULT_LANG = os.getenv("GEO_LANG", "fr").strip() or "fr"      # <- langue cible (fr par défaut)


def _fetch_json(url: str) -> Optional[dict]:
    """
    Appel HTTP simple avec User-Agent et Accept-Language pour orienter la langue
    de la réponse Nominatim.
    """
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": DEFAULT_USER_AGENT,
                "Accept-Language": DEFAULT_LANG,
            },
        )
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as f:
            return json.loads(f.read().decode("utf-8"))
    except Exception:
        return None


def _mk_query(hotel: str, city: Optional[str], postal: Optional[str], country: Optional[str]) -> str:
    parts = [hotel]
    if city:
        parts.append(city)
    if postal:
        parts.append(str(postal))
    if country:
        parts.append(country)
    return ", ".join([p for p in parts if p])


def _format_from_addressdetails(addr: Dict[str, Any]) -> Optional[str]:
    """
    Si display_name n'est pas exploitable (ou trop localisé),
    on reconstruit une adresse lisible en français à partir des composants.
    """
    if not isinstance(addr, dict):
        return None

    # ordre du plus précis au plus large
    parts_order: List[str] = [
        "house_number",
        "road",
        "neighbourhood",
        "suburb",
        "village",
        "town",
        "city",
        "county",
        "state",
        "postcode",
        "country",
    ]
    parts: List[str] = []
    for key in parts_order:
        val = addr.get(key)
        if val and str(val).strip():
            parts.append(str(val).strip())

    out = ", ".join(parts)
    return out if out else None


def lookup_hotel_address(
    hotel_name: str,
    city: Optional[str],
    postal: Optional[str],
    country: Optional[str] = None,
) -> Optional[str]:
    """
    Recherche via Nominatim (OpenStreetMap), localisée en français.
    - Utilise l'en-tête HTTP 'Accept-Language' et le paramètre 'accept-language=fr'
    - Essaie d'abord 'display_name', sinon reconstruit depuis 'address'
    - Fail-safe : retourne None si pas de résultat
    """
    if not hotel_name or not hotel_name.strip():
        return None

    country = country or DEFAULT_COUNTRY or None
    query = _mk_query(hotel_name.strip(), (city or "").strip() or None, (postal or "").strip() or None, country)

    qs = urllib.parse.urlencode(
        {
            "q": query,
            "format": "json",
            "limit": 1,
            "addressdetails": 1,
            "accept-language": DEFAULT_LANG,  # <- forcer la langue côté API
        }
    )
    url = f"https://nominatim.openstreetmap.org/search?{qs}"

    data = _fetch_json(url)
    if not data or not isinstance(data, list) or not data:
        return None

    item = data[0]
    # 1) Essayer le display_name (déjà localisé)
    disp = (item.get("display_name") or "").strip()
    if disp:
        return disp

    # 2) Sinon, reconstruire depuis addressdetails
    addr = item.get("address") or {}
    formatted = _format_from_addressdetails(addr)
    return formatted
