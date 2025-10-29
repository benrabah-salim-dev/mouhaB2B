# b2b/views/importers.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import io
import re
import difflib
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from openpyxl import load_workbook

from b2b.models import (
    AgenceVoyage,
    Dossier,
    Hotel,
    Vehicule,
    Chauffeur,
    FicheMouvement,
    FicheMouvementItem,
)

# ImportBatch peut être absent — on l'importe en souple
try:
    from b2b.models import ImportBatch, ImportBatchItem  # type: ignore
    HAS_BATCH = True
except Exception:
    ImportBatch = None  # type: ignore
    ImportBatchItem = None  # type: ignore
    HAS_BATCH = False

from b2b.views.helpers import (
    _ensure_same_agence_or_superadmin,
    _norm_header,
    _first_str,
    _parse_int_cell,
    _combine_datetime,
    normalize_flight_no,
    resolve_airports_and_type,
)

# ---------------------------------------------------------------------
# Lecture Excel robuste (buffer mémoire + CSV + multi-feuilles)
# ---------------------------------------------------------------------

def _norm_local(s: Any) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = str(s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower().strip().replace("_", " ")
    s = re.sub(r"\s+", " ", s)
    return s


_EXPECTED_TOKENS = {
    "date","horaire","horaires","hora","provenance","org","origen","destination","dst","destino",
    "d/a","a/d","l/s","ls","depart/arriver","type","mouvement","n° vol","n vol","vuelo","flight","vol",
    "client/ to","client to","to","t.o.","tour operateur","tour opérateur","tour operador","hotel","hôtel",
    "ref","référence","reference","ntra.ref","ref t.o.","ref to","titulaire","tetulaire","titular","name",
    "holder","pax","passengers","adultes","adultos","enfants","niños","ninos","bb/gratuit","bebe","bebes",
    "observation","observations","coment","comentario","comments"
}

def _score_header_row(series: pd.Series) -> float:
    cells = [_norm_local(v) for v in series.tolist()]
    if not any(cells):
        return -1e9
    non_empty = sum(1 for c in cells if c)
    if non_empty < 2:
        return -1e9
    score = 0.0
    for c in cells:
        if not c:
            continue
        if any(tok in c for tok in _EXPECTED_TOKENS):
            score += 2.0
        if re.search(r"\d{3,}", c):
            score -= 0.25
    score += 0.15 * non_empty
    return score

def _tidy_df(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.dropna(axis=1, how="all").dropna(how="all")
    if df.empty:
        return pd.DataFrame()
    # colonnes
    fixed_cols, used = [], set()
    for i, c in enumerate(df.columns):
        nc = (c if isinstance(c, str) else "") or ""
        nc = nc.strip()
        if not nc or re.match(r"^unnamed", nc, re.I):
            nc = f"col_{i+1}"
        k = nc
        j = 2
        while k in used:
            k = f"{nc}_{j}"; j += 1
        used.add(k)
        fixed_cols.append(k)
    df.columns = fixed_cols
    # supprimer colonnes vides du début (tableau décalé)
    while df.shape[1] > 0:
        first_col = df.iloc[:, 0]
        ratio_nan = first_col.isna().mean()
        ratio_blank = (first_col.astype(str).str.strip() == "").mean()
        if max(ratio_nan, ratio_blank) >= 0.95:
            df = df.iloc[:, 1:]
        else:
            break
    # trim object
    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].apply(lambda x: x.strip() if isinstance(x, str) else x)
    df = df.dropna(how="all")
    return df if not df.empty else pd.DataFrame()

def smart_read_excel(file_like, max_header_scan: int = 200) -> pd.DataFrame:
    # charge en mémoire (évite curseur épuisé)
    if hasattr(file_like, "read"):
        raw_bytes = file_like.read()
    else:
        raw_bytes = file_like if isinstance(file_like, (bytes, bytearray)) else bytes(file_like)
    if not raw_bytes:
        return pd.DataFrame()
    bio = io.BytesIO(raw_bytes)
    filename = getattr(file_like, "name", "") or getattr(file_like, "filename", "") or ""

    # CSV rapide
    if filename.lower().endswith(".csv"):
        try:
            bio.seek(0)
            df = pd.read_csv(bio, dtype=str, keep_default_na=True)
            if df.empty:
                return pd.DataFrame()
            if any(str(c).lower().startswith("unnamed") for c in df.columns):
                bio.seek(0)
                raw = pd.read_csv(bio, header=None, dtype=str, keep_default_na=True)
                limit = min(max_header_scan, len(raw))
                best, header_idx = -1e9, 0
                for i in range(limit):
                    s = _score_header_row(raw.iloc[i])
                    if s > best:
                        best, header_idx = s, i
                headers = raw.iloc[header_idx].tolist()
                df = raw.iloc[header_idx+1:].copy()
                df.columns = headers
            return _tidy_df(df)
        except Exception:
            pass

    # Excel multi-feuilles
    def _parse_excel_from_memory() -> pd.DataFrame:
        try:
            bio.seek(0)
            xls = pd.ExcelFile(bio)
            sheets = xls.sheet_names or [0]
        except Exception:
            try:
                bio.seek(0)
                raw = pd.read_excel(bio, header=None, dtype=str)
                raw = raw.applymap(lambda x: x.strip() if isinstance(x, str) else x)

                limit = min(max_header_scan, len(raw))
                best, header_idx = -1e9, 0
                for i in range(limit):
                    s = _score_header_row(raw.iloc[i])
                    if s > best:
                        best, header_idx = s, i
                headers = raw.iloc[header_idx].tolist()
                df = raw.iloc[header_idx+1:].copy()
                df.columns = headers
                return _tidy_df(df)
            except Exception:
                return pd.DataFrame()

        for sh in sheets:
            try:
                raw = xls.parse(sh, header=None, dtype=str)
            except Exception:
                continue
            if raw is None or raw.empty:
                continue
            raw = raw.applymap(lambda x: x.strip() if isinstance(x, str) else x)
            limit = min(max_header_scan, len(raw))
            best, header_idx = -1e9, 0
            for i in range(limit):
                s = _score_header_row(raw.iloc[i])
                if s > best:
                    best, header_idx = s, i
            if best < -1e8:
                for i in range(min(200, len(raw))):
                    row = raw.iloc[i].astype(str).str.strip().replace("nan", "")
                    if row.astype(bool).any():
                        header_idx = i; break
            headers = raw.iloc[header_idx].tolist()
            df = raw.iloc[header_idx+1:].copy()
            df.columns = headers
            df = _tidy_df(df)
            if not df.empty:
                return df
        return pd.DataFrame()

    return _parse_excel_from_memory()


def _fuzzy_best_match(keywords: List[str], columns: List[str], min_ratio: float = 0.65) -> Optional[str]:
    if not columns:
        return None
    cols_norm = {c: _norm_header(c) for c in columns}
    best_c, best_r = None, 0.0
    for c, n in cols_norm.items():
        for k in keywords:
            r = difflib.SequenceMatcher(a=_norm_header(k), b=n).ratio()
            if r > best_r:
                best_c, best_r = c, r
    return best_c if best_r >= min_ratio else None


def _find_col(df: pd.DataFrame, *keyword_groups: List[str], prefer: Optional[str] = None) -> Optional[str]:
    norm_map: Dict[str, List[str]] = {}
    for c in df.columns:
        norm_map.setdefault(_norm_header(c), []).append(c)

    for group in keyword_groups:
        for k in group:
            k_norm = _norm_header(k)
            if k_norm in norm_map:
                cols = norm_map[k_norm]
                if prefer and prefer in cols:
                    return prefer
                return cols[0]

    for group in keyword_groups:
        for k in group:
            k_norm = _norm_header(k)
            candidates = [orig for norm, lst in norm_map.items() if k_norm in norm for orig in lst]
            if candidates:
                if prefer and prefer in candidates:
                    return prefer
                return candidates[0]
    return None


# ---------------------------------------------------------------------
# Import Dossiers
# ---------------------------------------------------------------------

# -*- coding: utf-8 -*-

import io
from typing import Any, Dict, List, Optional

import pandas as pd
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import (
    AgenceVoyage,
    Dossier,
    Hotel,
    ImportBatch,
    ImportBatchItem,
)
from b2b.serializers import DossierSerializer
from b2b.views.helpers import _ensure_same_agence_or_superadmin

# ---------- Helpers basiques lecture Excel (compact) ----------

def _read_excel_to_df(uploaded_file) -> pd.DataFrame:
    data = uploaded_file.read()
    if not data:
        return pd.DataFrame()
    bio = io.BytesIO(data)
    try:
        df = pd.read_excel(bio, dtype=str)
    except Exception:
        bio.seek(0)
        try:
            df = pd.read_csv(bio, dtype=str)
        except Exception:
            return pd.DataFrame()
    # Trim colonnes
    df.columns = [str(c).strip() for c in df.columns]
    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].apply(lambda v: (str(v).strip() if isinstance(v, str) else v))
    return df.fillna("")


def _get(df: pd.DataFrame, row: pd.Series, keys: List[str]) -> str:
    for k in keys:
        if k in df.columns:
            v = row.get(k)
            if v is not None:
                s = str(v).strip()
                if s and s.lower() not in {"nan", "none", "null"}:
                    return s
    return ""


def _normalize_row(df: pd.DataFrame, row: pd.Series) -> Dict[str, Any]:
    """
    Transforme une ligne brute en dict Dossier "standard".
    Adapte ici les noms de colonnes à ton format réel.
    """
    # colonnes candidates (à adapter si besoin)
    k_ref = ["Ref", "Référence", "Reference", "N dossier", "N° dossier", "Ntra.Ref", "Ref.T.O.", "Ref TO"]
    k_date = ["Date", "DATE", "Dia", "Fecha"]
    k_heure = ["Heure", "Horaire", "Hora", "Time", "Horaires"]
    k_type = ["Type", "D/A", "L/S", "Mouvement"]
    k_aero_arr = ["Aéroport arrivée", "Aeroport arrivee", "Destination", "Dst"]
    k_aero_dep = ["Aéroport départ", "Aeroport depart", "Origine", "Org"]
    k_vol = ["N° VOL", "N VOL", "Vol", "Vuelo", "Flight"]
    k_to = ["T.O.", "TO", "Client / TO", "Client TO", "Tour Operateur", "Tour Opérateur"]
    k_ville = ["Ville", "Ciudad", "Zone"]
    k_hotel = ["Hôtel", "Hotel"]
    k_obs = ["Observation", "Observations", "Remark", "Remarque"]
    k_pax_ad = ["Adultes", "Adulte", "Adults"]
    k_pax_enf = ["Enfants", "Children"]
    k_pax_bb = ["BB", "Bebe", "Infant"]

    ref = _get(df, row, k_ref)
    if not ref:
        return {}

    # dates/heures simplifiées (on laisse le backend stocker texte → DateTime si déjà formaté)
    date_val = _get(df, row, k_date)
    heure_val = _get(df, row, k_heure)
    type_val = _get(df, row, k_type).upper()
    is_arr = "A" in type_val or "ARR" in type_val
    is_dep = "D" in type_val or "DEP" in type_val

    # pax
    def _to_int(s: str) -> int:
        try:
            return int(float(s))
        except Exception:
            return 0

    pax = _to_int(_get(df, row, k_pax_ad)) + _to_int(_get(df, row, k_pax_enf)) + _to_int(_get(df, row, k_pax_bb))

    # hôtel (création à la volée si nécessaire)
    hotel_name = _get(df, row, k_hotel)
    hotel_obj = None
    if hotel_name:
        hotel_obj = Hotel.objects.filter(nom__iexact=hotel_name).first()
        if not hotel_obj:
            hotel_obj = Hotel.objects.create(nom=hotel_name)

    out: Dict[str, Any] = dict(
        reference=ref,
        ville=_get(df, row, k_ville),
        aeroport_arrivee=_get(df, row, k_aero_arr),
        aeroport_depart=_get(df, row, k_aero_dep),
        num_vol_arrivee=_get(df, row, k_vol) if is_arr else "",
        num_vol_retour=_get(df, row, k_vol) if is_dep else "",
        heure_arrivee=f"{date_val} {heure_val}".strip() if is_arr else None,
        heure_depart=f"{date_val} {heure_val}".strip() if is_dep else None,
        hotel=hotel_obj,
        nombre_personnes_arrivee=pax if is_arr else 0,
        nombre_personnes_retour=pax if is_dep else 0,
        nom_reservation="",  # à compléter si tu as une colonne
        tour_operateur=_get(df, row, k_to),
        observation=_get(df, row, k_obs),
    )
    return out


# ---------- Vue principale d’import ----------

# -*- coding: utf-8 -*-

from typing import Any, Dict, List, Optional
import re

import pandas as pd
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import AgenceVoyage, Dossier, Hotel, FicheMouvement, FicheMouvementItem

# Import souple du batch
try:
    from b2b.models import ImportBatch, ImportBatchItem  # type: ignore
    HAS_BATCH = True
except Exception:
    ImportBatch = None  # type: ignore
    ImportBatchItem = None  # type: ignore
    HAS_BATCH = False

# Helpers (déjà dans tes fichiers)
from b2b.views.helpers import (                   # :contentReference[oaicite:2]{index=2}
    _ensure_same_agence_or_superadmin,
    _norm_header,
    _first_str,
    _parse_int_cell,
    _combine_datetime,
    normalize_flight_no,
    resolve_airports_and_type,
)
from b2b.views.importers import (                 # :contentReference[oaicite:3]{index=3}
    smart_read_excel,
)


# b2b/views/importers.py (extrait) — CLASS COMPLETE

import re
from datetime import time
from typing import Any, Dict, List, Optional

import pandas as pd
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import AgenceVoyage, Dossier, Hotel, FicheMouvement, FicheMouvementItem

# ImportBatch peut être absent — on l'importe en souple
try:
    from b2b.models import ImportBatch, ImportBatchItem  # type: ignore
    HAS_BATCH = True
except Exception:
    ImportBatch = None  # type: ignore
    ImportBatchItem = None  # type: ignore
    HAS_BATCH = False

# Helpers déjà présents dans ton projet
from b2b.views.helpers import (
    _ensure_same_agence_or_superadmin,
    _norm_header,
    _first_str,
    _parse_int_cell,
    normalize_flight_no,
)
from b2b.views.importers import smart_read_excel


# b2b/views/importers.py
# -*- coding: utf-8 -*-

import io
import re
import unicodedata
import difflib
from datetime import time
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from openpyxl import load_workbook

from b2b.models import (
    AgenceVoyage,
    Dossier,
    Hotel,
    Vehicule,
    Chauffeur,
    FicheMouvement,
    FicheMouvementItem,
)

