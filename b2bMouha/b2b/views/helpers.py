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

# ============================================================================
# Rôles / Agence / Permissions
# ============================================================================


def _user_role(user) -> Optional[str]:
    """Retourne 'superadmin', 'adminagence' ou None."""
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "is_superuser", False):
        return "superadmin"
    prof = getattr(user, "profile", None)
    return getattr(prof, "role", None)


def _user_agence(user):
    """Retourne l'agence associée au profil (ou None)."""
    prof = getattr(user, "profile", None)
    return getattr(prof, "agence", None)


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


def queryset_dossiers_non_traite(agence):
    """
    Retourne un QuerySet des Dossier de l'agence passés dans AUCUN FicheMouvementItem.
    Utilisé pour masquer les dossiers déjà affectés à une fiche.
    """
    from django.db.models import Exists, OuterRef
    from b2b.models import Dossier, FicheMouvementItem

    used_qs = FicheMouvementItem.objects.filter(dossier_id=OuterRef("pk"))
    return (
        Dossier.objects.filter(agence=agence)
        .annotate(is_used=Exists(used_qs))
        .filter(is_used=False)
        .select_related("hotel")
        .order_by("-heure_arrivee", "-heure_depart", "-id")
    )
