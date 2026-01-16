# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any, Iterable, Optional, Tuple, Dict, List
import re
import unicodedata
from datetime import datetime, timedelta

import pandas as pd
from django.core.exceptions import PermissionDenied
from django.utils import timezone
from rest_framework.permissions import BasePermission
from decimal import Decimal
from uuid import UUID

from django.core.files import File
from django.db.models import Model, QuerySet


# ============================================================================
# Rôles / Agence / Permissions
# ============================================================================


# b2b/helpers.py
from django.core.exceptions import ObjectDoesNotExist

def _user_role(user) -> Optional[str]:
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "is_superuser", False):
        return "superadmin"
    try:
        return getattr(user, "profile").role
    except ObjectDoesNotExist:
        return None
    except AttributeError:
        return None

def _user_agence(user):
    try:
        return getattr(user, "profile").agence
    except ObjectDoesNotExist:
        return None
    except AttributeError:
        return None



class IsSuperAdminRole(BasePermission):
    """Permission DRF: autorise seulement les superadmins (ou superuser Django)."""

    def has_permission(self, request, view) -> bool:
        return _user_role(request.user) == "superadmin"


def _ensure_same_agence_or_superadmin(request, agence_obj_or_id: Any):
    """
    Lève PermissionDenied si l'utilisateur n'est pas superadmin et
    que l'agence ciblée est différente de la sienne.
    """
    role = _user_role(request.user)
    if role == "superadmin":
        return
    if role != "adminagence":
        raise PermissionDenied("Accès refusé.")
    my_agence = _user_agence(request.user)
    if not my_agence:
        raise PermissionDenied("Aucune agence associée au compte.")
    target_id = getattr(agence_obj_or_id, "id", agence_obj_or_id)
    if int(my_agence.id) != int(target_id):
        raise PermissionDenied("Vous n'avez pas accès à cette agence.")


# ============================================================================
# Génération de références
# ============================================================================


def generate_unique_reference(prefix: str, model_cls) -> str:
    """
    Génère une référence unique 'PREFIX-YYYYmmddHHMMSS' (avec suffixe -i si collision).
    """
    base = f"{prefix}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
    if not model_cls.objects.filter(reference=base).exists():
        return base
    i = 2
    while True:
        ref = f"{base}-{i}"
        if not model_cls.objects.filter(reference=ref).exists():
            return ref
        i += 1


# ============================================================================
# Fuzzy 'find_best_match' (light, sans embeddings)
# ============================================================================


def find_best_match(
    keywords: Iterable[str], columns: Iterable[str], min_score: float = 0.30
) -> Optional[str]:
    """
    Version légère: tente d'abord une égalité insensible à la casse/espaces,
    puis un 'substring contains'. Pas d'embeddings requis.
    """
    if not keywords or not columns:
        return None

    def norm(s: str) -> str:
        return "".join(ch for ch in str(s).strip().lower())

    kw_norm = [norm(k) for k in keywords if k]
    cols = list(columns)

    # égalité stricte (normalisée)
    for c in cols:
        cn = norm(c)
        if any(cn == k for k in kw_norm):
            return c

    # contains
    for c in cols:
        cn = norm(c)
        if any(k in cn for k in kw_norm):
            return c

    return None


# ============================================================================
# Parsing nombres
# ============================================================================


def _parse_int_cell(v: Any) -> int:
    """Retourne un entier >=0 depuis une cellule qui peut contenir texte/float/None."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0
    s = str(v).strip()
    if not s or s.lower() in {"nan", "none", "null", "-"}:
        return 0
    m = re.findall(r"\d+", s)
    if not m:
        try:
            return max(0, int(float(s)))
        except Exception:
            return 0
    try:
        return max(0, int(m[0]))
    except Exception:
        return 0


# ============================================================================
# Normalisation générique (texte / en-têtes / chaînes utiles)
# ============================================================================


def _norm_text(s: Any) -> str:
    """Supprime accents, compresse espaces, conserve la casse d'entrée (mais souvent on upper ensuite)."""
    if s is None:
        return ""
    s = str(s).strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s)


def _norm_header(s: Any) -> str:
    """Normalise un en-tête: ascii, lower, alphanum uniquement."""
    s = _norm_text(s).lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def _first_str(val: Any) -> Optional[str]:
    """Convertit une cellule en str propre ou None si vide/NA."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if s.lower() in {"", "nan", "none", "null", "-"}:
        return None
    # 123.0 -> 123
    if re.fullmatch(r"\d+\.0", s):
        s = s[:-2]
    return s or None


# ============================================================================
# Dates / Heures (robustes à Excel)
# ============================================================================


def _clean_time_cell(v: Any) -> Optional[str]:
    """Nettoie '12h40', '12.40', 0.5 (fraction Excel), '1240' -> '12:40'."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    # Excel fraction-of-day
    if isinstance(v, (int, float)) and 0 <= float(v) < 1:
        base = datetime(1899, 12, 30) + timedelta(days=float(v))
        return base.strftime("%H:%M")
    s = str(v).strip()
    if not s:
        return None
    s = s.replace(".", ":").replace("h", ":").replace("H", ":")
    s = re.sub(r"[^\d:]", "", s)
    m = re.search(r"\b(\d{1,2}):(\d{2})\b", s)
    if m:
        hh, mm = int(m.group(1)), int(m.group(2))
        if 0 <= hh <= 23 and 0 <= mm <= 59:
            return f"{hh:02d}:{mm:02d}"
    m = re.search(r"\b(\d{3,4})\b", s)
    if m:
        num = m.group(1)
        if len(num) == 3:
            hh, mm = int(num[0]), int(num[1:])
        else:
            hh, mm = int(num[:2]), int(num[2:])
        if 0 <= hh <= 23 and 0 <= mm <= 59:
            return f"{hh:02d}:{mm:02d}"
    return None


