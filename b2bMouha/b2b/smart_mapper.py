# smart_mapper.py
# Mapping automatique des colonnes d'un DataFrame vers des champs canoniques.
# IA (embeddings) si dispo, sinon fallback 100% règle + difflib.

from __future__ import annotations

from typing import Dict, List, Tuple
import re
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics.pairwise import cosine_similarity

    _HAS_ST = True
except Exception:
    _HAS_ST = False

import difflib

NUMERIC_LIKE = re.compile(r"^\s*\d+(?:[.,]\d+)?\s*$")

# Champs "canoniques" + description multilingue (utile si embeddings)
CANONICAL_FIELDS: Dict[str, str] = {
    "type_da": "Type de mouvement: Arrivée/Departure (A/D, Arrivée/Depart, Arrival/Departure).",
    "reference": "Référence booking / booking reference / Ntra.Ref / Ref.T.O.",
    "date": "Date du vol, format date (jour/mois/année).",
    "horaire": "Heure du vol, time of flight (HH:MM).",
    "ville": "Ville/Zone de séjour (City/Area/Zone).",
    "aeroport_depart": "Aéroport de départ (Origin/Org/From).",
    "aeroport_arrivee": "Aéroport d’arrivée (Destination/Dst/To).",
    "num_vol_arrivee": "Numéro de vol (arrivée/flight number/Vol/Flight).",
    "num_vol_retour": "Numéro de vol retour (return flight).",
    "pax": "Nombre de passagers PAX / Adults / Passengers.",
    "tour_operateur": "Tour opérateur / Client TO / Operator.",
    "ref_to": "Référence tour-opérateur / TO reference.",
    "nom_reservation": "Nom/Titulaire de réservation / Holder.",
    "hotel": "Nom de l'hôtel (Hotel name).",
    "observations": "Champs libres: commentaires/observations/notes/remark (multi-colonnes).",
}

# Hints forts pour éviter les confusions
HARD_HINTS: Dict[str, List[str]] = {
    "type_da": [
        "d/a",
        "a/d",
        "depart/arrive",
        "depart/arriver",
        "arrivee",
        "arrival",
        "departure",
        "l/s",
        "ls",
        "type",
        "mouvement",
    ],
    "reference": [
        "reference",
        "référence",
        "ref",
        "n dossier",
        "n° dossier",
        "ntra.ref",
        "ref.t.o.",
        "ref to",
        "ref t.o",
        "ref t o",
    ],
    "date": ["date", "dia", "fecha", "jour", "data"],
    "horaire": ["horaire", "horaires", "hora", "heure", "time", "horas"],
    "ville": ["ville", "city", "localite", "localité", "ciudad", "zone", "area"],
    "aeroport_depart": [
        "org",
        "origin",
        "provenance",
        "from",
        "aeroport depart",
        "aéroport depart",
    ],
    "aeroport_arrivee": [
        "dst",
        "destination",
        "to",
        "destino",
        "aeroport arrivee",
        "aéroport arrivee",
    ],
    "num_vol_arrivee": ["n° vol", "n vol", "vuelo", "flight", "vol"],
    "num_vol_retour": ["retour", "return"],
    "pax": ["pax", "passengers", "adult", "adulte", "adults", "adultos"],
    "tour_operateur": [
        "t.o.",
        "to",
        "client to",
        "client/ to",
        "tour operateur",
        "tour operador",
        "tour operator",
    ],
    "ref_to": ["ref t.o.", "ref to", "ref.t.o.", "ref t o"],
    "nom_reservation": [
        "titulaire",
        "titular",
        "holder",
        "lead",
        "leadname",
        "bookingname",
        "nomreservation",
        "nomresa",
        "reservation",
        "groupe",
        "group",
        "booking",
        "passager",
        "paxnames",
    ],
    "hotel": ["hotel", "hôtel", "hotel name", "hotelname"],
    "observations": [
        "comment",
        "coment",
        "comments",
        "commentaire",
        "commentaires",
        "observation",
        "observations",
        "remark",
        "remarks",
        "note",
        "notes",
        "mensaje",
        "texto",
        "voucher",
        "info",
    ],
}

# Pour éviter "Client/TO" ↔ "Titulaire"
BAN_FOR_TITULAIRE = ["client to", "client/ to", "tour", "operat", "operator", "to "]


def _norm(s) -> str:
    return str(s or "").strip()


def _is_textual_column(sample_values, min_text_ratio=0.5):
    """True si la majorité des exemples ne sont pas purement numériques (utile pour HOTEL)."""
    if not sample_values:
        return True
    non_num = 0
    total = 0
    for v in sample_values:
        v = _norm(v)
        if not v:
            continue
        total += 1
        if not NUMERIC_LIKE.match(v):
            non_num += 1
    if total == 0:
        return True
    return (non_num / total) >= min_text_ratio


def _difflib_best(keywords: List[str], candidates: List[str]) -> str | None:
    if not keywords or not candidates:
        return None
    scores = []
    for c in candidates:
        cn = _norm(c).lower()
        best = max(
            difflib.SequenceMatcher(a=_norm(k).lower(), b=cn).ratio() for k in keywords
        )
        scores.append((best, c))
    scores.sort(reverse=True, key=lambda x: x[0])
    return scores[0][1] if scores and scores[0][0] >= 0.55 else None


