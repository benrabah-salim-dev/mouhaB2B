import io
import re
import unicodedata
import difflib
from typing import Any, Dict, List, Optional
import pandas as pd

def smart_read_excel(file_like, max_header_scan: int = 400) -> pd.DataFrame:
    """
    Lecture robuste multi-feuilles ET multi-blocs :
    - lit le fichier en mémoire pour éviter les curseurs épuisés
    - support CSV / XLS / XLSX
    - sur chaque feuille, détecte TOUTES les lignes d'en-têtes plausibles (scan large)
      puis extrait chaque "bloc" (entêtes -> données jusqu'au prochain bloc) et concatène.
    """
    # --- charge en mémoire ---
    if hasattr(file_like, "read"):
        raw_bytes = file_like.read()
    else:
        raw_bytes = file_like if isinstance(file_like, (bytes, bytearray)) else bytes(file_like)
    if not raw_bytes:
        return pd.DataFrame()
    bio = io.BytesIO(raw_bytes)
    filename = getattr(file_like, "name", "") or getattr(file_like, "filename", "") or ""

    # --- helpers ---
    def _norm(s: Any) -> str:
        if s is None or (isinstance(s, float) and pd.isna(s)):
            return ""
        s = str(s)
        s = unicodedata.normalize("NFD", s)
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
        s = s.lower().strip().replace("_", " ")
        s = re.sub(r"\s+", " ", s)
        return s

    expected_tokens = {
        "date","horaire","horaires","hora","provenance","org","origen","destination","dst","destino",
        "d/a","a/d","l/s","ls","depart/arriver","type","mouvement","n° vol","n vol","vuelo","flight","vol",
        "client/ to","client to","to","t.o.","tour operateur","tour opérateur","tour operador","hotel","hôtel",
        "ref","référence","reference","ntra.ref","ref t.o.","ref to","titulaire","tetulaire","titular","name","holder",
        "pax","passengers","adultes","adultos","enfants","niños","ninos","bb/gratuit","bebe","bebes",
        "observation","observations","coment","comentario","comments",
    }

    def score_header_row(series: pd.Series) -> float:
        cells = [_norm(v) for v in series.tolist()]
        if not any(cells):
            return -1e9
        non_empty = sum(1 for c in cells if c)
        if non_empty < 2:
            return -1e9
        score = 0.0
        for c in cells:
            if not c:
                continue
            if any(tok in c for tok in expected_tokens):
                score += 2.0
            if re.search(r"\d{3,}", c):
                score -= 0.25
        score += 0.15 * non_empty
        return score

    def tidy_df(df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return pd.DataFrame()
        df = df.dropna(axis=1, how="all")
        df = df.dropna(how="all")
        if df.empty:
            return pd.DataFrame()
        fixed_cols, used = [], set()
        for i, c in enumerate(df.columns):
            nc = (c if isinstance(c, str) else "") or ""
            nc = nc.strip()
            if not nc or re.match(r"^unnamed", nc, re.I):
                nc = f"col_{i+1}"
            if nc in used:
                k = 2
                while f"{nc}_{k}" in used:
                    k += 1
                nc = f"{nc}_{k}"
            used.add(nc)
            fixed_cols.append(nc)
        df.columns = fixed_cols
        while df.shape[1] > 0:
            first_col = df.iloc[:, 0]
            ratio_nan = first_col.isna().mean()
            ratio_blank = (first_col.astype(str).str.strip() == "").mean()
            if max(ratio_nan, ratio_blank) >= 0.95:
                df = df.iloc[:, 1:]
            else:
                break
        for c in df.columns:
            if df[c].dtype == object:
                df[c] = df[c].apply(lambda x: x.strip() if isinstance(x, str) else x)
        df = df.dropna(how="all")
        return df if not df.empty else pd.DataFrame()

    def _extract_blocks(raw: pd.DataFrame) -> List[pd.DataFrame]:
        """
        Détecte plusieurs entêtes candidates et découpe les blocs successifs.
        """
        if raw is None or raw.empty:
            return []
        raw = raw.map(lambda x: x.strip() if isinstance(x, str) else x)

        n = len(raw)
        scan_limit = min(max_header_scan, n)
        # Scorer les premières lignes (large) + quelques lignes plus loin si besoin
        scores = [(i, score_header_row(raw.iloc[i])) for i in range(scan_limit)]
        # garder les lignes avec score > 0 (raisonnable) ou top-N par sécurité
        positives = [i for i, s in scores if s > 0]
        if not positives:
            # fallback: meilleure ligne
            best_idx = max(scores, key=lambda t: t[1])[0] if scores else 0
            positives = [best_idx]

        # dédupliquer des entêtes trop proches (ex: ligne 5 et 6 quasi pareil)
        positives.sort()
        headers_idx = []
        last = -10**9
        for i in positives:
            if i - last >= 2:  # au moins 1 ligne d'écart
                headers_idx.append(i)
                last = i

        # Ajoute dernier index = fin
        headers_idx = sorted(set(headers_idx))
        blocks: List[pd.DataFrame] = []
        for k, h in enumerate(headers_idx):
            h2 = headers_idx[k + 1] if k + 1 < len(headers_idx) else n
            # borne supérieure: jusqu'à avant la prochaine en-tête
            headers = raw.iloc[h].tolist()
            data = raw.iloc[h + 1 : h2].copy()
            # couper une potentielle traîne vide
            # (on enlève les dernières lignes totalement vides)
            while len(data) and data.tail(1).isna().all(axis=None):
                data = data.iloc[:-1]
            if data.empty:
                continue
            data.columns = headers
            block = tidy_df(data)
            if not block.empty:
                blocks.append(block)
        return blocks

    # --- CSV ?
    if filename.lower().endswith(".csv"):
        bio.seek(0)
        try:
            raw = pd.read_csv(bio, header=None, dtype=str, keep_default_na=True)
            blocks = _extract_blocks(raw)
            if blocks:
                return tidy_df(pd.concat(blocks, axis=0, ignore_index=True, sort=False))
            # si pas de multi-blocs, relecture "normale" avec header=0
            bio.seek(0)
            df = pd.read_csv(bio, dtype=str, keep_default_na=True)
            return tidy_df(df)
        except Exception:
            pass  # on tentera Excel

    # --- Excel multi-feuilles & multi-blocs ---
    all_blocks: List[pd.DataFrame] = []
    try:
        bio.seek(0)
        xls = pd.ExcelFile(bio)
        sheet_names = xls.sheet_names or [0]
    except Exception:
        # fallback lecture unique
        try:
            bio.seek(0)
            raw = pd.read_excel(bio, header=None, dtype=str)
            all_blocks = _extract_blocks(raw)
        except Exception:
            all_blocks = []

    if not all_blocks:
        for sh in sheet_names:
            try:
                raw = xls.parse(sh, header=None, dtype=str)
            except Exception:
                continue
            all_blocks.extend(_extract_blocks(raw))

    if all_blocks:
        return tidy_df(pd.concat(all_blocks, axis=0, ignore_index=True, sort=False))
    return pd.DataFrame()