def _combine_datetime(day_val: Any, time_val: Any) -> Optional[datetime]:
    """Combine un jour + heure (tolérant) → datetime aware (timezone Django)."""
    if day_val is None or (isinstance(day_val, float) and pd.isna(day_val)):
        return None
    try:
        d = pd.to_datetime(day_val, dayfirst=True, errors="coerce")
    except Exception:
        d = pd.NaT
    if pd.isna(d):
        return None
    t_str = _clean_time_cell(time_val)
    if t_str:
        dt = pd.to_datetime(
            f"{d.date().isoformat()} {t_str}", dayfirst=True, errors="coerce"
        )
    else:
        dt = pd.to_datetime(d.date(), errors="coerce")
    if pd.isna(dt):
        return None
    py = dt.to_pydatetime()
    if timezone.is_naive(py):
        py = timezone.make_aware(py)
    return py


# ============================================================================
# IATA & D/A (Arrivée / Départ)
# ============================================================================

LOCAL_IATA: set[str] = {
    # Tunisie (à compléter si besoin)
    "TUN",
    "NBE",
    "MIR",
    "DJE",
    "SFA",
    "TBJ",
    "GAF",
    "TOE",
    "MVP",
}

KNOWN_IATA: set[str] = LOCAL_IATA | {
    # FR/UE (quelques grandes plateformes pour aider les heuristiques)
    "CDG",
    "ORY",
    "NCE",
    "LYS",
    "MRS",
    "BVA",
    "LIL",
    "TLS",
    "BOD",
    "NTE",
    "MUC",
    "FRA",
    "AMS",
    "MAD",
    "BCN",
    "LHR",
    "LGW",
    "STN",
    "FCO",
    "MXP",
    "BRU",
    "VIE",
    "ZRH",
    "IST",
    "ATH",
    "PMI",
    "AGP",
    "ORY",
    "EIN",
    "DUS",
    "HAM",
}

_IATA_RE = re.compile(r"\b([A-Z]{3})\b")


def extract_iata(val: Any) -> Optional[str]:
    """
    Tente d'extraire un code IATA (3 lettres) depuis une cellule.
    Ex: 'LYS' -> 'LYS'
        'Nice (NCE)' -> 'NCE'
        'TU 851 / TUNIS (TUN)' -> 'TUN'
    """
    s = _first_str(val)
    if not s:
        return None
    s = unicodedata.normalize("NFKD", s)
    s = re.sub(r"[\(\)\-\./]", " ", s.upper())
    s = re.sub(r"\s+", " ", s).strip()

    # cas simple (exactement 3 lettres)
    if len(s) == 3 and s.isalpha():
        return s

    # chercher IATA connu
    for m in _IATA_RE.finditer(s):
        code = m.group(1)
        if code in KNOWN_IATA:
            return code

    # fallback: premier token 3 lettres rencontré
    m = _IATA_RE.search(s)
    return m.group(1) if m else None


def normalize_flight_no(val: Any) -> str:
    """
    Normalise un numéro de vol: 'TU 851' -> 'TU851', 'tu851' -> 'TU851'.
    Laisse vide si None/NaN.
    """
    s = _first_str(val)
    if not s:
        return ""
    s = s.upper().replace(" ", "")
    # garder uniquement lettres+chiffres
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s


def resolve_airports_and_type(
    org_val: Any, dst_val: Any, da_val: Any = None
) -> Tuple[Optional[str], Optional[str], Optional[str], List[str]]:
    """
    Résout (departure, arrival, type_code) avec heuristiques sûres.
    type_code ∈ {'A','D', None}
    Règles:
      - si D/A explicite: 'A' => arrivée locale, 'D' => départ local.
      - sinon heuristique LOCAL_IATA: si DEST ∈ LOCAL_IATA -> arrivée,
        elif ORG ∈ LOCAL_IATA -> départ, sinon on garde ORG/DST tels quels.
    """
    errors: List[str] = []
    org = extract_iata(org_val)
    dst = extract_iata(dst_val)

    # type explicite
    t = (_first_str(da_val) or "").upper()
    t = (
        t.replace("ARRIVER", "ARRIVEE")
        .replace("ARRIVE", "ARRIVEE")
        .replace("ARRIVAL", "ARRIVEE")
        .replace("DEPARTURE", "DEPART")
        .replace("SALIDA", "DEPART")
    )
    if t in {"L", "A", "ARRIVEE"}:
        type_code = "A"
    elif t in {"S", "D", "DEPART"}:
        type_code = "D"
    else:
        type_code = None

    # heuristique sans D/A
    if type_code is None:
        if dst in LOCAL_IATA:
            type_code = "A"
        elif org in LOCAL_IATA:
            type_code = "D"

    # cohérence org/dst
    if not org or not dst:
        errors.append("ORIGIN/DEST manquants ou non IATA")
    if org and dst and org == dst:
        errors.append("Départ et arrivée identiques")

    return org, dst, type_code, errors