# ImportBatch peut être absent — on l'importe en souple
try:
    from b2b.models import ImportBatch, ImportBatchItem  # type: ignore
    HAS_BATCH = True
except Exception:
    ImportBatch = None  # type: ignore
    ImportBatchItem = None  # type: ignore
    HAS_BATCH = False

from b2b.views.helpers import (
    _ensure_same_agence_or_superadmin,
    _norm_header,
    _first_str,
    _parse_int_cell,
    _combine_datetime,
    normalize_flight_no,
    resolve_airports_and_type,
)

# ---------------------------------------------------------------------
# Lecture Excel robuste (buffer mémoire + CSV + multi-feuilles)
# ---------------------------------------------------------------------

def _norm_local(s: Any) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = str(s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower().strip().replace("_", " ")
    s = re.sub(r"\s+", " ", s)
    return s


_EXPECTED_TOKENS = {
    "date","horaire","horaires","hora","provenance","org","origen","destination","dst","destino",
    "d/a","a/d","l/s","ls","depart/arriver","type","mouvement","n° vol","n vol","vuelo","flight","vol",
    "client/ to","client to","to","t.o.","tour operateur","tour opérateur","tour operador","hotel","hôtel",
    "ref","référence","reference","ntra.ref","ref t.o.","ref to","titulaire","tetulaire","titular","name",
    "holder","pax","passengers","adultes","adultos","enfants","niños","ninos","bb/gratuit","bebe","bebes",
    "observation","observations","coment","comentario","comments","ville","city","ciudad","postal","zip","code postal"
}

def _score_header_row(series: pd.Series) -> float:
    cells = [_norm_local(v) for v in series.tolist()]
    if not any(cells):
        return -1e9
    non_empty = sum(1 for c in cells if c)
    if non_empty < 2:
        return -1e9
    score = 0.0
    for c in cells:
        if not c:
            continue
        if any(tok in c for tok in _EXPECTED_TOKENS):
            score += 2.0
        if re.search(r"\d{3,}", c):
            score -= 0.25
    score += 0.15 * non_empty
    return score

def _tidy_df(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.dropna(axis=1, how="all").dropna(how="all")
    if df.empty:
        return pd.DataFrame()
    # colonnes
    fixed_cols, used = [], set()
    for i, c in enumerate(df.columns):
        nc = (c if isinstance(c, str) else "") or ""
        nc = nc.strip()
        if not nc or re.match(r"^unnamed", nc, re.I):
            nc = f"col_{i+1}"
        k = nc
        j = 2
        while k in used:
            k = f"{nc}_{j}"
            j += 1
        used.add(k)
        fixed_cols.append(k)
    df.columns = fixed_cols
    # supprimer colonnes vides du début (tableau décalé)
    while df.shape[1] > 0:
        first_col = df.iloc[:, 0]
        ratio_nan = first_col.isna().mean()
        ratio_blank = (first_col.astype(str).str.strip() == "").mean()
        if max(ratio_nan, ratio_blank) >= 0.95:
            df = df.iloc[:, 1:]
        else:
            break
    # trim object
    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].apply(lambda x: x.strip() if isinstance(x, str) else x)
    df = df.dropna(how="all")
    return df if not df.empty else pd.DataFrame()

def smart_read_excel(file_like, max_header_scan: int = 200) -> pd.DataFrame:
    # charge en mémoire (évite curseur épuisé)
    if hasattr(file_like, "read"):
        raw_bytes = file_like.read()
    else:
        raw_bytes = file_like if isinstance(file_like, (bytes, bytearray)) else bytes(file_like)
    if not raw_bytes:
        return pd.DataFrame()
    bio = io.BytesIO(raw_bytes)
    filename = getattr(file_like, "name", "") or getattr(file_like, "filename", "") or ""

    # CSV rapide
    if filename.lower().endswith(".csv"):
        try:
            bio.seek(0)
            df = pd.read_csv(bio, dtype=str, keep_default_na=True)
            if df.empty:
                return pd.DataFrame()
            if any(str(c).lower().startswith("unnamed") for c in df.columns):
                bio.seek(0)
                raw = pd.read_csv(bio, header=None, dtype=str, keep_default_na=True)
                limit = min(max_header_scan, len(raw))
                best, header_idx = -1e9, 0
                for i in range(limit):
                    s = _score_header_row(raw.iloc[i])
                    if s > best:
                        best, header_idx = s, i
                headers = raw.iloc[header_idx].tolist()
                df = raw.iloc[header_idx + 1 :].copy()
                df.columns = headers
            return _tidy_df(df)
        except Exception:
            pass

    # Excel multi-feuilles
    def _parse_excel_from_memory() -> pd.DataFrame:
        try:
            bio.seek(0)
            xls = pd.ExcelFile(bio)
            sheets = xls.sheet_names or [0]
        except Exception:
            try:
                bio.seek(0)
                raw = pd.read_excel(bio, header=None, dtype=str)
                raw = raw.applymap(lambda x: x.strip() if isinstance(x, str) else x)

                limit = min(max_header_scan, len(raw))
                best, header_idx = -1e9, 0
                for i in range(limit):
                    s = _score_header_row(raw.iloc[i])
                    if s > best:
                        best, header_idx = s, i
                headers = raw.iloc[header_idx].tolist()
                df = raw.iloc[header_idx + 1 :].copy()
                df.columns = headers
                return _tidy_df(df)
            except Exception:
                return pd.DataFrame()

        for sh in sheets:
            try:
                raw = xls.parse(sh, header=None, dtype=str)
            except Exception:
                continue
            if raw is None or raw.empty:
                continue
            raw = raw.applymap(lambda x: x.strip() if isinstance(x, str) else x)
            limit = min(max_header_scan, len(raw))
            best, header_idx = -1e9, 0
            for i in range(limit):
                s = _score_header_row(raw.iloc[i])
                if s > best:
                    best, header_idx = s, i
            if best < -1e8:
                for i in range(min(200, len(raw))):
                    row = raw.iloc[i].astype(str).str.strip().replace("nan", "")
                    if row.astype(bool).any():
                        header_idx = i
                        break
            headers = raw.iloc[header_idx].tolist()
            df = raw.iloc[header_idx + 1 :].copy()
            df.columns = headers
            df = _tidy_df(df)
            if not df.empty:
                return df
        return pd.DataFrame()

    return _parse_excel_from_memory()


# ---------------------------------------------------------------------
# Utils de détection de colonnes
# ---------------------------------------------------------------------

def _fuzzy_best_match(keywords: List[str], columns: List[str], min_ratio: float = 0.65) -> Optional[str]:
    if not columns:
        return None
    cols_norm = {c: _norm_header(c) for c in columns}
    best_c, best_r = None, 0.0
    for c, n in cols_norm.items():
        for k in keywords:
            r = difflib.SequenceMatcher(a=_norm_header(k), b=n).ratio()
            if r > best_r:
                best_c, best_r = c, r
    return best_c if best_r >= min_ratio else None


def _find_col(df: pd.DataFrame, *keyword_groups: List[str], prefer: Optional[str] = None) -> Optional[str]:
    norm_map: Dict[str, List[str]] = {}
    for c in df.columns:
        norm_map.setdefault(_norm_header(c), []).append(c)

    for group in keyword_groups:
        for k in group:
            k_norm = _norm_header(k)
            if k_norm in norm_map:
                cols = norm_map[k_norm]
                if prefer and prefer in cols:
                    return prefer
                return cols[0]

    for group in keyword_groups:
        for k in group:
            k_norm = _norm_header(k)
            candidates = [orig for norm, lst in norm_map.items() if k_norm in norm for orig in lst]
            if candidates:
                if prefer and prefer in candidates:
                    return prefer
                return candidates[0]
    return None


# ---------------------------------------------------------------------
# Import Dossiers
# ---------------------------------------------------------------------

# ---------------------------------------------------------------------
# ✅ Import Dossiers - Version stable compatible modèle actuel
# ---------------------------------------------------------------------

# ---------------------------------------------------------------------
# Lecture Excel robuste (buffer mémoire + CSV + multi-feuilles)
# ---------------------------------------------------------------------

def _norm_local(s: Any) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = str(s)
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower().strip().replace("_", " ")
    s = re.sub(r"\s+", " ", s)
    return s


_EXPECTED_TOKENS = {
    "date","horaire","horaires","hora","provenance","org","origen","destination","dst","destino",
    "d/a","a/d","l/s","ls","depart/arriver","type","mouvement","n° vol","n vol","vuelo","flight","vol",
    "client/ to","client to","to","t.o.","tour operateur","tour opérateur","tour operador","hotel","hôtel",
    "ref","référence","reference","ntra.ref","ref t.o.","ref to","titulaire","tetulaire","titular","name",
    "holder","pax","passengers","adultes","adultos","enfants","niños","ninos","bb/gratuit","bebe","bebes",
    "observation","observations","coment","comentario","comments","ville","city","ciudad","postal","zip","code postal"
}

def _score_header_row(series: pd.Series) -> float:
    cells = [_norm_local(v) for v in series.tolist()]
    if not any(cells):
        return -1e9
    non_empty = sum(1 for c in cells if c)
    if non_empty < 2:
        return -1e9
    score = 0.0
    for c in cells:
        if not c:
            continue
        if any(tok in c for tok in _EXPECTED_TOKENS):
            score += 2.0
        if re.search(r"\d{3,}", c):
            score -= 0.25
    score += 0.15 * non_empty
    return score

def _tidy_df(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.dropna(axis=1, how="all").dropna(how="all")
    if df.empty:
        return pd.DataFrame()
    # colonnes
    fixed_cols, used = [], set()
    for i, c in enumerate(df.columns):
        nc = (c if isinstance(c, str) else "") or ""
        nc = nc.strip()
        if not nc or re.match(r"^unnamed", nc, re.I):
            nc = f"col_{i+1}"
        k = nc
        j = 2
        while k in used:
            k = f"{nc}_{j}"
            j += 1
        used.add(k)
        fixed_cols.append(k)
    df.columns = fixed_cols
    # supprimer colonnes vides du début (tableau décalé)
    while df.shape[1] > 0:
        first_col = df.iloc[:, 0]
        ratio_nan = first_col.isna().mean()
        ratio_blank = (first_col.astype(str).str.strip() == "").mean()
        if max(ratio_nan, ratio_blank) >= 0.95:
            df = df.iloc[:, 1:]
        else:
            break
    # trim object
    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].apply(lambda x: x.strip() if isinstance(x, str) else x)
    df = df.dropna(how="all")
    return df if not df.empty else pd.DataFrame()

def smart_read_excel(file_like, max_header_scan: int = 200) -> pd.DataFrame:
    # charge en mémoire (évite curseur épuisé)
    if hasattr(file_like, "read"):
        raw_bytes = file_like.read()
    else:
        raw_bytes = file_like if isinstance(file_like, (bytes, bytearray)) else bytes(file_like)
    if not raw_bytes:
        return pd.DataFrame()
    bio = io.BytesIO(raw_bytes)
    filename = getattr(file_like, "name", "") or getattr(file_like, "filename", "") or ""

    # CSV rapide
    if filename.lower().endswith(".csv"):
        try:
            bio.seek(0)
            df = pd.read_csv(bio, dtype=str, keep_default_na=True)
            if df.empty:
                return pd.DataFrame()
            if any(str(c).lower().startswith("unnamed") for c in df.columns):
                bio.seek(0)
                raw = pd.read_csv(bio, header=None, dtype=str, keep_default_na=True)
                limit = min(max_header_scan, len(raw))
                best, header_idx = -1e9, 0
                for i in range(limit):
                    s = _score_header_row(raw.iloc[i])
                    if s > best:
                        best, header_idx = s, i
                headers = raw.iloc[header_idx].tolist()
                df = raw.iloc[header_idx + 1 :].copy()
                df.columns = headers
            return _tidy_df(df)
        except Exception:
            pass

    # Excel multi-feuilles
    def _parse_excel_from_memory() -> pd.DataFrame:
        try:
            bio.seek(0)
            xls = pd.ExcelFile(bio)
            sheets = xls.sheet_names or [0]
        except Exception:
            try:
                bio.seek(0)
                raw = pd.read_excel(bio, header=None, dtype=str)
                raw = raw.applymap(lambda x: x.strip() if isinstance(x, str) else x)

                limit = min(max_header_scan, len(raw))
                best, header_idx = -1e9, 0
                for i in range(limit):
                    s = _score_header_row(raw.iloc[i])
                    if s > best:
                        best, header_idx = s, i
                headers = raw.iloc[header_idx].tolist()
                df = raw.iloc[header_idx + 1 :].copy()
                df.columns = headers
                return _tidy_df(df)
            except Exception:
                return pd.DataFrame()

        for sh in sheets:
            try:
                raw = xls.parse(sh, header=None, dtype=str)
            except Exception:
                continue
            if raw is None or raw.empty:
                continue
            raw = raw.applymap(lambda x: x.strip() if isinstance(x, str) else x)
            limit = min(max_header_scan, len(raw))
            best, header_idx = -1e9, 0
            for i in range(limit):
                s = _score_header_row(raw.iloc[i])
                if s > best:
                    best, header_idx = s, i
            if best < -1e8:
                for i in range(min(200, len(raw))):
                    row = raw.iloc[i].astype(str).str.strip().replace("nan", "")
                    if row.astype(bool).any():
                        header_idx = i
                        break
            headers = raw.iloc[header_idx].tolist()
            df = raw.iloc[header_idx + 1 :].copy()
            df.columns = headers
            df = _tidy_df(df)
            if not df.empty:
                return df
        return pd.DataFrame()

    return _parse_excel_from_memory()


# ---------------------------------------------------------------------
# Utils de détection de colonnes
# ---------------------------------------------------------------------

def _fuzzy_best_match(keywords: List[str], columns: List[str], min_ratio: float = 0.65) -> Optional[str]:
    if not columns:
        return None
    cols_norm = {c: _norm_header(c) for c in columns}
    best_c, best_r = None, 0.0
    for c, n in cols_norm.items():
        for k in keywords:
            r = difflib.SequenceMatcher(a=_norm_header(k), b=n).ratio()
            if r > best_r:
                best_c, best_r = c, r
    return best_c if best_r >= min_ratio else None


def _find_col(df: pd.DataFrame, *keyword_groups: List[str], prefer: Optional[str] = None) -> Optional[str]:
    norm_map: Dict[str, List[str]] = {}
    for c in df.columns:
        norm_map.setdefault(_norm_header(c), []).append(c)

    for group in keyword_groups:
        for k in group:
            k_norm = _norm_header(k)
            if k_norm in norm_map:
                cols = norm_map[k_norm]
                if prefer and prefer in cols:
                    return prefer
                return cols[0]

    for group in keyword_groups:
        for k in group:
            k_norm = _norm_header(k)
            candidates = [orig for norm, lst in norm_map.items() if k_norm in norm for orig in lst]
            if candidates:
                if prefer and prefer in candidates:
                    return prefer
                return candidates[0]
    return None


# ---------------------------------------------------------------------
# Import Dossiers
# ---------------------------------------------------------------------
# -*- coding: utf-8 -*-
# b2b/views/importers.py — Import Dossiers (clean rewrite)

# This module provides a single API view to import Dossiers from Excel/CSV.
# Aligned with simplified Dossier model fields:
#   Date, Horaires, Provenance, Destination, DEPART/ARRIVER, N Vol,
#   Client / TO, Hotel, REF, Titulaire, Pax, Adulte, Enfants, BB/GRATUIT,
#   Observation, Ville, code postal.
#
# Behaviours:
# - Auto-detection of column headers (robust matching).
# - Optional JSON mapping {canon_key -> header} provided by the frontend.
# - Optional required_fields sent by the frontend; rows missing those are reported.
# - Hotel is stored as text (CharField).
# - Creates Dossier rows and optionally attaches to a FicheMouvement.
# - Uses ImportBatch/ImportBatchItem if defined.
#
import io
import re
import unicodedata
from datetime import datetime, date, time
from typing import Any, Dict, List, Optional

import pandas as pd
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import (
    AgenceVoyage,
    Dossier,
    FicheMouvement,
    FicheMouvementItem,
)

try:
    from b2b.models import ImportBatch, ImportBatchItem  # type: ignore
    HAS_BATCH = True
except Exception:
    ImportBatch = None  # type: ignore
    ImportBatchItem = None  # type: ignore
    HAS_BATCH = False

# ------------- Small helpers -------------
def _isna(v: Any) -> bool:
    return v is None or (isinstance(v, float) and pd.isna(v))

def _norm_header(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower().strip().replace("_", " ")
    s = re.sub(r"\s+", " ", s)
    return s

def _parse_int(v: Any) -> int:
    try:
        return int(float(str(v).replace(",", ".").strip()))
    except Exception:
        return 0

def _to_time(v: Any) -> Optional[time]:
    if _isna(v):
        return None
    s = str(v).strip()
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).time()
        except Exception:
            pass
    try:
        fv = float(s)
        seconds = int(round(fv * 24 * 3600))
        return (datetime.min + pd.Timedelta(seconds=seconds)).time()
    except Exception:
        return None

def _to_date(v: Any) -> Optional[date]:
    if _isna(v):
        return None
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.date()
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    try:
        return (pd.to_datetime(v, errors="coerce")).date()
    except Exception:
        return None

def _smart_read(upload) -> pd.DataFrame:
    name = getattr(upload, "name", "").lower()
    data = upload.read()
    bio = io.BytesIO(data)
    if name.endswith(".csv"):
        try:
            return pd.read_csv(bio, sep=";", dtype=str, keep_default_na=False)
        except Exception:
            bio.seek(0)
            return pd.read_csv(bio, sep=",", dtype=str, keep_default_na=False)
    return pd.read_excel(bio, dtype=str, keep_default_na=False)

# ------------- API -------------
class ImporterDossierAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    # Canonical keys expected by the UI (mapping can override)
    CANON_KEYS = [
        "date", "horaires", "provenance", "destination", "da", "num_vol",
        "client_to", "hotel", "ref", "titulaire", "pax", "adulte",
        "enfants", "bb_gratuit", "observation", "ville", "code_postal",
    ]

    def _auto_mapping(self, headers: List[str]) -> Dict[str, str]:
        def pick(preds: List[str]) -> str:
            for h in headers:
                n = _norm_header(str(h))
                if any(p in n for p in preds):
                    return h
            return ""
        return {
            "date":        pick(["date", "jour", "day"]),
            "horaires":    pick(["heure", "horaire", "horaires", "time"]),
            "provenance":  pick(["prov", "orig", "from", "aeroport dep", "depart"]),
            "destination": pick(["dest", "to", "arrivee", "aeroport arr"]),
            "da":          pick(["d/a", "depart", "arriv", "mouvement", "type"]),
            "num_vol":     pick(["vol", "flight", "n vol", "n de vol"]),
            "client_to":   pick(["client to", "t.o", "tour oper", "to", "client"]),
            "hotel":       pick(["hotel", "h\u00f4tel"]),
            "ref":         pick(["ref", "reference", "n dossier"]),
            "titulaire":   pick(["titulaire", "client", "voyageur", "passager", "nom"]),
            "pax":         pick(["pax", "passengers"]),
            "adulte":      pick(["adulte", "adultes", "adults"]),
            "enfants":     pick(["enfant", "enfants", "children"]),
            "bb_gratuit":  pick(["bb", "bebe", "gratuit", "infant", "baby"]),
            "observation": pick(["observ", "remark", "comment", "remarque"]),
            "ville":       pick(["ville", "city"]),
            "code_postal": pick(["code postal", "postal", "zip", "postcode", "cp"]),
        }

    def _norm_da(self, raw: Any) -> Optional[str]:
        v = (str(raw or "")).strip().upper()
        if v in {"A", "ARRIVE", "ARRIVEE", "ARRIVAL"}:
            return "A"
        if v in {"D", "DEPART", "DEPARTURE"}:
            return "D"
        return None

    def _validate_required(self, canon: Dict[str, Any], required_set: set) -> List[str]:
        labels = {
            "date": "Date", "horaires": "Horaires", "provenance": "Provenance",
            "destination": "Destination", "da": "DEPART/ARRIVER", "num_vol": "N Vol",
            "client_to": "Client / TO", "hotel": "Hotel", "ref": "REF",
            "titulaire": "Titulaire", "pax": "Pax", "adulte": "Adulte",
            "enfants": "Enfants", "bb_gratuit": "BB/GRATUIT",
            "observation": "Observation", "ville": "Ville", "code_postal": "code postal",
        }
        msgs = []
        for f in required_set:
            val = canon.get(f)
            empty = val is None or (isinstance(val, str) and val.strip() == "")
            if empty:
                msgs.append(f"{labels.get(f, f)} manquant(e)")
        if canon.get("da") not in {"A", "D"}:
            msgs.append("DEPART/ARRIVER invalide (A ou D)")
        return msgs

    def _extract_canon_rows(self, df: pd.DataFrame, mapping: Dict[str, str]) -> List[Dict[str, Any]]:
        header_map = {k: mapping.get(k, "") for k in self.CANON_KEYS}
        def G(row, key):
            header = header_map.get(key, "")
            return "" if not header else row.get(header, "")

        out = []
        for _, row in df.iterrows():
            row = {str(k): v for k, v in row.items()}
            canon = {
                "date":        G(row, "date"),
                "horaires":    G(row, "horaires"),
                "provenance":  G(row, "provenance"),
                "destination": G(row, "destination"),
                "da":          self._norm_da(G(row, "da")),
                "num_vol":     str(G(row, "num_vol")).strip(),
                "client_to":   str(G(row, "client_to")).strip(),
                "hotel":       str(G(row, "hotel")).strip(),
                "ref":         str(G(row, "ref")).strip(),
                "titulaire":   str(G(row, "titulaire")).strip(),
                "pax":         _parse_int(G(row, "pax")),
                "adulte":      _parse_int(G(row, "adulte")),
                "enfants":     _parse_int(G(row, "enfants")),
                "bb_gratuit":  _parse_int(G(row, "bb_gratuit")),
                "observation": str(G(row, "observation")).strip(),
                "ville":       str(G(row, "ville")).strip(),
                "code_postal": str(G(row, "code_postal")).strip(),
            }
            out.append(canon)
        return out

    @transaction.atomic
    def post(self, request):
        up = request.FILES.get("file")
        if not up:
            return Response({"error": "Aucun fichier envoye (file)."}, status=400)

        agence_id = request.data.get("agence")
        if agence_id:
            agence = get_object_or_404(AgenceVoyage, pk=agence_id)
        else:
            profile = getattr(request.user, "profile", None)
            agence = getattr(profile, "agence", None)
        if not agence:
            return Response({"error": "Agence manquante."}, status=400)

        df = _smart_read(up)
        if df.empty:
            return Response({"error": "Fichier vide."}, status=400)

        headers = list(df.columns)
        auto = self._auto_mapping(headers)
        user_mapping = request.data.get("mapping")
        if isinstance(user_mapping, str):
            try:
                import json
                user_mapping = json.loads(user_mapping)
            except Exception:
                user_mapping = None
        mapping = {k: (user_mapping.get(k) or auto.get(k) or "") for k in self.CANON_KEYS} if isinstance(user_mapping, dict) else auto

        required = request.data.get("required_fields")
        if isinstance(required, str):
            try:
                import json
                required = json.loads(required)
            except Exception:
                required = None
        required_set = set(required or [])
        ignore_errors = str(request.data.get("ignore_errors", "")).lower() in {"1", "true", "yes", "on"}

        rows = self._extract_canon_rows(df, mapping)

        created, updated = [], []
        errors = []
        items_for_batch = []

        batch = None
        if HAS_BATCH:
            batch = ImportBatch.objects.create(
                user=request.user, agence=agence, label=getattr(up, "name", f"Import {timezone.now():%Y-%m-%d %H:%M}")
            )

        for idx, c in enumerate(rows, start=2):
            msgs = self._validate_required(c, required_set)
            if msgs and not ignore_errors:
                errors.append({
                    "excel_row": idx,
                    "field": "*",
                    "message": "; ".join(msgs),
                    "raw_value": str(c),
                })
                continue

            d = _to_date(c["date"]) if c["date"] else None
            t = _to_time(c["horaires"]) if c["horaires"] else None

            ref = c["ref"] or None
            obj = None
            if ref:
                obj = Dossier.objects.filter(ref=ref).first()

            fields = dict(
                agence=agence,
                date=d,
                horaires=t,
                provenance=c["provenance"],
                destination=c["destination"],
                sens=c["da"],
                numero_vol=c["num_vol"],
                client_to=c["client_to"],
                hotel=c["hotel"],
                ref=ref or "",
                titulaire=c["titulaire"],
                pax=c["pax"],
                adulte=c["adulte"],
                enfants=c["enfants"],
                bb_gratuit=c["bb_gratuit"],
                observation=c["observation"],
                ville=(c["ville"] or None),
                code_postal=(c["code_postal"] or None),
                imported_at=timezone.now(),
            )

            if obj:
                for k, v in fields.items():
                    setattr(obj, k, v)
                obj.save()
                updated.append(obj.id)
            else:
                obj = Dossier.objects.create(**fields)
                created.append(obj.id)

            fiche_id = request.data.get("fiche_id")
            if fiche_id:
                fiche = get_object_or_404(FicheMouvement, pk=fiche_id, agence=agence)
                FicheMouvementItem.objects.get_or_create(fiche=fiche, dossier=obj)

            if batch and HAS_BATCH:
                items_for_batch.append(ImportBatchItem(batch=batch, dossier=obj))

        if batch and HAS_BATCH and items_for_batch:
            ImportBatchItem.objects.bulk_create(items_for_batch, ignore_conflicts=True)

        return Response({
            "message": "Import termine",
            "agence": agence.id,
            "batch_id": getattr(batch, "id", None),
            "batch_label": getattr(batch, "label", None),
            "dossiers_crees": created,
            "dossiers_mis_a_jour": updated,
            "erreurs": errors,
        }, status=200)


# ---------------------------------------------------------------------
# Import Véhicules
# ---------------------------------------------------------------------

def _norm(s: Any) -> str:
    if s is None:
        return ""
    s = str(s).strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    out = []
    for ch in s:
        out.append(ch if ch.isalnum() else "_")
    return "".join(out).strip("_").upper()


HEADER_ALIASES: Dict[str, List[str]] = {
    "IMMATRICULATION": ["IMMATRICULATION","IMMAT","PLAQUE","MATRICULE","REG","REG_NO","REGISTRATION","NUM_IMMATRICULATION"],
    "MARQUE": ["MARQUE","BRAND","MAKE"],
    "MODELE": ["MODELE","MODEL","MODELE_","MODElE","MODÈLE"],
    "TYPE": ["TYPE","CATEGORIE","CATEGORY","VEHICLE_TYPE"],
    "CAPACITE": ["CAPACITEE","CAPACITE","CAPACITE_","CAPACITY","SEATS","NB_PLACES","PLACES"],
    "ANNEE": ["ANNEE","ANNEE_","YEAR"],
}
REQUIRED_KEYS = ["IMMATRICULATION","MARQUE","MODELE"]

def _build_header_map(header_cells: List[Any]) -> Dict[str, int]:
    present = {_norm(v): idx for idx, v in enumerate(header_cells) if _norm(v)}
    mapping: Dict[str, int] = {}
    for logical, aliases in HEADER_ALIASES.items():
        for alias in aliases:
            norm_alias = _norm(alias)
            if norm_alias in present:
                mapping[logical] = present[norm_alias]
                break
    return mapping

def _cell_val(cell) -> Any:
    if cell is None:
        return None
    v = cell.value
    if isinstance(v, str):
        return v.strip()
    return v


class ImporterVehiculesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        file = request.FILES.get("file")
        agence_id = request.POST.get("agence") or request.data.get("agence")
        if not file:
            return Response({"error": "Aucun fichier reçu."}, status=400)
        if not agence_id:
            return Response({"error": "Paramètre 'agence' requis."}, status=400)

        _ensure_same_agence_or_superadmin(request, int(agence_id))
        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        try:
            wb = load_workbook(file, data_only=True)
            ws = wb.active
        except Exception as e:
            return Response({"error": f"Fichier illisible ({e})."}, status=400)

        header_row_idx = None
        header_cells = []
        for i, row in enumerate(ws.iter_rows(min_row=1, max_row=min(20, ws.max_row))):
            labels = [(_cell_val(c) or "") for c in row]
            if any(str(v).strip() for v in labels):
                header_row_idx = i + 1
                header_cells = labels
                break
        if header_row_idx is None:
            return Response({"error": "Aucune ligne d'en-têtes détectée."}, status=400)

        header_map = _build_header_map(header_cells)
        missing = [k for k in REQUIRED_KEYS if k not in header_map]
        if missing:
            detected = ", ".join([f"{k}→col{header_map[k]+1}" for k in header_map.keys()])
            return Response(
                {"error": f"Colonnes manquantes dans le fichier: {', '.join(missing)}", "detected": detected},
                status=400,
            )

        created, updated, ignored = [], [], []
        for row_idx in range(header_row_idx + 1, ws.max_row + 1):
            row = [_cell_val(c) for c in ws[row_idx]]

            def colv(key, default=None):
                idx = header_map.get(key)
                if idx is None or idx >= len(row):
                    return default
                return row[idx]

            immat = (colv("IMMATRICULATION") or "").strip()
            if not immat:
                ignored.append({"ligne": row_idx, "raison": "Pas d'immatriculation"})
                continue

            marque = (colv("MARQUE") or "").strip()
            modele = (colv("MODELE") or "").strip()
            type_ = (colv("TYPE") or "").strip().lower() or "minibus"
            try:
                capacite = int(colv("CAPACITE") or 0)
            except Exception:
                capacite = 0
            try:
                annee = int(colv("ANNEE") or 0)
            except Exception:
                annee = 0

            if not marque or not modele:
                ignored.append({"ligne": row_idx, "raison": "MARQUE/MODELE manquant"})
                continue

            obj, was_created = Vehicule.objects.get_or_create(
                immatriculation=immat,
                defaults={
                    "type": (type_ if type_ in dict(Vehicule.TYPE_CHOICES) else "minibus"),
                    "marque": marque,
                    "model": modele,
                    "capacite": capacite,
                    "annee": annee or 0,
                    "agence": agence,
                },
            )
            if not was_created:
                changed = False
                if obj.agence_id != agence.id:
                    ignored.append({"ligne": row_idx, "raison": f"Immat déjà utilisée par une autre agence ({obj.agence_id})."})
                    continue
                if marque and obj.marque != marque:
                    obj.marque = marque; changed = True
                if modele and obj.model != modele:
                    obj.model = modele; changed = True
                if type_ and type_ in dict(Vehicule.TYPE_CHOICES) and obj.type != type_:
                    obj.type = type_; changed = True
                if capacite and obj.capacite != capacite:
                    obj.capacite = capacite; changed = True
                if annee and obj.annee != annee:
                    obj.annee = annee; changed = True
                if changed:
                    obj.save()
                    updated.append({"id": obj.id, "immatriculation": obj.immatriculation})
                else:
                    ignored.append({"ligne": row_idx, "raison": "Aucune modification."})
            else:
                created.append({"id": obj.id, "immatriculation": obj.immatriculation})

        return Response({"vehicules_crees": created, "vehicules_mis_a_jour": updated, "lignes_ignorees": ignored}, status=200)


# ---------------------------------------------------------------------
# Import Chauffeurs
# ---------------------------------------------------------------------

class ImporterChauffeursAPIView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    HEADERS = {
        "nom": ["NOM", "Nom", "Last name", "Apellido"],
        "prenom": ["PRENOM", "Prénom", "First name", "Nombre"],
        "cin": ["CIN", "N° CIN", "C.I.N", "ID", "Identité"],
    }

    def _find_col(self, df, candidates):
        for c in candidates:
            if c in df.columns:
                return c
        lowered = {str(col).strip().lower(): col for col in df.columns}
        for c in candidates:
            key = str(c).strip().lower()
            if key in lowered:
                return lowered[key]
        return None

    def _clean_str(self, val):
        if pd.isna(val) or val is None:
            return ""
        return str(val).strip()

    def post(self, request, *args, **kwargs):
        fichier = request.FILES.get("file")
        agence_id = request.data.get("agence")
        if not fichier:
            return Response({"error": "Aucun fichier envoyé."}, status=400)
        if not agence_id:
            return Response({"error": "Aucune agence spécifiée."}, status=400)
        _ensure_same_agence_or_superadmin(request, int(agence_id))
        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        try:
            df = pd.read_excel(fichier)
        except Exception as e:
            return Response({"error": f"Erreur lecture fichier Excel: {e}"}, status=400)

        col_nom = self._find_col(df, self.HEADERS["nom"])
        col_prenom = self._find_col(df, self.HEADERS["prenom"])
        col_cin = self._find_col(df, self.HEADERS["cin"])

        if not col_nom:
            return Response({"error": "Colonne NOM manquante."}, status=400)

        created, updated, ignored = [], [], []
        for idx, row in df.iterrows():
            nom = self._clean_str(row.get(col_nom))
            prenom = self._clean_str(row.get(col_prenom)) if col_prenom else ""
            cin = self._clean_str(row.get(col_cin)) if col_cin else ""

            if not nom:
                ignored.append({"ligne": idx + 2, "raison": "Nom manquant"})
                continue

            obj, was_created = Chauffeur.objects.update_or_create(
                agence=agence,
                nom=nom,
                prenom=prenom or "",
                defaults={"cin": cin or "", "agence": agence, "nom": nom, "prenom": prenom or ""},
            )
            (created if was_created else updated).append(f"{nom} {prenom}".strip())

        return Response(
            {
                "message": "Import chauffeurs terminé",
                "agence": agence.id,
                "chauffeurs_crees": created,
                "chauffeurs_mis_a_jour": updated,
                "lignes_ignorees": ignored,
                "resume": {
                    "crees": len(created),
                    "mis_a_jour": len(updated),
                    "ignores": len(ignored),
                    "total_lues": int(df.shape[0]),
                },
            },
            status=200,
        )
    """
    POST /api/importer-dossier/
    form-data:
      - file: <xls/xlsx/csv>            (obligatoire)
      - agence: <id>                    (facultatif si user.profile.agence)
      - mapping: JSON {canon->header}   (optionnel)
          ex:
            {
              "ref":"Ntra.Ref",
              "date":"Date",
              "horaires":"Horaire",
              "da":"D/A",
              "num_vol":"N° VOL",
              "provenance":"ORG",
              "destination":"DST",
              "client_to":"Client / TO",
              "hotel":"Hotel",
              "ville":"Ville"
            }
      - ignore_errors: true/false       (défaut false)
      - debug: 1                        (retourne choix de colonnes + 1ere ligne)
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    # --- utilitaires en-têtes ---
    def _n(self, s: Any) -> str:
        import unicodedata, re
        if s is None:
            return ""
        s = str(s)
        s = unicodedata.normalize("NFD", s)
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
        s = s.lower()
        s = re.sub(r"[^a-z0-9]+", "", s)  # supprime espaces/ponctuation
        return s

    def _pick_col(self, df: pd.DataFrame, *keywords: str) -> Optional[str]:
        # exact sur la version normalisée, puis "contains"
        keys = [self._n(k) for k in keywords]
        norm_map = {c: self._n(c) for c in df.columns}
        for c, n in norm_map.items():
            if n in keys:
                return c
        for c, n in norm_map.items():
            if any(k in n for k in keys):
                return c
        return None

    def _find_ref_col(self, df: pd.DataFrame) -> Optional[str]:
        # large éventail d’alias pour "référence"
        candidates = [
            "ref", "reference", "référence", "ntra.ref", "ntraref", "ntra",
            "ref.to", "refto", "ref t.o", "ref t o", "ndossier", "n°dossier",
            "code", "bookingref", "reservationref"
        ]
        col = self._pick_col(df, *candidates)
        if col:
            return col
        # heuristique : colonne avec max de valeurs non vides et beaucoup d'alphanum
        best, best_score = None, -1
        for c in df.columns:
            ser = df[c].astype(str)
            non_empty = ser.map(lambda v: v.strip() not in {"", "nan", "none", "null"}).sum()
            if non_empty == 0:
                continue
            # score = non vides + diversité
            uniq = ser.map(lambda v: v.strip()).nunique()
            score = non_empty + 0.5 * uniq
            if score > best_score:
                best, best_score = c, score
        return best

    def _safe_int(self, x) -> int:
        try:
            return int(float(str(x).replace(",", ".").strip()))
        except Exception:
            return 0

    def _row_all_blank(self, d: dict) -> bool:
        return all(not str(v or "").strip() for v in d.values())

    @transaction.atomic
    def post(self, request):
        # 1) fichier + agence
        up = request.FILES.get("file")
        if not up:
            return Response({"error": "Aucun fichier envoyé (file)."}, status=400)

        agence_raw = (request.data.get("agence") or "").strip()
        if not agence_raw or agence_raw == "undefined":
            try:
                agence = request.user.profile.agence
            except Exception:
                return Response({"error": "Agence requise."}, status=400)
        else:
            try:
                agence_id = int(agence_raw)
            except Exception:
                return Response({"error": "Paramètre 'agence' invalide."}, status=400)
            agence = get_object_or_404(AgenceVoyage, id=agence_id)

        _ensure_same_agence_or_superadmin(request, agence.id)

        ignore_errors = str(request.data.get("ignore_errors") or "").lower() in {"1","true","yes","on"}
        want_debug = str(request.data.get("debug") or "") in {"1","true","yes","on"}
        filename = getattr(up, "name", "") or ""

        # 2) dataframe
        try:
            df = _read_table_to_df(up)
        except Exception as e:
            return Response({"error": f"Erreur lecture fichier: {e}"}, status=400)
        if df is None or df.empty:
            return Response({"error": "Le fichier est vide."}, status=400)
        df = df.fillna("")
        cols = list(df.columns)

        # 3) mapping explicite (si fourni)
        import json
        user_map = {}
        if request.data.get("mapping"):
            try:
                user_map = json.loads(request.data.get("mapping") or "{}") or {}
            except Exception:
                user_map = {}

        def pick(mapped_key: str, *auto_aliases: str) -> Optional[str]:
            # priorité au mapping utilisateur si correspond à une vraie colonne
            m = user_map.get(mapped_key)
            if m and m in df.columns:
                return m
            # sinon auto-pick sur alias
            return self._pick_col(df, *auto_aliases)

        # 4) colonnes (avec fallback robuste)
        col_ref  = user_map.get("ref")  if user_map.get("ref")  in cols else None
        if not col_ref:
            col_ref = self._find_ref_col(df)

        col_day  = pick("date", "date","fecha","jour","dia","day")
        col_time = pick("horaires","heure","horaire","horaires","time","hora","horairevol")
        col_vol  = pick("num_vol","vol","vuelo","flight","nvol","n°vol","no vol")
        col_org  = pick("provenance","org","origin","origen","from","provenance","origine")
        col_dst  = pick("destination","dst","to","destino","destination")
        col_da   = pick("da","d/a","a/d","ls","l/s","mouvement","type","depart/arriver","depart arrivee")
        col_city = pick("ville","ciudad","city","zone","localite","localité")
        col_to   = pick("client_to","client to","t.o.","to","tour operateur","tour opérateur","tour operador","tour operator","client/ to")
        col_zip  = _find_col(df, ["Code Postal","Postal","ZIP","Postcode","CP","Codigo Postal","Código Postal","CodigoPostal","CódigoPostal"])
        # hotel : choisir la colonne la plus “textuelle”
        def _pick_hotel():
            candidates = [c for c in cols if "hotel" in self._n(c)]
            if not candidates:
                return None
            if len(candidates) == 1:
                return candidates[0]
            best, best_score = candidates[0], -1
            for c in candidates:
                ser = df[c].astype(str).head(50)
                score = sum(1 for v in ser if re.search(r"[A-Za-zÀ-ÿ]", v))
                if score > best_score:
                    best, best_score = c, score
            return best
        col_hotel = user_map.get("hotel") if user_map.get("hotel") in cols else _pick_hotel()

        col_pax  = pick("pax","pax","passengers","qt pax")
        adult_cols = [c for c in cols if any(k in self._n(c) for k in ["adulte","adultes","adults","adultos"])]
        child_cols = [c for c in cols if any(k in self._n(c) for k in ["enfant","enfants","children","ninos","niños"])]
        baby_cols  = [c for c in cols if any(k in self._n(c) for k in ["bb","bebe","infant","baby","bbgratuit"])]

        # 5) boucle
        created_ids, updated_ids = [], []
        dossiers_crees, dossiers_mis_a_jour = [], []
        lignes_ignorees, erreurs, ui_rows = [], [], []

        def fmt_hhmm(dt):
            try:
                return dt.strftime("%H:%M") if dt else ""
            except Exception:
                return ""

        from hashlib import blake2s

        for idx, row in df.iterrows():
            excel_row = int(idx) + 2
            try:
                # Référence
                ref = None
                if col_ref:
                    ref = _first_str(row.get(col_ref))
                if not ref and not ignore_errors:
                    lignes_ignorees.append({"ligne": excel_row, "raison": "Référence manquante"})
                    erreurs.append({
                        "excel_row": excel_row, "field": "reference",
                        "code": "missing_required", "message": "Référence manquante",
                        "raw_value": str(row.to_dict())
                    })
                    continue
                if not ref:
                    # plan B si ignore_errors=true : ref auto stable par hash
                    seed = f"{row.get(col_day)}|{row.get(col_time)}|{row.get(col_to)}|{excel_row}|{filename}"
                    ref = "AUTO-" + blake2s(seed.encode("utf-8"), digest_size=4).hexdigest().upper()

                # date/heure
                day_val = row.get(col_day) if col_day else None
                time_val = row.get(col_time) if col_time else None
                dt = _combine_datetime(day_val, time_val)

                # org/dst/type + vol normalisé
                org_val = row.get(col_org) if col_org else None
                dst_val = row.get(col_dst) if col_dst else None
                da_val  = row.get(col_da)  if col_da  else None
                org_iata, dst_iata, type_code, errs_codes = resolve_airports_and_type(org_val, dst_val, da_val)

                vol = normalize_flight_no(row.get(col_vol)) if col_vol else ""
                ville = _first_str(row.get(col_city)) if col_city else ""
                tour_op = _first_str(row.get(col_to)) if col_to else ""

                # pax
                pax = self._safe_int(_first_str(row.get(col_pax))) if col_pax else 0
                if pax <= 0:
                    ad = sum(self._safe_int(row.get(c)) for c in adult_cols)
                    ch = sum(self._safe_int(row.get(c)) for c in child_cols)
                    bb = sum(self._safe_int(row.get(c)) for c in baby_cols)
                    pax = max(pax, ad + ch + bb)
                else:
                    ad = ch = bb = 0

                # client + hôtel
                nom_resa = ""
                if "titulaire" in user_map and user_map["titulaire"] in cols:
                    nom_resa = _first_str(row.get(user_map["titulaire"])) or ""
                hotel_obj = None
                hotel_nom = _first_str(row.get(col_hotel)) if col_hotel else ""
                if hotel_nom:
                    hotel_obj = Hotel.objects.filter(nom__iexact=hotel_nom).first()
                    if not hotel_obj:
                        hotel_obj = Hotel.objects.create(nom=hotel_nom)

                # A/D
                heure_arrivee = heure_depart = None
                num_vol_arrivee = num_vol_retour = ""
                if type_code == "A":
                    heure_arrivee, num_vol_arrivee = dt, (vol or "")
                elif type_code == "D":
                    heure_depart,  num_vol_retour  = dt, (vol or "")
                else:
                    if (org_iata and not dst_iata):
                        heure_depart,  num_vol_retour  = dt, (vol or "")
                    else:
                        heure_arrivee, num_vol_arrivee = dt, (vol or "")

                obs_joined = "; ".join(errs_codes) if errs_codes else ""

                defaults = {
                    "agence": agence,
                    "ville": ville or "",
                    "aeroport_arrivee": (dst_iata or _first_str(dst_val) or ""),
                    "num_vol_arrivee": num_vol_arrivee or "",
                    "heure_arrivee": heure_arrivee,
                    "aeroport_depart": (org_iata or _first_str(org_val) or ""),
                    "heure_depart": heure_depart,
                    "num_vol_retour": num_vol_retour or "",
                    "hotel": hotel_obj,
                    "nombre_personnes_arrivee": pax if heure_arrivee else 0,
                    "nombre_personnes_retour":  pax if heure_depart  else 0,
                    "nb_adultes": ad,
                    "nb_enfants": ch,
                    "nb_bb_gratuits": bb,
                    "nom_reservation": nom_resa,
                    "tour_operateur": tour_op or "",
                    "observation": obs_joined or "",
                    "traite": False,
                    "imported_by": request.user if request.user.is_authenticated else None,
                    "source_filename": filename,
                }

                obj, was_created = Dossier.objects.update_or_create(reference=ref, defaults=defaults)
                if was_created:
                    dossiers_crees.append(ref); created_ids.append(obj.id)
                else:
                    dossiers_mis_a_jour.append(ref); updated_ids.append(obj.id)

                # fiche
                fiche_type = "A" if defaults["heure_arrivee"] else ("D" if defaults["heure_depart"] else "")
                fiche_dt = (defaults["heure_arrivee"] or defaults["heure_depart"])
                fiche_date = fiche_dt.date() if fiche_dt else None
                fiche_airport = defaults["aeroport_arrivee"] if fiche_type == "A" else (
                    defaults["aeroport_depart"] if fiche_type == "D" else ""
                )
                if fiche_type and fiche_date:
                    fiche, _ = FicheMouvement.objects.get_or_create(
                        agence=agence, type=fiche_type, date=fiche_date, aeroport=fiche_airport or ""
                    )
                    FicheMouvementItem.objects.get_or_create(fiche=fiche, dossier=obj)

                # UI
                ui_type = "A" if obj.heure_arrivee else ("D" if obj.heure_depart else "")
                ui_date = ((obj.heure_arrivee or obj.heure_depart).date().isoformat()
                           if (obj.heure_arrivee or obj.heure_depart) else "")
                ui_airport = obj.aeroport_arrivee if ui_type == "A" else (
                    obj.aeroport_depart if ui_type == "D" else ""
                )
                ui_flight_no = obj.num_vol_arrivee if ui_type == "A" else (
                    obj.num_vol_retour if ui_type == "D" else ""
                )
                ui_flight_time = fmt_hhmm(obj.heure_arrivee if ui_type == "A" else obj.heure_depart)
                ui_pax_client = obj.nombre_personnes_arrivee or obj.nombre_personnes_retour or 0

                ui_rows.append({
                    "id": obj.id, "reference": obj.reference, "type": ui_type, "date": ui_date,
                    "aeroport": ui_airport, "flight_no": ui_flight_no, "flight_time": ui_flight_time,
                    "ville": obj.ville or "", "to": obj.tour_operateur or "",
                    "hotel": getattr(obj.hotel, "nom", "") or "", "client_name": obj.nom_reservation or "",
                    "pax_client": ui_pax_client, "observation": obj.observation or "",
                })

            except Exception as e:
                lignes_ignorees.append({"ligne": excel_row, "raison": f"{type(e).__name__}: {e}"})
                erreurs.append({
                    "excel_row": excel_row, "field": "*",
                    "code": "exception",
                    "message": f"{type(e).__name__}: {e}",
                    "raw_value": str(row.to_dict()),
                })
                continue

        # batch
        batch_id, batch_label = None, filename
        if "ImportBatch" in globals() and (created_ids or updated_ids):
            batch = ImportBatch.objects.create(agence=agence, user=request.user, label=f"Import {timezone.now():%Y-%m-%d %H:%M}")  # type: ignore
            batch_id = str(batch.id)
            kept_ids = list(Dossier.objects.filter(id__in=(created_ids + updated_ids), agence=agence).values_list("id", flat=True))
            ImportBatchItem.objects.bulk_create(  # type: ignore
                [ImportBatchItem(batch=batch, dossier_id=i) for i in kept_ids],
                ignore_conflicts=True
            )

        request.session["last_import_dossier_ids"] = [r["id"] for r in ui_rows if r.get("id")]
        request.session.modified = True

        payload = {
            "message": "Import terminé",
            "agence": agence.id,
            "batch_id": batch_id,
            "batch_label": batch_label,
            "dossiers_crees": dossiers_crees,
            "dossiers_mis_a_jour": dossiers_mis_a_jour,
            "lignes_ignorees": lignes_ignorees,
            "erreurs": erreurs[:200],
            "dossiers": ui_rows,
            "created_count": len(created_ids),
            "updated_count": len(updated_ids),
            "total_importes": len(set(created_ids + updated_ids)),
            "total_lignes": int(df.shape[0]),
        }

        if want_debug:
            # renvoie choix de colonnes et l’aperçu de la première ligne
            first = df.iloc[0].to_dict() if len(df) else {}
            payload["debug"] = {
                "headers": cols,
                "picked": {
                    "ref": col_ref, "date": col_day, "horaires": col_time, "da": col_da,
                    "num_vol": col_vol, "provenance": col_org, "destination": col_dst,
                    "client_to": col_to, "hotel": col_hotel, "ville": col_city, "pax": col_pax,
                    "adult_cols": adult_cols, "child_cols": child_cols, "baby_cols": baby_cols,
                },
                "sample_first_row": first,
            }

        return Response(payload, status=200)
    """
    POST /api/importer-dossier/
    form-data:
      - file: <xls/xlsx/csv>    (obligatoire)
      - agence: <id>            (sinon -> agence du user)
      - mapping: JSON optionnel {canon->header source}
      - required_fields: JSON optionnel ["date","horaires",...]
      - ignore_errors: "true"/"false" (défaut: false)

    Sortie: résumé + erreurs + tableau compact 'dossiers' pour l’UI.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    # ------------------------- Colonnes cibles (canons) -------------------------
    CANON_KEYS = [
        "date", "horaires", "provenance", "destination", "da", "num_vol", "client_to",
        "hotel", "ref", "titulaire", "pax", "adulte", "enfants", "bb_gratuit",
        "observation", "ville", "code_postal",
    ]

    # ------------------------- Auto-détection simple ---------------------------
    def _auto_mapping(self, headers: List[str]) -> Dict[str, str]:
        def pick(preds: List[str]) -> str:
            for h in headers:
                n = _norm_header(str(h))
                if any(p in n for p in preds):
                    return h
            return ""

        return {
            "date":        pick(["date", "fecha", "jour", "dia"]),
            "horaires":    pick(["heure", "horaire", "horaires", "time", "hora"]),
            "provenance":  pick(["prov", "orig", "from", "origen", "org"]),
            "destination": pick(["dest", "to", "dst", "destino"]),
            "da":          pick(["d/a", "depart", "arriv", "mouvement", "l/s", "ls"]),
            "num_vol":     pick(["vol", "flight", "n vol", "n° vol", "vuelo"]),
            "client_to":   pick(["client to", "t.o", "t o", "tour oper", "to"]),
            "hotel":       pick(["hotel", "hôtel"]),
            "ref":         pick(["ref", "reference", "référence", "n dossier"]),
            "titulaire":   pick(["titulaire", "titular", "client", "voyageur", "passager", "nom"]),
            "pax":         pick(["pax", "passengers", "qt pax"]),
            "adulte":      pick(["adulte", "adultes", "adults", "adultos"]),
            "enfants":     pick(["enfant", "enfants", "children", "ninos", "niños"]),
            "bb_gratuit":  pick(["bb", "bebe", "gratuit", "infant", "baby"]),
            "observation": pick(["observ", "remark", "comment", "remarque"]),
            "ville":       pick(["ville", "city", "ciudad"]),
            "code_postal": pick(["code postal", "postal", "zip"]),
        }

    # ------------------------- Parsing date & heure ----------------------------
    def _parse_date(self, v) -> Optional[pd.Timestamp.date]:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        d = pd.to_datetime(v, dayfirst=True, errors="coerce")
        if pd.isna(d):
            return None
        return d.date()

    def _parse_time(self, v) -> Optional[time]:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        # Essai datetime/heure direct
        dt = pd.to_datetime(v, errors="coerce")
        if not pd.isna(dt):
            return dt.time()
        # Essai HH:mm
        s = str(v).strip()
        m = re.match(r"^([01]?\d|2[0-3]):([0-5]\d)$", s)
        if m:
            try:
                return time(int(m.group(1)), int(m.group(2)))
            except Exception:
                return None
        return None

    # ------------------------- Extraction valeur d’une colonne -----------------
    def _get_cell(self, row: pd.Series, header_map: Dict[str, str], key: str) -> Any:
        col = header_map.get(key) or ""
        return row.get(col) if col in row.index else None

    # ------------------------- Normalisation 1 ligne → dict canon --------------
    def _normalize_row(self, row: pd.Series, header_map: Dict[str, str]) -> Dict[str, Any]:
        date_val = self._parse_date(self._get_cell(row, header_map, "date"))
        time_val = self._parse_time(self._get_cell(row, header_map, "horaires"))

        def S(k):  # string trim
            v = self._get_cell(row, header_map, k)
            return (_first_str(v) or "").strip()

        def I(k):  # int >=0
            v = self._get_cell(row, header_map, k)
            try:
                n = int(float(str(v).replace(",", ".").strip()))
                return max(0, n)
            except Exception:
                return 0

        da_raw = (_first_str(self._get_cell(row, header_map, "da")) or "").strip().upper()
        if da_raw in {"A", "ARR", "ARRIVEE", "ARRIVAL", "LLEGADA"}:
            type_code = "A"
        elif da_raw in {"D", "DEP", "DEPART", "DEPARTURE", "SALIDA"}:
            type_code = "D"
        else:
            # défaut “Arrivée” si indéterminé
            type_code = "A"

        canon = {
            "date_vol":         date_val or timezone.now().date(),
            "heure_vol":        time_val,  # optionnel
            "aeroport_provenance":  S("provenance"),
            "aeroport_destination": S("destination"),
            "type_mouvement":   type_code,                     # A/D
            "num_vol":          normalize_flight_no(S("num_vol")) or "",
            "tour_operateur":   S("client_to") or "",
            "hotel_nom":        S("hotel") or "",              # → résolu en FK plus bas
            "reference":        S("ref"),
            "nom_reservation":  S("titulaire") or "",
            "pax_total":        I("pax"),
            "nb_adultes":       I("adulte"),
            "nb_enfants":       I("enfants"),
            "nb_bb_gratuits":   I("bb_gratuit"),
            "observation":      S("observation") or "",
            "ville":            S("ville") or "",
            "code_postal":      S("code_postal") or "",
        }

        # Si pax_total non fourni, essaie somme A+E+BB
        if canon["pax_total"] == 0:
            canon["pax_total"] = canon["nb_adultes"] + canon["nb_enfants"] + canon["nb_bb_gratuits"]

        return canon

    # ------------------------- Validation “required” front ---------------------
    def _validate_row(self, canon: Dict[str, Any], required_set: set) -> List[str]:
        msg = []
        # mapping canon->label UI pour messages
        labels = {
            "date_vol": "Date", "heure_vol": "Horaires", "aeroport_provenance": "Provenance",
            "aeroport_destination": "Destination", "type_mouvement": "DEPART/ARRIVER",
            "num_vol": "N° Vol", "tour_operateur": "Client / TO", "hotel_nom": "Hotel",
            "reference": "REF", "nom_reservation": "Titulaire", "pax_total": "Pax",
            "nb_adultes": "Adulte", "nb_enfants": "Enfants", "nb_bb_gratuits": "BB/GRATUIT",
            "observation": "Observation", "ville": "Ville", "code_postal": "code postal",
        }

        # clés canons ↔ clés front
        front2canon = {
            "date": "date_vol",
            "horaires": "heure_vol",
            "provenance": "aeroport_provenance",
            "destination": "aeroport_destination",
            "da": "type_mouvement",
            "num_vol": "num_vol",
            "client_to": "tour_operateur",
            "hotel": "hotel_nom",
            "ref": "reference",
            "titulaire": "nom_reservation",
            "pax": "pax_total",
            "adulte": "nb_adultes",
            "enfants": "nb_enfants",
            "bb_gratuit": "nb_bb_gratuits",
            "observation": "observation",
            "ville": "ville",
            "code_postal": "code_postal",
        }

        for f in required_set:
            canon_key = front2canon.get(f)
            if not canon_key:
                continue
            val = canon.get(canon_key)
            empty = val is None or (isinstance(val, str) and val.strip() == "")
            if empty:
                msg.append(f"{labels.get(canon_key, canon_key)} manquant(e)")

        # validations de forme
        if canon.get("type_mouvement") not in {"A", "D"}:
            msg.append("DEPART/ARRIVER invalide (A ou D)")

        return msg

    # ------------------------------- POST --------------------------------------
    @transaction.atomic
    def post(self, request):
        # 1) Fichier & agence
        up = request.FILES.get("file")
        if not up:
            return Response({"error": "Aucun fichier envoyé (file)."}, status=400)

        agence_raw = (request.data.get("agence") or "").strip()
        if not agence_raw or agence_raw == "undefined":
            try:
                agence = request.user.profile.agence
            except Exception:
                return Response({"error": "Agence requise."}, status=400)
        else:
            try:
                agence_id = int(agence_raw)
            except Exception:
                return Response({"error": "Paramètre 'agence' invalide."}, status=400)
            agence = get_object_or_404(AgenceVoyage, id=agence_id)

        _ensure_same_agence_or_superadmin(request, agence.id)

        # 2) Lire DataFrame
        try:
            df = smart_read_excel(up)
        except Exception as e:
            return Response({"error": f"Erreur lecture Excel: {e}"}, status=400)
        if df is None or df.empty:
            return Response({"error": "Le fichier est vide."}, status=400)

        headers = list(df.columns)

        # 3) Mapping (auto + override manuel)
        mapping_json = (request.data.get("mapping") or "").strip()
        try:
            user_map = pd.io.json.loads(mapping_json) if mapping_json else {}
        except Exception:
            user_map = {}

        auto_map = self._auto_mapping(headers)
        # mélange: priorité au mapping utilisateur si fourni (et header existant)
        header_map: Dict[str, str] = {}
        for key in self.CANON_KEYS:
            usr = user_map.get(key)
            if usr and usr in headers:
                header_map[key] = usr
            else:
                auto = auto_map.get(key) or ""
                header_map[key] = auto if auto in headers else ""

        # 4) Required & ignore_errors
        req_json = (request.data.get("required_fields") or "").strip()
        try:
            required_list = pd.io.json.loads(req_json) if req_json else []
        except Exception:
            required_list = []
        required_set = set(required_list)  # ex. {"date","horaires","da","num_vol","client_to","hotel","pax"}

        ignore_errors = str(request.data.get("ignore_errors") or "").lower() == "true"

        # 5) Boucle lignes
        created_ids: List[int] = []
        updated_ids: List[int] = []
        dossiers_crees: List[str] = []
        dossiers_mis_a_jour: List[str] = []
        lignes_ignorees: List[Dict[str, Any]] = []
        erreurs: List[Dict[str, Any]] = []
        ui_rows: List[Dict[str, Any]] = []

        def fmt_time(t: Optional[time]) -> str:
            return t.strftime("%H:%M") if t else ""

        for idx, row in df.iterrows():
            excel_row = int(idx) + 2  # 1-based + en-tête
            try:
                canon = self._normalize_row(row, header_map)

                # Lignes totalement vides → ignorer
                if all((v is None or (isinstance(v, str) and v.strip() == "") or v == 0)
                       for k, v in canon.items() if k not in {"date_vol", "type_mouvement"}):
                    lignes_ignorees.append({"ligne": excel_row, "raison": "Ligne vide"})
                    continue

                # Référence obligatoire côté modèle
                if not canon["reference"]:
                    erreurs.append({
                        "excel_row": excel_row, "field": "reference",
                        "code": "missing_required", "message": "REF manquante",
                        "raw_value": str(row.to_dict()),
                    })
                    if not ignore_errors:
                        continue

                # Required front
                msgs = self._validate_row(canon, required_set)
                if msgs and not ignore_errors:
                    erreurs.append({
                        "excel_row": excel_row, "field": "*",
                        "code": "validation",
                        "message": " | ".join(msgs),
                        "raw_value": str(row.to_dict()),
                    })
                    continue

                # Hôtel (FK) à la volée
                hotel_obj = None
                if canon["hotel_nom"]:
                    hotel_obj = Hotel.objects.filter(nom__iexact=canon["hotel_nom"]).first()
                    if not hotel_obj:
                        hotel_obj = Hotel.objects.create(nom=canon["hotel_nom"])

                # Préparation sauvegarde
                data = dict(
                    agence=agence,
                    reference=canon["reference"],
                    date_vol=canon["date_vol"],
                    heure_vol=canon["heure_vol"],
                    aeroport_provenance=canon["aeroport_provenance"],
                    aeroport_destination=canon["aeroport_destination"],
                    type_mouvement=canon["type_mouvement"],
                    num_vol=canon["num_vol"] or "",
                    tour_operateur=canon["tour_operateur"] or "",
                    hotel=hotel_obj,
                    pax_total=canon["pax_total"],
                    nb_adultes=canon["nb_adultes"],
                    nb_enfants=canon["nb_enfants"],
                    nb_bb_gratuits=canon["nb_bb_gratuits"],
                    nom_reservation=canon["nom_reservation"],
                    observation=canon["observation"],
                    ville=canon["ville"],
                    code_postal=canon["code_postal"],
                    imported_by=request.user if request.user.is_authenticated else None,
                    source_filename=getattr(up, "name", "") or "",
                    traite=False,
                )

                obj, was_created = Dossier.objects.update_or_create(
                    reference=data["reference"], defaults=data
                )
                if was_created:
                    dossiers_crees.append(obj.reference); created_ids.append(obj.id)
                else:
                    dossiers_mis_a_jour.append(obj.reference); updated_ids.append(obj.id)

                # Fiche Mouvement (selon A/D, date & aéroport pertinent)
                fiche_airport = (data["aeroport_destination"] if data["type_mouvement"] == "A"
                                 else data["aeroport_provenance"])
                fiche, _ = FicheMouvement.objects.get_or_create(
                    agence=agence, type=data["type_mouvement"], date=data["date_vol"], aeroport=fiche_airport or ""
                )
                FicheMouvementItem.objects.get_or_create(fiche=fiche, dossier=obj)

                # Ligne pour l’UI
                ui_rows.append({
                    "id": obj.id,
                    "reference": obj.reference,
                    "type": obj.type_mouvement,                           # "A"/"D"
                    "date": obj.date_vol.isoformat(),
                    "aeroport": fiche_airport or "",
                    "flight_no": obj.num_vol or "",
                    "flight_time": fmt_time(obj.heure_vol),
                    "ville": obj.ville or "",
                    "to": obj.tour_operateur or "",
                    "hotel": getattr(obj.hotel, "nom", "") or "",
                    "client_name": obj.nom_reservation or "",
                    "pax_client": obj.pax_total or 0,
                    "observation": obj.observation or "",
                })

            except Exception as e:
                erreurs.append({
                    "excel_row": excel_row, "field": "*",
                    "code": "exception", "message": f"{type(e).__name__}: {e}",
                    "raw_value": str(row.to_dict()),
                })
                if not ignore_errors:
                    continue

        # 6) Batch d’import (optionnel)
        batch_id, batch_label = None, getattr(up, "name", "") or ""
        if HAS_BATCH:
            all_ids = list(dict.fromkeys(created_ids + updated_ids))
            if all_ids:
                batch = ImportBatch.objects.create(agence=agence, user=request.user, label=f"Import {timezone.now():%Y-%m-%d %H:%M}")  # type: ignore
                batch_id = str(batch.id)
                kept_ids = list(Dossier.objects.filter(id__in=all_ids, agence=agence).values_list("id", flat=True))
                ImportBatchItem.objects.bulk_create(  # type: ignore
                    [ImportBatchItem(batch=batch, dossier_id=i) for i in kept_ids],
                    ignore_conflicts=True,
                )

        # 7) Session (dernier import pour l’UI)
        request.session["last_import_dossier_ids"] = [r["id"] for r in ui_rows if r.get("id")]
        request.session.modified = True

        # 8) Réponse
        return Response(
            {
                "message": "Import terminé",
                "agence": agence.id,
                "batch_id": batch_id,
                "batch_label": batch_label,
                "dossiers_crees": dossiers_crees,
                "dossiers_mis_a_jour": dossiers_mis_a_jour,
                "lignes_ignorees": lignes_ignorees,
                "erreurs": erreurs[:500],  # limite pour la payload
                "dossiers": ui_rows,
                "created_count": len(created_ids),
                "updated_count": len(updated_ids),
                "total_importes": len(set(created_ids + updated_ids)),
                "total_lignes": int(df.shape[0]),
            },
            status=200,
        )
    """
    POST /api/importer-dossier/
    form-data:
      - file: <xls/xlsx/csv>
      - agence: <id> (facultatif si user.profile.agence)
      - mapping: JSON (optionnel)  ex: {"date":"Date","horaires":"Horaire","da":"D/A", ...}
      - required_fields: JSON array (optionnel) ex: ["date","horaires","provenance","destination","da","num_vol","client_to","hotel","ref","titulaire","pax","adulte","enfants","bb_gratuit","observation","ville","code_postal"]
      - ignore_errors: "true"/"false" (optionnel, défaut false)
    Réponse:
      {
        "message": "...",
        "created_count": n,
        "updated_count": n,
        "total_importes": n,
        "total_lignes": n,
        "erreurs": [...],            # détails par ligne
        "lignes_ignorees": [...],    # ligne vide ou invalide
        "dossiers": [...],           # lignes clean pour l'UI
      }
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def _to_bool(self, v: Any) -> bool:
        return str(v).strip().lower() in {"1", "true", "yes", "on"}

    def _norm_da(self, raw: Any) -> Optional[str]:
        v = (str(raw or "")).strip().upper()
        if v in {"A", "ARRIVE", "ARRIVEE", "ARRIVAL", "LLEGADA", "L"}:
            return "A"
        if v in {"D", "DEPART", "DEPARTURE", "SALIDA", "S", "PARTENZA", "P"}:
            return "D"
        return None

    def _int(self, v: Any) -> int:
        try:
            return int(float(v))
        except Exception:
            return 0

    def _get_cell(self, row: dict, colname: Optional[str]) -> str:
        if not colname:
            return ""
        val = row.get(colname, "")
        if val is None:
            return ""
        s = str(val).strip()
        return "" if s.lower() in {"nan", "none", "null"} else s

    def _row_all_blank(self, row: dict) -> bool:
        return all(not str(v or "").strip() for v in row.values())

    @transaction.atomic
    def post(self, request):
        # -------- 1) Entrées --------
        up = request.FILES.get("file")
        if not up:
            return Response({"error": "Aucun fichier envoyé (file)."}, status=400)

        # agence
        agence_raw = (request.data.get("agence") or "").strip()
        if not agence_raw or agence_raw == "undefined":
            try:
                agence = request.user.profile.agence
            except Exception:
                return Response({"error": "Agence requise."}, status=400)
        else:
            try:
                agence_id = int(agence_raw)
            except Exception:
                return Response({"error": "Paramètre 'agence' invalide."}, status=400)
            agence = get_object_or_404(AgenceVoyage, id=agence_id)

        _ensure_same_agence_or_superadmin(request, agence.id)

        # options UI
        import json
        mapping = {}
        if request.data.get("mapping"):
            try:
                mapping = json.loads(request.data.get("mapping") or "{}") or {}
            except Exception:
                mapping = {}

        required_fields = []
        if request.data.get("required_fields"):
            try:
                required_fields = json.loads(request.data.get("required_fields") or "[]") or []
            except Exception:
                required_fields = []
        required_set = set(x.strip().lower() for x in required_fields)

        ignore_errors = self._to_bool(request.data.get("ignore_errors"))
        filename = getattr(up, "name", "") or ""

        # -------- 2) Lecture DataFrame --------
        try:
            df = smart_read_excel(up)
        except Exception as e:
            return Response({"error": f"Erreur lecture Excel: {e}"}, status=400)
        if df is None or df.empty:
            return Response({"error": "Le fichier est vide."}, status=400)

        # Pour lookup direct par nom de colonne
        cols = list(df.columns)
        # dict(row) renverra {colname: value} par ligne
        df = df.fillna("")

        # -------- 3) Itération + mapping --------
        created_ids, updated_ids = [], []
        dossiers_crees, dossiers_mis_a_jour = [], []
        lignes_ignorees, erreurs, ui_rows = [], [], []

        # clés attendues côté mapping (standard UI)
        # on ne force pas tout : on lit ce que l'UI a relié
        std_keys = [
            "date","horaires","provenance","destination","da","num_vol","client_to",
            "hotel","ref","titulaire","pax","adulte","enfants","bb_gratuit","observation",
            "ville","code_postal"
        ]

        for idx, row in df.iterrows():
            excel_row = int(idx) + 2  # entête à la ligne 1
            src = {c: row.get(c) for c in cols}
            if self._row_all_blank(src):
                lignes_ignorees.append({"ligne": excel_row, "raison": "Ligne vide"})
                continue

            # Lire les valeurs via mapping
            val = {k: self._get_cell(src, mapping.get(k)) for k in std_keys}

            # Validation "required"
            missing = [k for k in required_set if not val.get(k)]
            # DA normalisé
            # da may be inferred later; don't block on missing 'da' here
            da_code = self._norm_da(val.get("da"))
                # if "da" in required_set and not da_code:
                #     missing.append("da")
            if (missing and not ignore_errors):
                erreurs.append({
                    "excel_row": excel_row,
                    "code": "missing_required",
                    "fields": missing,
                    "row": {k: val.get(k) for k in std_keys},
                })
                lignes_ignorees.append({"ligne": excel_row, "raison": f"Champs requis manquants: {', '.join(missing)}"})
                continue

            # HÔTEL (création souple)
            hotel_obj = None
            if val.get("hotel"):
                hotel_obj = Hotel.objects.filter(nom__iexact=val["hotel"]).first()
                if hotel_obj is None:
                    try:
                        hotel_obj = Hotel.objects.create(nom=val["hotel"])
                    except Exception:
                        hotel_obj = None  # on n'empêche pas l'enregistrement

            # Direction (A/D) et affectation champs
            pax_total = self._int(val.get("pax"))
            adu = self._int(val.get("adulte"))
            enf = self._int(val.get("enfants"))
            bb  = self._int(val.get("bb_gratuit"))
            if pax_total <= 0:
                pax_total = max(pax_total, adu + enf + bb)

            # On pose soit arrivée, soit départ ; si DA inconnu mais ignore_errors=True on choisit heuristique:
            # (si provenance seulement => D, sinon => A)
            da_eff = da_code
            if da_eff is None:
                da_eff = "D" if (val.get("provenance") and not val.get("destination")) else "A"

            defaults = {
                "agence": agence,
                "ville": val.get("ville") or "",
                "aeroport_depart": val.get("provenance") or "",
                "aeroport_arrivee": val.get("destination") or "",
                "num_vol_arrivee": (val.get("num_vol") or "") if da_eff == "A" else "",
                "num_vol_retour":  (val.get("num_vol") or "") if da_eff == "D" else "",
                "heure_arrivee":   (f"{val.get('date')} {val.get('horaires')}".strip() if da_eff == "A" else None),
                "heure_depart":    (f"{val.get('date')} {val.get('horaires')}".strip() if da_eff == "D" else None),
                "hotel": hotel_obj,
                "nombre_personnes_arrivee": pax_total if da_eff == "A" else 0,
                "nombre_personnes_retour":  pax_total if da_eff == "D" else 0,
                "nom_reservation": val.get("titulaire") or "",
                "tour_operateur": val.get("client_to") or "",
                "observation": val.get("observation") or "",
                "traite": False,
            }

            # champs additionnels si existent dans le modèle
            if hasattr(Dossier, "code_postal"):
                defaults["code_postal"] = val.get("code_postal") or ""
            if hasattr(Dossier, "adulte"):
                defaults["adulte"] = adu
            if hasattr(Dossier, "enfants"):
                defaults["enfants"] = enf
            if hasattr(Dossier, "bb_gratuit"):
                defaults["bb_gratuit"] = bb
            if hasattr(Dossier, "imported_by"):
                defaults["imported_by"] = request.user
            if hasattr(Dossier, "source_filename"):
                defaults["source_filename"] = filename

            ref = (val.get("ref") or "").strip()
            if not ref:
                # Si ref est required, on est déjà passé dans le bloc missing ; sinon on ignore/erreur douce
                if "ref" in required_set and not ignore_errors:
                    erreurs.append({"excel_row": excel_row, "code": "missing_reference", "row": val})
                    lignes_ignorees.append({"ligne": excel_row, "raison": "Référence manquante"})
                    continue
                # ref manquante mais on veut continuer -> on fabrique une pseudo ref stable
                    ref = f"AUTO-{hash((val.get('date'), val.get('horaires'), val.get('titulaire'), excel_row)) & 0xFFFFFFFF:08X}"

            try:
                obj, was_created = Dossier.objects.update_or_create(reference=ref, defaults=defaults)
            except Exception as e:
                erreurs.append({
                    "excel_row": excel_row,
                    "code": "save_error",
                    "message": f"{type(e).__name__}: {e}",
                    "row": val,
                })
                lignes_ignorees.append({"ligne": excel_row, "raison": "Erreur d’enregistrement"})
                continue

            if was_created:
                created_ids.append(obj.id)
                dossiers_crees.append(ref)
            else:
                updated_ids.append(obj.id)
                dossiers_mis_a_jour.append(ref)

            # Ligne pour l’UI
            ui_type = "A" if obj.heure_arrivee else ("D" if obj.heure_depart else "")
            ui_date = ((obj.heure_arrivee or obj.heure_depart).date().isoformat()
                       if (obj.heure_arrivee or obj.heure_depart) else "")
            ui_airport = obj.aeroport_arrivee if ui_type == "A" else (obj.aeroport_depart if ui_type == "D" else "")
            ui_flight_no = obj.num_vol_arrivee if ui_type == "A" else (obj.num_vol_retour if ui_type == "D" else "")
            def _fmt_hhmm(dt):
                try:
                    return dt.strftime("%H:%M") if dt else ""
                except Exception:
                    return ""
            ui_flight_time = _fmt_hhmm(obj.heure_arrivee if ui_type == "A" else obj.heure_depart)
            ui_pax_client = obj.nombre_personnes_arrivee or obj.nombre_personnes_retour or 0

            ui_rows.append({
                "id": obj.id,
                "reference": obj.reference,
                "type": ui_type,
                "date": ui_date,
                "aeroport": ui_airport,
                "flight_no": ui_flight_no,
                "flight_time": ui_flight_time,
                "ville": obj.ville or "",
                "to": obj.tour_operateur or "",
                "hotel": getattr(obj.hotel, "nom", "") or "",
                "client_name": obj.nom_reservation or "",
                "pax_client": ui_pax_client,
                "observation": obj.observation or "",
            })

        # -------- 4) Réponse --------
        return Response(
            {
                "message": "Import terminé",
                "agence": agence.id,
                "dossiers_crees": dossiers_crees,
                "dossiers_mis_a_jour": dossiers_mis_a_jour,
                "lignes_ignorees": lignes_ignorees,
                "erreurs": erreurs[:200],
                "dossiers": ui_rows,
                "created_count": len(created_ids),
                "updated_count": len(updated_ids),
                "total_importes": len(set(created_ids + updated_ids)),
                "total_lignes": int(df.shape[0]),
            },
            status=200,
        )
    """
    POST /api/importer-dossiers/
    form-data:
      - file: <xls/xlsx/csv>
      - agence: <id>

    Effets:
      - Lit le fichier (smart_read_excel)
      - Normalise chaque ligne
      - update_or_create(Dossier) par reference
      - Crée 1 ImportBatch (si lignes valides) et les ImportBatchItem
      - Retourne les lignes erronées/ignorées + un tableau 'dossiers' pour l’UI
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    # =============== utilitaires d'extraction (colonnes / texte UI) ===============
    def _find_cols_any(self, df: pd.DataFrame, *keywords: str) -> List[str]:
        want = {_norm_header(k) for k in keywords}
        results = []
        for col in df.columns:
            if any(w in _norm_header(col) for w in want):
                results.append(col)
        return results

    def _pick_hotel_col(self, df: pd.DataFrame) -> Optional[str]:
        candidates = [c for c in df.columns if "hotel" in _norm_header(c)]
        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]
        best_col, best_score = candidates[0], -1
        for col in candidates:
            ser = df[col].dropna().astype(str).head(50)
            score = sum(1 for v in ser if re.search(r"[A-Za-zÀ-ÿ]", v))
            if score > best_score:
                best_col, best_score = col, score
        return best_col

    def _extract_nom_reservation(self, df: pd.DataFrame, row: pd.Series) -> Optional[str]:
        cols = list(df.columns)
        norm_map = {c: _norm_header(c) for c in cols}

        def _good(col: str) -> bool:
            n = norm_map[col]
            if re.search(r"\b(to|tour|operat)\b", n):
                return False
            if "client" in n and "to" in n:
                return False
            return True

        g1_keys = ["titulaire","tetulaire","holder","lead","leadname","bookingname","titular"]
        g1 = [c for c in cols if any(k in norm_map[c] for k in g1_keys) and _good(c)]

        g2_keys = ["nomreservation","nomresa","reservation","groupe","group","booking","passager","paxnames"]
        g2 = [c for c in cols if any(k in norm_map[c] for k in g2_keys) and _good(c)]

        g3 = [c for c in cols if ("client" in norm_map[c]) and _good(c)]

        for group in (g1, g2, g3):
            for c in group:
                v = _first_str(row.get(c))
                if v:
                    s = re.sub(r"\s+", " ", v).strip()
                    if s and s.lower() not in {"nan", "none", "null", "-"}:
                        return s

        last_name_cols = self._find_cols_any(df, "nom","lastname","last_name","surname","apellidos")
        first_name_cols = self._find_cols_any(df, "prenom","firstname","first_name","givenname","nombre")
        ln = next((_first_str(row.get(c)) for c in last_name_cols if _first_str(row.get(c))), None)
        fn = next((_first_str(row.get(c)) for c in first_name_cols if _first_str(row.get(c))), None)
        combined = " ".join([fn or "", ln or ""]).strip()
        return combined or None

    def _collect_observations(self, df: pd.DataFrame, row: pd.Series) -> str:
        obs_exact_norms = {
            "observation","observations","observatio","observ","obs","remark","remarks","remarque","remarques",
            "note","notes","comment","comments","commentaire","commentaires","coment","coments","comentario","comentarios",
        }
        obs_num_re = re.compile(
            r"^(obs|observ|observation|observations|observatio|remark|remarks|remarque|remarques|"
            r"note|notes|comment|comments|commentaire|commentaires|coment|coments|comentario|comentarios)\d+$"
        )
        cols = list(df.columns)
        norm_map: Dict[str, List[str]] = {}
        for c in cols:
            norm_map.setdefault(_norm_header(c), []).append(c)
        obs_cols_set = set()
        for n, originals in norm_map.items():
            if n in obs_exact_norms:
                obs_cols_set.update(originals)
        for n, originals in norm_map.items():
            if obs_num_re.match(n):
                obs_cols_set.update(originals)
        if not obs_cols_set:
            for n, originals in norm_map.items():
                if any(k in n for k in obs_exact_norms):
                    obs_cols_set.update(originals)
        obs_cols = [c for c in cols if c in obs_cols_set]

        def _is_meaningful(val) -> bool:
            if val is None or (isinstance(val, float) and pd.isna(val)):
                return False
            s = str(val).strip()
            return bool(s) and s.lower() not in {"0", "0.0", "nan", "none", "null", "-"}

        def _clean_text(s: str) -> str:
            s = str(s).replace("\r", " ").replace("\n", " ")
            s = s.replace("T#", " ").replace("#", " ")
            s = re.sub(r"\s+", " ", s).strip()
            return s

        pieces, seen = [], set()
        for c in obs_cols:
            raw = row.get(c)
            if _is_meaningful(raw):
                txt = _clean_text(_first_str(raw) or "")
                if txt and txt not in seen:
                    seen.add(txt)
                    pieces.append(txt)
        return " | ".join(pieces)

    # =============================== POST ===============================
    @transaction.atomic
    def post(self, request):
        # 1) fichier + agence
        up = request.FILES.get("file")
        if not up:
            return Response({"error": "Aucun fichier envoyé (file)."}, status=400)

        agence_raw = (request.data.get("agence") or "").strip()
        if not agence_raw or agence_raw == "undefined":
            try:
                agence = request.user.profile.agence
            except Exception:
                return Response({"error": "Agence requise."}, status=400)
        else:
            try:
                agence_id = int(agence_raw)
            except Exception:
                return Response({"error": "Paramètre 'agence' invalide."}, status=400)
            agence = get_object_or_404(AgenceVoyage, id=agence_id)

        _ensure_same_agence_or_superadmin(request, agence.id)  # contrôle d'accès

        # 2) lecture dataframe
        try:
            df = smart_read_excel(up)
        except Exception as e:
            return Response({"error": f"Erreur lecture Excel: {e}"}, status=400)
        if df is None or df.empty:
            return Response({"error": "Le fichier est vide."}, status=400)

        cols = list(df.columns)

        # Sélection des colonnes candidates (via helpers) :contentReference[oaicite:4]{index=4}
        def _find_col(df_: pd.DataFrame, keys: List[str]) -> Optional[str]:
            # recherche exacte puis partielle sur en-têtes normalisés
            norm_keys = [_norm_header(k) for k in keys]
            for c in df_.columns:
                nc = _norm_header(c)
                if nc in norm_keys:
                    return c
            for c in df_.columns:
                nc = _norm_header(c)
                if any(k in nc for k in norm_keys):
                    return c
            return None

        col_ref_to  = _find_col(df, ["Ref.T.O.","Ref TO","RefTO","RefTO.","Ref T.O.","Ref T O","Ref_T_O","Ref.TO"])
        col_ntra    = _find_col(df, ["Ntra.Ref","NtraRef","Ntra Ref","Ntra"])
        col_ref_alt = _find_col(df, ["Reference","Référence","Ref","REF","N° dossier","N dossier","N_DOSSIER"])
        col_ref     = col_ref_to or col_ntra or col_ref_alt

        col_day  = _find_col(df, ["Dia","DATE","Date","Fecha","Jour","Data"])
        col_time = _find_col(df, ["Hora","Horaires","Horaire","Heure","Time","Horas"])
        col_vol  = _find_col(df, ["Vuelo","Vol","Flight","N° VOL","N VOL","Nº VOL","N° Vol","N°Vol","No Vol"])
        col_org  = _find_col(df, ["Org","Provenance","Orig","From","Origen"])
        col_dst  = _find_col(df, ["Dst","Destination","To","Destino"])
        col_ls   = _find_col(df, ["L/S","LS","D/A","A/D","DA","AD","Type Mouvement","Type","Mouvement",
                                  "DEPART/ARRIVER","DEPART/ARRIVE","Depart/Arrivee","DEPART ARRIVEE"])
        col_city = _find_col(df, ["Ciudad","Ville","City","Localite","Localité","Ciudad/Zone","Zone"])
        col_to   = _find_col(df, ["T.O.","TO","Client TO","CLIENT/ TO","CLIENT TO","Client/ TO"])
        col_zip  = _find_col(df, ["Code Postal","Postal","ZIP","Postcode","CP","Codigo Postal","Código Postal","CodigoPostal","CódigoPostal"])
        col_hotel= self._pick_hotel_col(df)
        col_name = _find_col(df, ["Titular","Titulaire","TETULAIRE","Nom","Name","Holder","Client","Tetulaire"])

        col_pax  = _find_col(df, ["Pax","PAX","Passengers"])
        adult_cols = self._find_cols_any(df, "adulte","adultes","adults","adultos")
        child_cols = self._find_cols_any(df, "enfant","enfants","children","ninos","niños","nenes")
        baby_cols  = self._find_cols_any(df, "bb","bebe","bebes","bb/gratuit","infant","baby","bebesgratuit")

        # 3) boucle d’import
        created_ids: List[int] = []
        updated_ids: List[int] = []
        dossiers_crees: List[str] = []
        dossiers_mis_a_jour: List[str] = []
        lignes_ignorees: List[Dict[str, Any]] = []
        erreurs: List[Dict[str, Any]] = []
        ui_rows: List[Dict[str, Any]] = []

        def fmt_hhmm(dt):
            try:
                return dt.strftime("%H:%M") if dt else ""
            except Exception:
                return ""

        for idx, row in df.iterrows():
            excel_row = int(idx) + 2  # 1-based + ligne d'entête
            try:
                # Référence (obligatoire)
                ref = None
                for c in [col_ref, col_ref_to, col_ntra, col_ref_alt]:
                    if c and not ref:
                        ref = _first_str(row.get(c))
                if not ref:
                    lignes_ignorees.append({"ligne": excel_row, "raison": "Référence manquante"})
                    erreurs.append({
                        "excel_row": excel_row, "field": "reference",
                        "code": "missing_required", "message": "Référence manquante",
                        "raw_value": str(row.to_dict())
                    })
                    continue
                ref = ref.strip()

                # Date/Heure → datetime
                day_val, time_val = (row.get(col_day) if col_day else None), (row.get(col_time) if col_time else None)
                dt = _combine_datetime(day_val, time_val)  # → aware datetime ou None

                # Orig/Dest/Type + normalisation vol / IATA
                org_val = row.get(col_org) if col_org else None
                dst_val = row.get(col_dst) if col_dst else None
                da_val  = row.get(col_ls)  if col_ls  else None
                org_iata, dst_iata, type_code, errs_codes = resolve_airports_and_type(org_val, dst_val, da_val)

                vol = normalize_flight_no(row.get(col_vol)) if col_vol else ""
                ville = _first_str(row.get(col_city)) if col_city else ""
                tour_op = _first_str(row.get(col_to)) if col_to else ""

                # PAX
                pax_raw = _first_str(row.get(col_pax)) if col_pax else None
                try:
                    pax = int(float(pax_raw)) if pax_raw is not None else 0
                except Exception:
                    pax = 0
                if pax <= 0:
                    ad = sum(_parse_int_cell(row.get(c)) for c in adult_cols)
                    ch = sum(_parse_int_cell(row.get(c)) for c in child_cols)
                    bb = sum(_parse_int_cell(row.get(c)) for c in baby_cols)
                    pax = max(pax, ad + ch + bb)

                # Nom réservation + Hôtel
                nom_resa = self._extract_nom_reservation(df, row) or (_first_str(row.get(col_name)) if col_name else "")
                hotel_nom = _first_str(row.get(col_hotel)) if col_hotel else None
                hotel_obj = None
                if hotel_nom:
                    hotel_obj = Hotel.objects.filter(nom__iexact=hotel_nom).first()
                    if not hotel_obj:
                        hotel_obj = Hotel.objects.create(nom=hotel_nom)

                # Construire champs A/D
                heure_arrivee = heure_depart = None
                num_vol_arrivee = num_vol_retour = ""
                if type_code == "A":
                    heure_arrivee, num_vol_arrivee = dt, (vol or "")
                elif type_code == "D":
                    heure_depart,  num_vol_retour  = dt, (vol or "")
                else:
                    # heuristique si type indéterminé
                    if org_iata and not dst_iata:
                        heure_depart,  num_vol_retour  = dt, (vol or "")
                    else:
                        heure_arrivee, num_vol_arrivee = dt, (vol or "")

                # Observations + erreurs “douces” (IATA/type)
                obs_joined = self._collect_observations(df, row)
                if errs_codes:
                    obs_joined = (obs_joined + " | " if obs_joined else "") + "; ".join(errs_codes)

                data = {
    "agence": agence,
    "ville": ville or "",
    "code_postal": _first_str((row.get(col_zip) if 'col_zip' in locals() and col_zip else '')) or "",
    "aeroport_arrivee": (dst_iata or _first_str(dst_val) or ""),
    "num_vol_arrivee": num_vol_arrivee or "",
    "heure_arrivee": heure_arrivee,
    "aeroport_depart": (org_iata or _first_str(org_val) or ""),
    "heure_depart": heure_depart,
    "num_vol_retour": num_vol_retour or "",
    "hotel": hotel_obj,
    "nombre_personnes_arrivee": pax if heure_arrivee else 0,
    "nombre_personnes_retour":  pax if heure_depart  else 0,
    "nb_adultes": ad,
    "nb_enfants": ch,
    "nb_bb_gratuits": bb,
    "nom_reservation": nom_resa or "",
    "tour_operateur": tour_op or "",
    "observation": obs_joined or "",
    "traite": False,
    "imported_by": request.user if getattr(request, "user", None) and request.user.is_authenticated else None,
    "source_filename": getattr(up, "name", "") or "",
}


                obj, was_created = Dossier.objects.update_or_create(reference=ref, defaults=data)
                if was_created:
                    dossiers_crees.append(ref); created_ids.append(obj.id)
                else:
                    dossiers_mis_a_jour.append(ref); updated_ids.append(obj.id)

                # (optionnel) créer/associer une fiche de mouvement
                fiche_type = "A" if data["heure_arrivee"] else ("D" if data["heure_depart"] else "")
                fiche_dt = (data["heure_arrivee"] or data["heure_depart"])
                fiche_date = fiche_dt.date() if fiche_dt else None
                fiche_airport = data["aeroport_arrivee"] if fiche_type == "A" else (data["aeroport_depart"] if fiche_type == "D" else "")
                if fiche_type and fiche_date:
                    fiche, _ = FicheMouvement.objects.get_or_create(
                        agence=agence, type=fiche_type, date=fiche_date, aeroport=fiche_airport or ""
                    )
                    FicheMouvementItem.objects.get_or_create(fiche=fiche, dossier=obj)

                # Ligne UI compacte
                ui_type = "A" if obj.heure_arrivee else ("D" if obj.heure_depart else "")
                ui_date = ((obj.heure_arrivee or obj.heure_depart).date().isoformat()
                           if (obj.heure_arrivee or obj.heure_depart) else "")
                ui_airport = obj.aeroport_arrivee if ui_type == "A" else (obj.aeroport_depart if ui_type == "D" else "")
                ui_flight_no = obj.num_vol_arrivee if ui_type == "A" else (obj.num_vol_retour if ui_type == "D" else "")
                ui_flight_time = fmt_hhmm(obj.heure_arrivee if ui_type == "A" else obj.heure_depart)
                ui_pax_client = obj.nombre_personnes_arrivee or obj.nombre_personnes_retour or 0
                ui_rows.append({
                    "id": obj.id, "reference": obj.reference, "type": ui_type, "date": ui_date,
                    "aeroport": ui_airport, "flight_no": ui_flight_no, "flight_time": ui_flight_time,
                    "ville": obj.ville or "", "to": obj.tour_operateur or "", "hotel": getattr(obj.hotel, "nom", "") or "",
                    "client_name": obj.nom_reservation or "", "pax_client": ui_pax_client, "observation": obj.observation or "",
                })

            except Exception as e:
                lignes_ignorees.append({"ligne": excel_row, "raison": f"{type(e).__name__}: {e}"})
                erreurs.append({
                    "excel_row": excel_row, "field": "*",
                    "code": "exception",
                    "message": f"{type(e).__name__}: {e}",
                    "raw_value": str(row.to_dict()),
                })
                continue

        # 4) batch (une seule fois, si au moins un dossier)
        batch_id, batch_label = None, getattr(up, "name", "") or ""
        if HAS_BATCH:
            all_ids = list(dict.fromkeys(created_ids + updated_ids))
            if all_ids:
                batch = ImportBatch.objects.create(agence=agence, user=request.user, label=f"Import {timezone.now():%Y-%m-%d %H:%M}")  # type: ignore
                batch_id = str(batch.id)
                kept_ids = list(Dossier.objects.filter(id__in=all_ids, agence=agence).values_list("id", flat=True))
                ImportBatchItem.objects.bulk_create(  # type: ignore
                    [ImportBatchItem(batch=batch, dossier_id=i) for i in kept_ids],
                    ignore_conflicts=True
                )

        # 5) session (dernier import pour l’UI)
        imported_ids = [r["id"] for r in ui_rows if r.get("id")]
        request.session["last_import_dossier_ids"] = imported_ids
        request.session.modified = True

        # 6) réponse
        return Response(
            {
                "message": "Import terminé",
                "agence": agence.id,
                "batch_id": batch_id,
                "batch_label": batch_label,
                "dossiers_crees": dossiers_crees,
                "dossiers_mis_a_jour": dossiers_mis_a_jour,
                "lignes_ignorees": lignes_ignorees,   # lignes non traitées (ex: ref manquante)
                "erreurs": erreurs[:200],              # erreurs détaillées (par champ / exception)
                "dossiers": ui_rows,                   # tableau prêt pour l’UI
                "created_count": len(created_ids),
                "updated_count": len(updated_ids),
                "total_importes": len(set(created_ids + updated_ids)),
                "total_lignes": int(df.shape[0]),
            },
            status=200,
        )