class SmartColumnMapper:
    """
    Mappe automatiquement les colonnes d'un DataFrame vers les champs canoniques.
    - Essaie embeddings multilingues si 'sentence-transformers' disponible
    - Sinon fallback 100% règle + difflib
    """

    def __init__(self, model_name="distiluse-base-multilingual-cased-v2", top_k=2):
        self.model_name = model_name
        self.top_k = top_k
        self._model = None
        self._target_labels = list(CANONICAL_FIELDS.keys())
        self._target_texts = [f"{k}: {v}" for k, v in CANONICAL_FIELDS.items()]
        self._target_emb = None  # rempli si modèle chargé

    # ---------------- Embeddings (optionnels) ----------------
    def _ensure_model(self):
        if not _HAS_ST:
            return False
        if self._model is not None:
            return True
        try:
            self._model = SentenceTransformer(self.model_name)
            self._target_emb = self._model.encode(
                self._target_texts, normalize_embeddings=True
            )
            return True
        except Exception:
            # Pas d'embeddings → fallback
            self._model = None
            self._target_emb = None
            return False

    def _score_with_embeddings(self, df):
        col_infos = []
        for col in df.columns:
            sample = []
            for v in df[col].tolist():
                if _norm(v):
                    sample.append(v)
                if len(sample) >= 5:
                    break
            text = f"Header: {col} | Examples: " + (
                " | ".join(sample) if sample else "—"
            )
            col_infos.append((col, sample, text))
        texts = [ci[2] for ci in col_infos]
        if not texts:
            return []

        col_emb = self._model.encode(texts, normalize_embeddings=True)
        sim = cosine_similarity(col_emb, self._target_emb)  # shape: (ncols, ntargets)

        scored = []
        for i, (col, sample, text) in enumerate(col_infos):
            row = sim[i]
            top_idx = np.argsort(-row)[: self.top_k]
            candidates = [(self._target_labels[j], float(row[j])) for j in top_idx]
            scored.append({"col": col, "sample": sample, "candidates": candidates})
        return scored

    # ---------------- Fallback règles + difflib ----------------
    def _score_with_rules(self, df):
        scored = []
        for col in df.columns:
            sample = []
            for v in df[col].tolist():
                if _norm(v):
                    sample.append(v)
                if len(sample) >= 5:
                    break
            header = _norm(col).lower()

            # 1) hit direct via Hints forts
            candidates: List[Tuple[str, float]] = []
            for key, hints in HARD_HINTS.items():
                if any(h in header for h in hints):
                    candidates.append((key, 0.95))

            # 2) sinon: difflib sur les labels cibles
            if not candidates:
                best = _difflib_best([header], self._target_labels)
                if best:
                    candidates.append((best, 0.65))

            if not candidates:
                # par défaut, très faible score sur observations (capturer le texte libre)
                candidates.append(("observations", 0.50))

            # garder top_k
            candidates.sort(key=lambda x: -x[1])
            candidates = candidates[: self.top_k]
            scored.append({"col": col, "sample": sample, "candidates": candidates})
        return scored

    # ---------------- Mapping public ----------------
    def map(self, df):
        """
        Retourne:
          - mapping: dict canonical_key -> list of df columns (pour observations: liste)
          - scores: info de similarité pour debug
        """
        use_embed = self._ensure_model()
        scored = (
            self._score_with_embeddings(df) if use_embed else self._score_with_rules(df)
        )

        mapping = {k: [] for k in self._target_labels}

        # 1) Pré-affectation via hints/candidats
        for s in scored:
            header = _norm(s["col"]).lower()

            # Évite de mapper Client/TO dans 'nom_reservation'
            if any(bad in header for bad in BAN_FOR_TITULAIRE):
                # forcer orientation vers tour_operateur si c'est clairement Client/TO
                if "tour" in header or "operat" in header or "client to" in header:
                    mapping["tour_operateur"].append(s["col"])
                    continue

            # Parcours des candidats (déjà triés)
            for key, _score in s["candidates"]:
                # on ne mappe pas 'hotel' sur une colonne chiffrée
                if key == "hotel" and not _is_textual_column(s["sample"]):
                    continue
                mapping[key].append(s["col"])
                break  # 1er candidat accepté

        # 2) Post-processing ciblé

        # Hotel: garder 1 seule colonne, la plus textuelle
        if mapping["hotel"]:
            if len(mapping["hotel"]) > 1:
                best = None
                best_ratio = -1
                for col in mapping["hotel"]:
                    vals = [v for v in df[col].tolist() if _norm(v)]
                    ratio = 1.0 if _is_textual_column(vals) else 0.0
                    if ratio > best_ratio:
                        best_ratio, best = ratio, col
                mapping["hotel"] = [best]

        # num_vol_retour: si rien, tenter colonnes contenant 'retour'/'return'
        if not mapping["num_vol_retour"]:
            ret = [
                c
                for c in df.columns
                if "retour" in _norm(c).lower() or "return" in _norm(c).lower()
            ]
            if ret:
                mapping["num_vol_retour"] = [ret[0]]

        # observations: agrège toutes les colonnes dont le header évoque des remarques/obs/notes OU les colonnes OBSx/COMENTy
        if not mapping["observations"]:
            obs_like = []
            for col in df.columns:
                h = _norm(col).lower()
                if any(tag in h for tag in HARD_HINTS["observations"]):
                    obs_like.append(col)
                # OBS1, OBS2, COMENT3...
                if re.match(r"^(obs|observ|comment|coment|note|remark)s?\d+$", h):
                    obs_like.append(col)
            mapping["observations"] = list(dict.fromkeys(obs_like))  # unique

        # nom_reservation: éviter les colonnes contenant 'client to'
        if mapping["nom_reservation"]:
            mapping["nom_reservation"] = [
                c
                for c in mapping["nom_reservation"]
                if "client to" not in _norm(c).lower()
                and "client/ to" not in _norm(c).lower()
            ] or []

        # 3) Assainir doublons et ordre
        for k, cols in list(mapping.items()):
            if not isinstance(cols, list):
                mapping[k] = [cols] if cols else []
            # unique en gardant l'ordre
            mapping[k] = list(dict.fromkeys(mapping[k]))

        return mapping, scored