# ============================================================================
# Pool "non traités" (source de vérité côté serveur)
# ============================================================================



# b2b/views/helpers.py (extrait)
import re
import pandas as pd

ISO_DATE_RE = re.compile(r"^\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(:\d{2})?)?\s*$")
DMY_DATE_RE = re.compile(r"^\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}")  # 31/12/2025, 31-12-25, etc.

def _parse_date_auto(s: str):
    """Retourne un Timestamp (ou NaT) en choisissant intelligemment dayfirst."""
    if s is None:
        return pd.NaT
    s = str(s).strip()
    if not s:
        return pd.NaT

    # Format ISO -> dayfirst=False (année d'abord)
    if ISO_DATE_RE.match(s):
        # Si on a exactement 'YYYY-MM-DD HH:MM:SS', on peut préciser le format pour être 100% silencieux
        try:
            return pd.to_datetime(s, format="%Y-%m-%d %H:%M:%S", errors="coerce")
        except Exception:
            # sinon, laisse pandas inférer sans dayfirst
            return pd.to_datetime(s, dayfirst=False, errors="coerce")

    # Formats type 31/12/2025 -> dayfirst=True
    if DMY_DATE_RE.match(s):
        return pd.to_datetime(s, dayfirst=True, errors="coerce")

    # Autres cas: laisse pandas inférer (sans dayfirst pour éviter les warns ISO)
    return pd.to_datetime(s, errors="coerce")


def _combine_datetime(day_val, time_val):
    """
    Concatène date + heure, en normalisant la date avec _parse_date_auto.
    Retourne un datetime timezone-aware (ou None) selon ta logique existante.
    """
    # 1) parse de la date
    d = _parse_date_auto(day_val)

    # 2) heure: accepte 'HH:MM', 'HH:MM:SS', nombres Excel (fraction de jour), etc.
    t_str = None
    if isinstance(time_val, (int, float)):
        # fraction de jour Excel -> HH:MM
        minutes = int(round(float(time_val) * 24 * 60))
        hh = f"{minutes // 60:02d}"
        mm = f"{minutes % 60:02d}"
        t_str = f"{hh}:{mm}"
    else:
        s = str(time_val or "").strip()
        if re.match(r"^\d{1,2}:\d{2}(:\d{2})?$", s):
            t_str = s

    if pd.isna(d):
        return None

    # 3) assemble
    if t_str:
        # pandas est silencieux si on utilise un format explicite
        try:
            return pd.to_datetime(f"{d.date().isoformat()} {t_str}", format="%Y-%m-%d %H:%M", errors="coerce")
        except Exception:
            return pd.to_datetime(f"{d.date().isoformat()} {t_str}", errors="coerce")
    else:
        # pas d'heure -> début de journée
        return pd.to_datetime(f"{d.date().isoformat()} 00:00", format="%Y-%m-%d %H:%M", errors="coerce")




# ============================================================================
# Sérialisation JSON safe
# ============================================================================

def _fieldfile_to_str(f: File) -> str | None:
    # FieldFile / ImageFieldFile
    try:
        # souvent le plus stable en DB
        if getattr(f, "name", None):
            return f.name
        # optionnel: url si dispo
        if hasattr(f, "url"):
            return f.url
    except Exception:
        pass
    return None


def json_safe(obj):
    """
    Convertit récursivement un objet Python en structure JSON-serializable.
    """
    if obj is None:
        return None

    # primitives
    if isinstance(obj, (str, int, bool)):
        return obj
    if isinstance(obj, float):
        # éviter NaN/inf en JSON
        if obj != obj or obj in (float("inf"), float("-inf")):
            return None
        return obj

    # dates / heures
    if isinstance(obj, datetime):
        if timezone.is_naive(obj):
            obj = timezone.make_aware(obj, timezone.get_current_timezone())
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, time):
        return obj.strftime("%H:%M:%S")

    # Decimal / UUID
    if isinstance(obj, Decimal):
        return float(obj)  # ou str(obj) si tu veux zéro perte
    if isinstance(obj, UUID):
        return str(obj)

    # FieldFile / fichiers
    if isinstance(obj, File):
        return _fieldfile_to_str(obj)

    # Django objects
    if isinstance(obj, Model):
        return getattr(obj, "pk", None) or str(obj)
    if isinstance(obj, QuerySet):
        return [json_safe(x) for x in obj]

    # containers
    if isinstance(obj, dict):
        return {str(k): json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [json_safe(x) for x in obj]

    # fallback
    return str(obj)