# ---------------------------------------------------------------------
# Import Véhicules
# ---------------------------------------------------------------------

def _norm(s: Any) -> str:
    if s is None:
        return ""
    s = str(s).strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    out = []
    for ch in s:
        out.append(ch if ch.isalnum() else "_")
    return "".join(out).strip("_").upper()


HEADER_ALIASES: Dict[str, List[str]] = {
    "IMMATRICULATION": ["IMMATRICULATION","IMMAT","PLAQUE","MATRICULE","REG","REG_NO","REGISTRATION","NUM_IMMATRICULATION"],
    "MARQUE": ["MARQUE","BRAND","MAKE"],
    "MODELE": ["MODELE","MODEL","MODELE_","MODElE","MODÈLE"],
    "TYPE": ["TYPE","CATEGORIE","CATEGORY","VEHICLE_TYPE"],
    "CAPACITE": ["CAPACITEE","CAPACITE","CAPACITE_","CAPACITY","SEATS","NB_PLACES","PLACES"],
    "ANNEE": ["ANNEE","ANNEE_","YEAR"],
}
REQUIRED_KEYS = ["IMMATRICULATION","MARQUE","MODELE"]

def _build_header_map(header_cells: List[Any]) -> Dict[str, int]:
    present = {_norm(v): idx for idx, v in enumerate(header_cells) if _norm(v)}
    mapping: Dict[str, int] = {}
    for logical, aliases in HEADER_ALIASES.items():
        for alias in aliases:
            norm_alias = _norm(alias)
            if norm_alias in present:
                mapping[logical] = present[norm_alias]
                break
    return mapping

