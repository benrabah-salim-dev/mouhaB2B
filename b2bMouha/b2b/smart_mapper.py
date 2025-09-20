# smart_mapper.py
# pip install sentence-transformers scikit-learn

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import re

NUMERIC_LIKE = re.compile(r"^\s*\d+(?:[.,]\d+)?\s*$")

# Tes champs "canoniques" + description (en FR/EN/ES/IT pour aider le modèle)
CANONICAL_FIELDS = {
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

# Quelques indices lexicaux pour départager (ex. éviter de mapper une colonne “Hotel ID” sur le champ ‘hotel’)
HARD_HINTS = {
    "hotel": ["hotel", "hôtel", "hotel name", "hotelname", "hotel_nom"],
    "observations": ["comment", "coment", "observation", "observations", "remark", "note", "notes", "mensaje", "texto", "voucher", "info"],
    "aeroport_depart": ["org", "origin", "provenance", "from", "aéroport départ"],
    "aeroport_arrivee": ["dst", "destination", "to", "aéroport arrivée"],
    "num_vol_arrivee": ["flight", "vol", "vuelo"],
    "num_vol_retour": ["retour", "return"],
    "pax": ["pax", "passengers", "adult", "adulte"],
}

def _norm(s):
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

class SmartColumnMapper:
    """
    Mappe automatiquement les colonnes d'un DataFrame vers les champs canoniques
    en s'appuyant sur des embeddings multilingues et quelques heuristiques.
    """
    def __init__(self, model_name="distiluse-base-multilingual-cased-v2", top_k=2):
        self.model = SentenceTransformer(model_name)
        self.top_k = top_k
        # Pré-encode les descriptions cibles
        self.target_labels = list(CANONICAL_FIELDS.keys())
        target_texts = [f"{k}: {v}" for k, v in CANONICAL_FIELDS.items()]
        self.target_emb = self.model.encode(target_texts, normalize_embeddings=True)

    def _column_repr(self, col_name, sample_values):
        """Texte représentatif d’une colonne = header + qq exemples."""
        examples = [ _norm(v) for v in sample_values[:5] if _norm(v) ]
        ex = " | ".join(examples)
        return f"Header: {col_name} | Examples: {ex or '—'}"

    def _score(self, df):
        col_infos = []
        for col in df.columns:
            # on prend quelques exemples non vides
            sample = []
            for v in df[col].tolist():
                if _norm(v):
                    sample.append(v)
                if len(sample) >= 5:
                    break
            text = self._column_repr(col, sample)
            col_infos.append((col, sample, text))
        texts = [ci[2] for ci in col_infos]
        if not texts:
            return []
        col_emb = self.model.encode(texts, normalize_embeddings=True)
        sim = cosine_similarity(col_emb, self.target_emb)  # shape: (ncols, ntargets)
        scored = []
        for i, (col, sample, text) in enumerate(col_infos):
            row = sim[i]
            top_idx = np.argsort(-row)[:self.top_k]
            candidates = []
            for j in top_idx:
                candidates.append((self.target_labels[j], float(row[j])))
            scored.append({"col": col, "sample": sample, "candidates": candidates})
        return scored

    def map(self, df):
        """
        Retourne:
          - mapping: dict canonical_key -> list of df columns (pour obs: liste)
          - scores: info de similarité pour debug
        """
        scored = self._score(df)
        mapping = {k: [] for k in self.target_labels}

        # 1) pré-affectation par hints “forts”
        for s in scored:
            header = _norm(s["col"]).lower()
            for key, hints in HARD_HINTS.items():
                if any(h in header for h in hints):
                    mapping[key].append(s["col"])

        # 2) si un champ n’a rien, on se base sur la meilleure similarité
        for s in scored:
            header = _norm(s["col"]).lower()

            # déjà affecté par hint ? on laisse
            already = any(s["col"] in cols for cols in mapping.values())
            if already:
                continue

            # meilleur candidat par cosine
            best_key, best_score = s["candidates"][0]
            # petite règle: observations accepte les colonnes “textuelles variées”
            if best_key == "hotel" and not _is_textual_column(s["sample"]):
                # si colonne très numérique, on ne la mappe pas en 'hotel'
                # on regarde le 2e candidat si dispo
                if len(s["candidates"]) > 1:
                    alt_key, alt_score = s["candidates"][1]
                    mapping[alt_key].append(s["col"])
                else:
                    # sinon, on ignore
                    continue
            else:
                mapping[best_key].append(s["col"])

        # 3) Ajustements post-processing
        #    - hotel: on préfère 1 colonne textuelle. Si plusieurs, on garde la plus “textuelle”
        if mapping["hotel"]:
            hotel_cols = mapping["hotel"]
            if len(hotel_cols) > 1:
                # choisir la colonne avec plus de contenu non numérique
                best = None
                best_ratio = -1
                for col in hotel_cols:
                    vals = [v for v in df[col].tolist() if _norm(v)]
                    ratio = 1.0 if _is_textual_column(vals) else 0.0
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best = col
                mapping["hotel"] = [best]

        # 4) observations: agrège toutes les colonnes textuelles candidates
        #    S’il n’y a aucune colonne explicitement mappée sur observations,
        #    on prend automatiquement les colonnes dont le header évoque des remarques.
        if not mapping["observations"]:
            obs_like = []
            for col in df.columns:
                h = _norm(col).lower()
                if any(tag in h for tag in HARD_HINTS["observations"]):
                    obs_like.append(col)
            mapping["observations"] = obs_like

        return mapping, scored
