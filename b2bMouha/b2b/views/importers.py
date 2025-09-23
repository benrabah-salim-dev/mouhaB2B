# b2b/views/importers.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import difflib

import pandas as pd
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import AgenceVoyage, Dossier, Hotel, Vehicule, Chauffeur
from .helpers import _ensure_same_agence_or_superadmin

# ---------------------------------------------------------------------
# Helpers généraux (normalisation / parsers)
# ---------------------------------------------------------------------

def _norm_header(s: str) -> str:
    if s is None:
        return ""
    s = str(s).strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def _first_str(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if s.lower() in {"", "nan", "none", "null", "-"}:
        return None
    # 123.0 -> 123
    if re.fullmatch(r"\d+\.0", s):
        s = s[:-2]
    return s or None


def _parse_int_cell(v: Any) -> int:
    """Retourne un entier >=0 depuis texte/float/None."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0
    s = str(v).strip()
    if not s or s.lower() in {"nan", "none", "null", "-"}:
        return 0
    m = re.findall(r"\d+", s)
    if m:
        try:
            return max(0, int(m[0]))
        except Exception:
            pass
    try:
        return max(0, int(float(s)))
    except Exception:
        return 0


def _clean_time_cell(v: Any) -> Optional[str]:
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
        dt = pd.to_datetime(f"{d.date().isoformat()} {t_str}", dayfirst=True, errors="coerce")
    else:
        dt = pd.to_datetime(d.date(), errors="coerce")
    if pd.isna(dt):
        return None
    py = dt.to_pydatetime()
    if timezone.is_naive(py):
        py = timezone.make_aware(py)
    return py


def _find_col(df: pd.DataFrame, *keyword_groups: List[str], prefer: Optional[str] = None) -> Optional[str]:
    """
    1) match exact (après normalisation) ; 2) sinon 'contains'
    """
    norm_map: Dict[str, List[str]] = {}
    for c in df.columns:
        norm_map.setdefault(_norm_header(c), []).append(c)

    # Exact
    for group in keyword_groups:
        for k in group:
            k_norm = _norm_header(k)
            if k_norm in norm_map:
                cols = norm_map[k_norm]
                if prefer and prefer in cols:
                    return prefer
                return cols[0]

    # Contains
    for group in keyword_groups:
        for k in group:
            k_norm = _norm_header(k)
            candidates = [orig for norm, lst in norm_map.items() if k_norm in norm for orig in lst]
            if candidates:
                if prefer and prefer in candidates:
                    return prefer
                return candidates[0]
    return None


def _fuzzy_best_match(keywords: List[str], columns: List[str], min_ratio: float = 0.65) -> Optional[str]:
    """Fallback fuzzy basé sur difflib (après normalisation)."""
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

# ---------------------------------------------------------------------
# Lecture Excel robuste : corrige l'alignement / headers
# ---------------------------------------------------------------------

def smart_read_excel(file_obj, max_header_scan: int = 10) -> pd.DataFrame:
    """
    Lit un Excel 'sale', détecte la meilleure ligne d'entêtes et réaligne.
    - scanne les premières lignes pour trouver la vraie ligne de titres
    - supprime colonnes vides et 'Unnamed'
    - normalise les cellules (trim)
    """
    raw = pd.read_excel(file_obj, header=None, dtype=str)
    raw = raw.applymap(lambda x: x.strip() if isinstance(x, str) else x)

    expected_tokens = [
        "date", "horaire", "horaires", "hora", "provenance", "org", "origen",
        "destination", "dst", "destino",
        "d/a", "a/d", "l/s", "ls", "depart/arriver", "type", "mouvement",
        "n° vol", "n vol", "vuelo", "flight", "vol",
        "client/ to", "client to", "to", "t.o.", "tour operateur", "tour opérateur", "tour operador",
        "hotel", "hôtel",
        "ref", "référence", "reference", "ntra.ref", "ref t.o.", "ref to",
        "titulaire", "tetulaire", "titular", "name", "holder",
        "pax", "passengers", "adultes", "adultos", "enfants", "niños", "ninos", "bb/gratuit", "bebe", "bebes",
        "observation", "observations", "coment", "comentario", "comments"
    ]

    def _norm(s: Any) -> str:
        if s is None or (isinstance(s, float) and pd.isna(s)):
            return ""
        s = str(s)
        s = unicodedata.normalize("NFD", s)
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
        s = s.lower().strip()
        s = s.replace("_", " ")
        s = re.sub(r"\s+", " ", s)
        return s

    def score_header_row(series: pd.Series) -> float:
        cells = [_norm(v) for v in series.tolist()]
        if not any(cells):
            return 0.0
        score = 0.0
        for c in cells:
            if c and not re.search(r"\d{4}-\d{2}-\d{2}", c):
                for tok in expected_tokens:
                    if tok in c:
                        score += 2.0
                if re.search(r"\d{3,}", c):
                    score -= 0.5
        score += 0.2 * sum(bool(x) for x in cells)
        return score

    header_idx = 0
    best = -1e9
    limit = min(max_header_scan, min(15, len(raw)))
    for i in range(limit):
        s = score_header_row(raw.iloc[i])
        if s > best:
            best, header_idx = s, i

    headers = raw.iloc[header_idx].tolist()
    df = raw.iloc[header_idx + 1 :].copy()
    df.columns = headers
    df = df.dropna(axis=1, how="all")

    fixed_cols, used = [], set()
    for i, c in enumerate(df.columns):
        nc = c if isinstance(c, str) else ""
        nc = (nc or "").strip()
        if not nc or re.match(r"^unnamed", nc, re.I):
            nc = f"col_{i+1}"
        if nc in used:
            k, tmp = 2, f"{nc}_2"
            while tmp in used:
                k += 1
                tmp = f"{nc}_{k}"
            nc = tmp
        used.add(nc)
        fixed_cols.append(nc)
    df.columns = fixed_cols

    # Drop leading empty columns (décalage)
    while df.shape[1] > 0:
        first_col = df.iloc[:, 0]
        ratio_nan = first_col.isna().mean()
        ratio_blank = (first_col.astype(str).str.strip() == "").mean()
        if max(ratio_nan, ratio_blank) >= 0.95:
            df = df.iloc[:, 1:]
        else:
            break

    # Trim cellules
    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].apply(lambda x: x.strip() if isinstance(x, str) else x)

    return df


# ---------------------------------------------------------------------
# Import Dossiers
# ---------------------------------------------------------------------
class ImporterDossierAPIView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [AllowAny]

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

    # --- FIX: Priorité stricte TETULAIRE/TITULAIRE; exclusion des colonnes 'Client TO' / TO
    def _extract_nom_reservation(self, df: pd.DataFrame, row: pd.Series) -> Optional[str]:
        cols = list(df.columns)
        norm_map = {c: _norm_header(c) for c in cols}

        def _good(col: str) -> bool:
            n = norm_map[col]
            # Exclure toute colonne liée au TO / tour opérateur
            if re.search(r"\b(to|tour|operat)\b", n):
                return False
            # Éviter les champs 'clientto', 'client_to', etc.
            if "client" in n and "to" in n:
                return False
            return True

        # Groupe 1 (priorité maximale): titulaire/tetulaire/holder/lead/bookingname
        g1_keys = [
            "titulaire", "tetulaire", "holder", "lead", "leadname", "bookingname", "titular"
        ]
        g1 = [c for c in cols if any(k in norm_map[c] for k in g1_keys) and _good(c)]

        # Groupe 2: champs nom de réservation explicites
        g2_keys = [
            "nomreservation", "nomresa", "reservation", "groupe", "group", "booking", "passager", "paxnames"
        ]
        g2 = [c for c in cols if any(k in norm_map[c] for k in g2_keys) and _good(c)]

        # Groupe 3: 'client' générique (mais pas client TO)
        g3 = [c for c in cols if ("client" in norm_map[c]) and _good(c)]

        for group in (g1, g2, g3):
            for c in group:
                v = _first_str(row.get(c))
                if v:
                    s = re.sub(r"\s+", " ", v).strip()
                    if s and s.lower() not in {"nan", "none", "null", "-"}:
                        return s

        # Si pas trouvé: combiner prénom/nom
        last_name_cols = self._find_cols_any(df, "nom", "lastname", "last_name", "surname", "apellidos")
        first_name_cols = self._find_cols_any(df, "prenom", "firstname", "first_name", "givenname", "nombre")
        ln = next((_first_str(row.get(c)) for c in last_name_cols if _first_str(row.get(c))), None)
        fn = next((_first_str(row.get(c)) for c in first_name_cols if _first_str(row.get(c))), None)
        combined = " ".join([fn or "", ln or ""]).strip()
        return combined or None

    def _collect_observations(self, df: pd.DataFrame, row: pd.Series) -> str:
        obs_exact_norms = {
            "observation", "observations", "observatio", "observ", "obs",
            "remark", "remarks", "remarque", "remarques",
            "note", "notes", "comment", "comments", "commentaire", "commentaires",
            "coment", "coments", "comentario", "comentarios"
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

    def post(self, request):
        fichier = request.FILES.get("file")
        agence_id = request.data.get("agence")
        if not fichier:
            return Response({"error": "Aucun fichier envoyé."}, status=400)
        if not agence_id:
            return Response({"error": "Agence requise."}, status=400)

        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        # --- lecture Excel robuste (corrige l'alignement) ---
        try:
            df = smart_read_excel(fichier)
        except Exception as e:
            return Response({"error": f"Erreur lecture Excel: {e}"}, status=400)
        if df.empty:
            return Response({"error": "Le fichier est vide."}, status=400)

        cols = list(df.columns)

        def choose_col(keywords, prefer=None):
            col = _find_col(df, keywords, prefer=prefer)
            if col:
                return col
            return _fuzzy_best_match(keywords, cols, min_ratio=0.65)

        # --- mapping colonnes ---
        col_ref_to   = choose_col(["Ref.T.O.", "Ref TO", "RefTO", "RefTO.", "Ref T.O.", "Ref T O", "Ref_T_O", "Ref.TO"])
        col_ntra_ref = choose_col(["Ntra.Ref", "NtraRef", "Ntra Ref", "Ntra"])
        col_ref_alt  = choose_col(["Reference", "Référence", "Ref", "REF", "N° dossier", "N dossier", "N_DOSSIER"])
        col_ref      = col_ref_to or col_ntra_ref or col_ref_alt

        col_day  = choose_col(["Dia", "DATE", "Date", "Fecha", "Jour", "Data"])
        col_time = choose_col(["Hora", "Horaires", "Horaire", "Heure", "Time", "Horas"])
        col_vol  = choose_col(["Vuelo", "Vol", "Flight", "N° VOL", "N VOL", "Nº VOL", "N° Vol", "N°Vol", "No Vol"])

        col_org  = choose_col(["Org", "Provenance", "Orig", "From", "Origen"])
        col_dst  = choose_col(["Dst", "Destination", "To", "Destino"])

        col_ls   = choose_col([
            "L/S", "LS", "D/A", "A/D", "DA", "AD", "Type Mouvement", "Type", "Mouvement",
            "DEPART/ARRIVER", "DEPART/ARRIVE", "Depart/Arrivee", "DEPART ARRIVEE"
        ])

        col_city  = choose_col(["Ciudad", "Ville", "City", "Localite", "Localité", "Ciudad/Zone", "Zone"])
        col_to    = choose_col([
            "T.O.", "TO", "Client TO", "CLIENT/ TO", "CLIENT TO", "Client/ TO",
            "Tour Operateur", "Tour Opérateur", "Tour Operador", "Tour Operator"
        ])
        col_hotel = self._pick_hotel_col(df)
        # On garde 'col_name' pour compat: mais _extract_nom_reservation est prioritaire
        col_name  = choose_col(["Titular", "Titulaire", "TETULAIRE", "Nom", "Name", "Holder", "Client", "Tetulaire"])

        col_pax   = choose_col(["Pax", "PAX", "Passengers"])
        adult_cols  = self._find_cols_any(df, "adulte", "adultes", "adults", "adultos")
        child_cols  = self._find_cols_any(df, "enfant", "enfants", "children", "ninos", "niños", "nenes")
        baby_cols   = self._find_cols_any(df, "bb", "bebe", "bebes", "bb/gratuit", "infant", "baby", "bebesgratuit")

        dossiers_crees: List[str] = []
        dossiers_mis_a_jour: List[str] = []
        lignes_ignorees: List[Dict[str, Any]] = []
        ui_rows: List[Dict[str, Any]] = []

        # --- lecture lignes ---
        for idx, row in df.iterrows():
            # Référence obligatoire
            ref = None
            if col_ref:
                ref = _first_str(row.get(col_ref))
            if (not ref) and col_ref_to:
                ref = _first_str(row.get(col_ref_to))
            if (not ref) and col_ntra_ref:
                ref = _first_str(row.get(col_ntra_ref))
            if (not ref) and col_ref_alt:
                ref = _first_str(row.get(col_ref_alt))
            if not ref:
                lignes_ignorees.append({"ligne": idx + 2, "raison": "Référence manquante"})
                continue

            # Datetime combiné
            day_val  = row.get(col_day)  if col_day  else None
            time_val = row.get(col_time) if col_time else None
            dt = _combine_datetime(day_val, time_val)

            # Orig/Dest + type A/D
            org = _first_str(row.get(col_org)) if col_org else ""
            dst = _first_str(row.get(col_dst)) if col_dst else ""
            type_hint = (_first_str(row.get(col_ls)) or "").upper() if col_ls else ""
            type_hint = (type_hint
                         .replace("ARRIVER", "ARRIVEE")
                         .replace("ARRIVE", "ARRIVEE")
                         .replace("ARRIVAL", "ARRIVEE")
                         .replace("DEPARTURE", "DEPART")
                         .replace("SALIDA", "DEPART"))
            if type_hint in {"L", "A", "ARRIVEE"}:
                type_code = "A"
            elif type_hint in {"S", "D", "DEPART"}:
                type_code = "D"
            else:
                type_code = None

            # Vol, Ville, TO
            vol   = _first_str(row.get(col_vol)) if col_vol else ""
            ville = _first_str(row.get(col_city)) if col_city else ""
            tour_op  = _first_str(row.get(col_to)) if col_to else ""

            # PAX principal
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

            # Titulaire / nom de réservation robuste (PRIORITÉ g1 -> g2 -> g3)
            nom_resa = self._extract_nom_reservation(df, row)
            if not nom_resa and col_name:
                nom_resa = _first_str(row.get(col_name)) or ""

            # Hôtel
            hotel_nom = _first_str(row.get(col_hotel)) if col_hotel else None
            hotel_obj = None
            if hotel_nom:
                hotel_obj = Hotel.objects.filter(nom__iexact=hotel_nom).first()
                if not hotel_obj:
                    hotel_obj = Hotel.objects.create(nom=hotel_nom)

            # Répartition arrivée/départ
            heure_arrivee = heure_depart = None
            num_vol_arrivee = num_vol_retour = ""
            if type_code == "A":
                heure_arrivee, num_vol_arrivee = dt, (vol or "")
            elif type_code == "D":
                heure_depart, num_vol_retour = dt, (vol or "")
            else:
                # Heuristique si non renseigné: si ORG rempli, on suppose départ; sinon arrivée
                if org and not dst:
                    heure_depart, num_vol_retour = dt, (vol or "")
                else:
                    heure_arrivee, num_vol_arrivee = dt, (vol or "")

            obs_joined = self._collect_observations(df, row)

            data = {
                "agence": agence,
                "ville": ville or "",
                "aeroport_arrivee": (dst or "Aucun"),
                "num_vol_arrivee": num_vol_arrivee or "",
                "heure_arrivee": heure_arrivee,
                "aeroport_depart": org or "",
                "heure_depart": heure_depart,
                "num_vol_retour": num_vol_retour or "",
                "hotel": hotel_obj,
                "nombre_personnes_arrivee": pax if heure_arrivee else 0,
                "nombre_personnes_retour": pax if heure_depart else 0,
                "nom_reservation": nom_resa or "",
                "tour_operateur": tour_op or "",
                "observation": obs_joined or "",
            }

            obj, created = Dossier.objects.update_or_create(reference=ref, defaults=data)
            (dossiers_crees if created else dossiers_mis_a_jour).append(ref)

            ui_rows.append({
                "id": obj.id,
                "reference": obj.reference,
                "ville": obj.ville,
                "hotel": getattr(obj.hotel, "nom", None),
                "aeroport_arrivee": obj.aeroport_arrivee,
                "num_vol_arrivee": obj.num_vol_arrivee,
                "heure_arrivee": obj.heure_arrivee,
                "aeroport_depart": obj.aeroport_depart,
                "heure_depart": obj.heure_depart,
                "num_vol_retour": obj.num_vol_retour,
                "nombre_personnes_arrivee": obj.nombre_personnes_arrivee,
                "nombre_personnes_retour": obj.nombre_personnes_retour,
                "tour_operateur": obj.tour_operateur or "",
                "_to": obj.tour_operateur or "",
                "nom_reservation": obj.nom_reservation or "",
                "clients": obj.nom_reservation or "",
                "observation": obj.observation or "",
            })

        return Response(
            {
                "message": "Import terminé",
                "dossiers_crees": dossiers_crees,
                "dossiers_mis_a_jour": dossiers_mis_a_jour,
                "lignes_ignorees": lignes_ignorees,
                "dossiers": ui_rows,
            },
            status=200,
        )


# ---------------------------------------------------------------------
# Import Véhicules
# ---------------------------------------------------------------------
class ImporterVehiculesAPIView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    HEADERS = {
        "immatriculation": ["IMMATRICULATION", "Immatriculation", "Plaque", "Matricule", "Plate"],
        "marque": ["MARQUE", "Marque", "Brand", "Fabricant"],
        "model": ["MODELE", "Modèle", "Model", "Type"],
        "capacite": ["CAPACITE", "Capacité", "Capacity", "Seats", "Places"],
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

        col_immat = self._find_col(df, self.HEADERS["immatriculation"]) 
        col_marque = self._find_col(df, self.HEADERS["marque"]) 
        col_model = self._find_col(df, self.HEADERS["model"]) 
        col_capacite = self._find_col(df, self.HEADERS["capacite"]) 

        missing = [k for k, v in {"IMMATRICULATION": col_immat, "MARQUE": col_marque, "MODELE": col_model}.items() if v is None]
        if missing:
            return Response({"error": f"Colonnes manquantes dans le fichier: {', '.join(missing)}"}, status=400)

        created, updated, ignored = [], [], []
        for idx, row in df.iterrows():
            immat = self._clean_str(row.get(col_immat))
            marque = self._clean_str(row.get(col_marque))
            model = self._clean_str(row.get(col_model))
            capacite = row.get(col_capacite)
            try:
                capacite = int(capacite) if pd.notna(capacite) else None
            except Exception:
                capacite = None

            if not immat:
                ignored.append({"ligne": idx + 2, "raison": "Immatriculation manquante"})
                continue
            if not marque:
                ignored.append({"ligne": idx + 2, "raison": "Marque manquante"})
                continue
            if not model:
                ignored.append({"ligne": idx + 2, "raison": "Modèle manquant"})
                continue

            defaults = {"marque": marque, "model": model, "capacite": capacite, "agence": agence}
            obj, was_created = Vehicule.objects.update_or_create(immatriculation=immat, defaults=defaults)
            (created if was_created else updated).append(immat)

        return Response(
            {
                "message": "Import véhicules terminé",
                "agence": agence.id,
                "vehicules_crees": created,
                "vehicules_mis_a_jour": updated,
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