def _cell_val(cell) -> Any:
    if cell is None:
        return None
    v = cell.value
    if isinstance(v, str):
        return v.strip()
    return v


class ImporterVehiculesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        file = request.FILES.get("file")
        agence_id = request.POST.get("agence") or request.data.get("agence")
        if not file:
            return Response({"error": "Aucun fichier reçu."}, status=400)
        if not agence_id:
            return Response({"error": "Paramètre 'agence' requis."}, status=400)

        _ensure_same_agence_or_superadmin(request, int(agence_id))
        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        try:
            wb = load_workbook(file, data_only=True)
            ws = wb.active
        except Exception as e:
            return Response({"error": f"Fichier illisible ({e})."}, status=400)

        header_row_idx = None
        for i, row in enumerate(ws.iter_rows(min_row=1, max_row=min(20, ws.max_row))):
            labels = [(_cell_val(c) or "") for c in row]
            if any(str(v).strip() for v in labels):
                header_row_idx = i + 1
                header_cells = labels
                break
        if header_row_idx is None:
            return Response({"error": "Aucune ligne d'en-têtes détectée."}, status=400)

        header_map = _build_header_map(header_cells)
        missing = [k for k in REQUIRED_KEYS if k not in header_map]
        if missing:
            detected = ", ".join([f"{k}→col{header_map[k]+1}" for k in header_map.keys()])
            return Response(
                {"error": f"Colonnes manquantes dans le fichier: {', '.join(missing)}", "detected": detected},
                status=400,
            )

        created, updated, ignored = [], [], []
        for row_idx in range(header_row_idx + 1, ws.max_row + 1):
            row = [_cell_val(c) for c in ws[row_idx]]

            def colv(key, default=None):
                idx = header_map.get(key)
                if idx is None or idx >= len(row):
                    return default
                return row[idx]

            immat = (colv("IMMATRICULATION") or "").strip()
            if not immat:
                ignored.append({"ligne": row_idx, "raison": "Pas d'immatriculation"})
                continue

            marque = (colv("MARQUE") or "").strip()
            modele = (colv("MODELE") or "").strip()
            type_ = (colv("TYPE") or "").strip().lower() or "minibus"
            try:
                capacite = int(colv("CAPACITE") or 0)
            except Exception:
                capacite = 0
            try:
                annee = int(colv("ANNEE") or 0)
            except Exception:
                annee = 0

            if not marque or not modele:
                ignored.append({"ligne": row_idx, "raison": "MARQUE/MODELE manquant"})
                continue

            obj, was_created = Vehicule.objects.get_or_create(
                immatriculation=immat,
                defaults={
                    "type": (type_ if type_ in dict(Vehicule.TYPE_CHOICES) else "minibus"),
                    "marque": marque,
                    "model": modele,
                    "capacite": capacite,
                    "annee": annee or 0,
                    "agence": agence,
                },
            )
            if not was_created:
                changed = False
                if obj.agence_id != agence.id:
                    ignored.append({"ligne": row_idx, "raison": f"Immat déjà utilisée par une autre agence ({obj.agence_id})."})
                    continue
                if marque and obj.marque != marque:
                    obj.marque = marque; changed = True
                if modele and obj.model != modele:
                    obj.model = modele; changed = True
                if type_ and type_ in dict(Vehicule.TYPE_CHOICES) and obj.type != type_:
                    obj.type = type_; changed = True
                if capacite and obj.capacite != capacite:
                    obj.capacite = capacite; changed = True
                if annee and obj.annee != annee:
                    obj.annee = annee; changed = True
                if changed:
                    obj.save()
                    updated.append({"id": obj.id, "immatriculation": obj.immatriculation})
                else:
                    ignored.append({"ligne": row_idx, "raison": "Aucune modification."})
            else:
                created.append({"id": obj.id, "immatriculation": obj.immatriculation})

        return Response({"vehicules_crees": created, "vehicules_mis_a_jour": updated, "lignes_ignorees": ignored}, status=200)


# ---------------------------------------------------------------------
# Import Chauffeurs
# ---------------------------------------------------------------------

class ImporterChauffeursAPIView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    HEADERS = {
        "nom": ["NOM", "Nom", "Last name", "Apellido"],
        "prenom": ["PRENOM", "Prénom", "First name", "Nombre"],
        "cin": ["CIN", "N° CIN", "C.I.N", "ID", "Identité"],
    }

    def _find_col(self, df, candidates):
        for c in candidates:
            if c in df.columns:
                return c
        lowered = {str(col).strip().lower(): col for col in df.columns}
        for c in candidates:
            key = str(c).strip().lower()
            if key in lowered:
                return lowered[key]
        return None

    def _clean_str(self, val):
        if pd.isna(val) or val is None:
            return ""
        return str(val).strip()

    def post(self, request, *args, **kwargs):
        fichier = request.FILES.get("file")
        agence_id = request.data.get("agence")
        if not fichier:
            return Response({"error": "Aucun fichier envoyé."}, status=400)
        if not agence_id:
            return Response({"error": "Aucune agence spécifiée."}, status=400)
        _ensure_same_agence_or_superadmin(request, int(agence_id))
        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        try:
            df = pd.read_excel(fichier)
        except Exception as e:
            return Response({"error": f"Erreur lecture fichier Excel: {e}"}, status=400)

        col_nom = self._find_col(df, self.HEADERS["nom"])
        col_prenom = self._find_col(df, self.HEADERS["prenom"])
        col_cin = self._find_col(df, self.HEADERS["cin"])

        if not col_nom:
            return Response({"error": "Colonne NOM manquante."}, status=400)

        created, updated, ignored = [], [], []
        for idx, row in df.iterrows():
            nom = self._clean_str(row.get(col_nom))
            prenom = self._clean_str(row.get(col_prenom)) if col_prenom else ""
            cin = self._clean_str(row.get(col_cin)) if col_cin else ""

            if not nom:
                ignored.append({"ligne": idx + 2, "raison": "Nom manquant"})
                continue

            obj, was_created = Chauffeur.objects.update_or_create(
                agence=agence,
                nom=nom,
                prenom=prenom or "",
                defaults={"cin": cin or "", "agence": agence, "nom": nom, "prenom": prenom or ""},
            )
            (created if was_created else updated).append(f"{nom} {prenom}".strip())

        return Response(
            {
                "message": "Import chauffeurs terminé",
                "agence": agence.id,
                "chauffeurs_crees": created,
                "chauffeurs_mis_a_jour": updated,
                "lignes_ignorees": ignored,
                "resume": {
                    "crees": len(created),
                    "mis_a_jour": len(updated),
                    "ignores": len(ignored),
                    "total_lues": int(df.shape[0]),
                },
            },
            status=200,
        )
