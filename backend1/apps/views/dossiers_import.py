# apps/views/dossiers_import.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import io
import json
from typing import Any, Dict, Optional, Tuple

import pandas as pd
from django.apps import apps
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.services.hotels import get_or_create_hotel_and_assign_zone


# ============================================================
# Helpers fichiers (CSV/XLS/XLSX)
# ============================================================

def _peek(upload, n: int) -> bytes:
    pos = upload.tell()
    head = upload.read(n)
    upload.seek(pos)
    return head or b""


def is_xlsx(upload) -> bool:
    head = _peek(upload, 4)
    return head[:2] == b"PK"  # ZIP


def is_xls(upload) -> bool:
    head = _peek(upload, 8)
    return head.startswith(b"\xD0\xCF\x11\xE0")  # OLE2


def _decode_bytes(data: bytes) -> Tuple[str, str]:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin1"):
        try:
            return data.decode(enc), enc
        except UnicodeDecodeError:
            continue
    return data.decode("latin1", errors="replace"), "latin1(replace)"


def _sniff_sep(sample: str) -> str:
    head = "\n".join(sample.splitlines()[:20])
    candidates = [";", ",", "\t"]
    counts = {c: head.count(c) for c in candidates}
    best = max(candidates, key=lambda c: (counts[c], 1 if c == ";" else 0))
    return best if counts[best] > 0 else ","


def read_csv_df(upload) -> pd.DataFrame:
    upload.seek(0)
    raw = upload.read()
    text, _enc = _decode_bytes(raw)
    sep = _sniff_sep(text[:4096])
    return pd.read_csv(
        io.StringIO(text),
        sep=sep,
        dtype=str,
        keep_default_na=True,
        engine="python",
    )


# ============================================================
# Helpers valeurs / modèles
# ============================================================

def _to_str(v) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() in {"nan", "none", "null", "-"} else s


def _smart_time(v):
    """Convertit une valeur Excel/texte en time() ou None."""
    try:
        dt = pd.to_datetime(v, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.time()
    except Exception:
        return None


def _smart_date(v):
    """
    Convertit une valeur Excel/texte en date() ou None.
    Gère:
      - datetime/date natifs
      - nombres Excel (séries à partir de 1899-12-30)
      - chaînes "25/04/2022", "2022-04-25T00:00:00", etc.
    """
    import datetime as dt

    if v is None:
        return None

    if isinstance(v, (dt.datetime, dt.date)):
        return v.date() if isinstance(v, dt.datetime) else v

    s = str(v).strip()
    if not s or s.lower() in {"nan", "none", "null", "-"}:
        return None

    # coupe l'heure
    for sep in (" ", "T"):
        if sep in s:
            s = s.split(sep)[0].strip()

    # nombres Excel
    try:
        if s.replace(".", "", 1).isdigit():
            as_float = float(s)
            if 30000 <= as_float <= 60000:
                d = pd.to_datetime(as_float, unit="D", origin="1899-12-30", errors="coerce")
                if pd.notna(d):
                    return d.date()
    except Exception:
        pass

    try:
        d = pd.to_datetime(s, dayfirst=True, errors="coerce", infer_datetime_format=True)
        if pd.notna(d):
            return d.date()
    except Exception:
        pass

    return None


def _to_int(v, default=0) -> int:
    try:
        import re
        s = _to_str(v).replace("\u00A0", " ").replace(",", ".")
        m = re.search(r"[-+]?\d*\.?\d+", s)
        return int(round(float(m.group(0)))) if m else default
    except Exception:
        return default


def _normalize_type(v) -> str:
    """
    Normalise tout ce qui ressemble à A/D/L/S vers:
      - "A" pour Arrivées (A,L)
      - "D" pour Départs (D,S)
    """
    s = _to_str(v).upper()
    import re
    m = re.search(r"[ADLS]", s)
    c = (m.group(0) if m else s[:1]) or ""
    if c in {"A", "L"}:
        return "A"
    if c in {"D", "S"}:
        return "D"
    return ""


def _is_fk(model, fieldname: Optional[str]) -> bool:
    if not fieldname:
        return False
    try:
        f = model._meta.get_field(fieldname)
        return getattr(f, "remote_field", None) is not None
    except Exception:
        return False


def _model_fields(model) -> set:
    return {
        f.name
        for f in model._meta.get_fields()
        if getattr(f, "concrete", False) and not getattr(f, "many_to_many", False)
    }


# ============================================================
# Import Dossiers
# ============================================================

class ImporterDossierAPIView(APIView):
    """
    POST /api/importer-dossier/
    Form-Data:
      - file, agence, mapping(JSON)
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    _ALIASES = {
        "reference": [
            "reference", "ref", "code_dossier", "n_dossier", "num_dossier",
            "id", "code", "code_resa", "code_reservation", "ref to",
            "ref.t.o.", "ntra.ref", "ref t.o.",
        ],
        "date": ["date", "jour", "dia", "fecha", "día", "fechas"],
        "horaires": ["horaire", "horaires", "heure", "time", "hora", "h/v", "h v"],
        "provenance": ["provenance", "origine", "from", "org", "origin", "aeroport_depart"],
        "destination": ["destination", "to", "dst", "dest", "aeroport_arrivee"],
        "type_mouvement": ["type_mouvement", "type", "mouvement", "d/a", "d a", "da", "ad", "ls", "l/s"],
        "num_vol": ["num_vol", "numero_vol", "n_vol", "n° vol", "vol", "flight", "vuelo"],
        "client": ["client", "client_to", "to", "tour operateur", "tour_op", "t.o."],
        "hotel": ["hotel", "hôtel"],
        "titulaire": ["titulaire", "holder", "leadname", "nom_reservation"],
        "pax": ["pax", "passengers", "nb_pax", "personnes"],
        "adulte": ["adulte", "adultes", "adults", "adultos"],
        "enfants": ["enfants", "children", "kids", "niños"],
        "bb_gratuit": ["bb_gratuit", "bb", "bebe", "infant", "baby", "bebes", "gratuit"],
        "observation": ["observation", "observations", "commentaires", "comments", "remark", "notes"],
        "ville": ["ville", "city", "localite", "localité", "ciudad"],
        "code_postal": ["code_postal", "cp", "postal", "zip"],
        "zone": ["zone", "secteur", "area", "district"],
    }
    _KNOWN = set(_ALIASES.keys())

    @staticmethod
    def _norm_key(s: str) -> str:
        """Normalisation agressive : casse, accents, espaces, ponctuation."""
        import re
        import unicodedata

        s = (s or "").strip().lower()
        s = s.replace("\uFEFF", "").replace("\u200e", "").replace("\u200f", "").replace("\u00A0", " ")
        s = unicodedata.normalize("NFKD", s)
        s = "".join(c for c in s if not unicodedata.combining(c))
        s = re.sub(r"[^a-z0-9]+", "_", s)
        return s.strip("_")

    def _normalize_mapping(self, raw) -> Dict[str, str]:
        """
        Transforme le JSON de mapping envoyé par le front en :
            { "date": "nom_colonne_excel_tel_que_choisi_par_user", ... }
        """
        if not isinstance(raw, dict):
            raise ValueError("mapping doit être un objet JSON")

        alias2canon = {}
        for canon, al in self._ALIASES.items():
            for a in al:
                alias2canon[self._norm_key(a)] = canon

        out: Dict[str, str] = {}
        for k, v in raw.items():
            canon = alias2canon.get(self._norm_key(k)) or (
                self._norm_key(k) if self._norm_key(k) in self._KNOWN else None
            )
            if canon and str(v or "").strip():
                out[canon] = str(v).strip()
        return out

    def _resolve_models(self):
        AgenceVoyage = apps.get_model("apps", "AgenceVoyage")
        Dossier = apps.get_model("apps", "Dossier")
        Hotel = apps.get_model("apps", "Hotel")
        Zone = apps.get_model("apps", "Zone")
        if not (AgenceVoyage and Dossier):
            raise LookupError("Modèles AgenceVoyage/Dossier introuvables.")
        return AgenceVoyage, Dossier, Hotel, Zone

    def _build_fieldmap(self, Dossier):
        f = _model_fields(Dossier)

        def first(*opts):
            for k in opts:
                if k in f:
                    return k

        return {
            "reference": first("reference", "ref"),
            "date": first("date"),
            "horaires": first("horaires", "heure", "time"),
            "provenance": first("provenance", "from_", "origine"),
            "destination": first("destination", "to_", "dst"),
            "type_mouvement": first("type_mouvement", "type", "mouvement"),
            "num_vol": first("num_vol", "numero_vol", "vol", "n_vol"),
            "client": first("client", "client_to"),
            "hotel": first("hotel_fk", "hotel", "hotel_obj"),
            "titulaire": first("titulaire", "nom_reservation", "holder"),
            "pax": first("pax", "nb_pax", "passengers", "personnes"),
            "adulte": first("adulte", "adultes", "adults"),
            "enfants": first("enfants", "children"),
            "bb_gratuit": first("bb_gratuit", "bebe", "infants", "bebes"),
            "observation": first("observation", "observations", "commentaires"),
            "ville": first("ville", "city"),
            "code_postal": first("code_postal", "cp", "postal", "zip"),
            "zone": first("zone_fk", "zone", "zone_obj"),
            "agence": first("agence"),
        }

    @transaction.atomic
    def post(self, request):
        fichier = request.FILES.get("file")
        agence_id = request.data.get("agence")
        mapping_raw = request.data.get("mapping")

        if not fichier:
            return Response({"error": "Aucun fichier envoyé."}, status=400)
        if not agence_id:
            return Response({"error": "Paramètre 'agence' requis."}, status=400)
        if not mapping_raw:
            return Response({"error": "Paramètre 'mapping' requis."}, status=400)

        # mapping JSON
        try:
            mapping_user = self._normalize_mapping(json.loads(mapping_raw))
        except Exception as e:
            return Response({"error": f"Mapping invalide ({e})."}, status=400)

        AgenceVoyage, Dossier, Hotel, Zone = self._resolve_models()
        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        # lecture fichier
        try:
            name = str(getattr(fichier, "name", "")).lower()
            if name.endswith(".csv") or (
                not is_xlsx(fichier) and not is_xls(fichier) and name.endswith((".txt", ".dat"))
            ):
                df = read_csv_df(fichier)
            else:
                fichier.seek(0)
                df = pd.read_excel(fichier, dtype=str, keep_default_na=True)
        except Exception as e:
            return Response({"error": f"Fichier illisible ({e})."}, status=400)

        if df is None or df.empty:
            return Response({"error": "Fichier vide."}, status=400)

        # normalisation colonnes
        def norm_col(c):
            return self._norm_key(str(c))

        df.columns = [norm_col(c) for c in df.columns]

        # mapping canonique -> colonne normalisée (telle que df.columns)
        mapping: Dict[str, str] = {}
        for canon, user_col in mapping_user.items():
            mapping[canon] = norm_col(user_col)

        fieldmap = self._build_fieldmap(Dossier)
        valid_fields = _model_fields(Dossier)

        # colonne reference obligatoire si modèle a un champ reference
        if fieldmap["reference"]:
            ref_col = mapping.get("reference")
            if not ref_col or ref_col not in df.columns:
                return Response({"error": "Le mapping doit contenir 'reference'."}, status=400)

        def cell(row, key):
            col = mapping.get(key)
            return row.get(col) if (col and col in row.index) else None

        created, updated, ignored, erreurs = [], [], [], []
        _hotel_cache: Dict[str, Any] = {}
        _zone_cache: Dict[str, Any] = {}

        for i, row in df.iterrows():
            try:
                ref = _to_str(cell(row, "reference"))
                dt = _smart_date(cell(row, "date"))
                hv = _smart_time(cell(row, "horaires"))
                typ = _normalize_type(cell(row, "type_mouvement"))
                prov = _to_str(cell(row, "provenance"))
                dest = _to_str(cell(row, "destination"))
                vol = _to_str(cell(row, "num_vol"))
                cli = _to_str(cell(row, "client"))
                hotx = _to_str(cell(row, "hotel"))
                tit = _to_str(cell(row, "titulaire"))
                obs = _to_str(cell(row, "observation"))
                ville = _to_str(cell(row, "ville"))
                cp = _to_str(cell(row, "code_postal"))
                zonx = _to_str(cell(row, "zone"))

                ad = _to_int(cell(row, "adulte"))
                ch = _to_int(cell(row, "enfants"))
                bb = _to_int(cell(row, "bb_gratuit"))
                paxr = _to_int(cell(row, "pax"))
                pax = paxr if paxr > 0 else (ad + ch + bb)

                # sécurité: sans date/type, on ignore
                if not dt or not typ:
                    ignored.append({"ligne": i + 2, "raison": "date/type manquants"})
                    continue

                # ===================================================
                # Résolution HOTEL + ZONE
                # - La ZONE doit venir du calcul lat/lng de l'hôtel
                # - On n'insère PAS de zones depuis le fichier import
                # ===================================================
                hotel_val = None
                zone_val = None

                # 1) hôtel FK => enrichissement + zone auto
                if fieldmap.get("hotel") and _is_fk(Dossier, fieldmap["hotel"]) and hotx:
                    hk = hotx.strip().lower()

                    if hk in _hotel_cache:
                        hotel_val = _hotel_cache[hk]
                    else:
                        # Hint pour Google: ville/cp (améliore beaucoup)
                        hint_parts = []
                        if ville:
                            hint_parts.append(ville)
                        if cp:
                            hint_parts.append(cp)
                        # Décommente si tu veux forcer le pays:
                        # hint_parts.append("Tunisie")
                        hint = ", ".join([p for p in hint_parts if p]) if hint_parts else None

                        hotel_val = get_or_create_hotel_and_assign_zone(hotx, hint_text=hint)
                        _hotel_cache[hk] = hotel_val

                    if hotel_val and getattr(hotel_val, "zone_id", None):
                        zone_val = hotel_val.zone

                # 2) override zone via colonne "zone" (optionnel)
                # => seulement si une zone existe déjà en base
                if (
                    zone_val is None
                    and fieldmap.get("zone")
                    and _is_fk(Dossier, fieldmap["zone"])
                    and zonx
                ):
                    zk = zonx.strip().lower()
                    if zk in _zone_cache:
                        zone_val = _zone_cache[zk]
                    else:
                        zone_val = Zone.objects.filter(nom__iexact=zonx).first()
                        _zone_cache[zk] = zone_val

                # =========================
                # data (defaults)
                # =========================
                data: Dict[str, Any] = {
                    (fieldmap.get("agence") or "agence"): agence,
                    fieldmap.get("date"): dt,
                    fieldmap.get("horaires"): hv,
                    fieldmap.get("provenance"): prov,
                    fieldmap.get("destination"): dest,
                    fieldmap.get("type_mouvement"): typ,
                    fieldmap.get("num_vol"): vol,
                    fieldmap.get("client"): cli,
                    fieldmap.get("titulaire"): tit,
                    fieldmap.get("pax"): pax,
                    fieldmap.get("adulte"): ad,
                    fieldmap.get("enfants"): ch,
                    fieldmap.get("bb_gratuit"): bb,
                    fieldmap.get("ville"): ville,
                    fieldmap.get("code_postal"): cp,
                }

                # observation
                if "observation" in valid_fields:
                    data["observation"] = obs

                # hotel
                if fieldmap.get("hotel"):
                    if _is_fk(Dossier, fieldmap["hotel"]):
                        if hotel_val:
                            data[fieldmap["hotel"]] = hotel_val
                    else:
                        data[fieldmap["hotel"]] = hotx or None

                # zone
                if fieldmap.get("zone"):
                    if _is_fk(Dossier, fieldmap["zone"]):
                        if zone_val:
                            data[fieldmap["zone"]] = zone_val
                    else:
                        # si champ zone est texte (rare) => on stocke le libellé
                        data[fieldmap["zone"]] = zonx or None

                # purge champs inexistants + None keys
                data = {k: v for k, v in data.items() if k and k in valid_fields}

                # =========================
                # LOOKUP ANTI-ÉCRASEMENT
                # 1 ligne excel = 1 dossier-mouvement
                # =========================
                lookup: Dict[str, Any] = {(fieldmap.get("agence") or "agence"): agence}

                # ref si dispo (utile mais pas suffisant)
                if fieldmap.get("reference") and ref:
                    lookup[fieldmap["reference"]] = ref

                # clé mouvement (obligatoire)
                if fieldmap.get("date") and dt:
                    lookup[fieldmap["date"]] = dt
                if fieldmap.get("type_mouvement") and typ:
                    lookup[fieldmap["type_mouvement"]] = typ

                # renforce l'unicité si présent
                if fieldmap.get("horaires") and hv:
                    lookup[fieldmap["horaires"]] = hv
                if fieldmap.get("num_vol") and vol:
                    lookup[fieldmap["num_vol"]] = vol

                obj, was_created = Dossier.objects.update_or_create(defaults=data, **lookup)
                (created if was_created else updated).append(ref or str(obj.pk))

            except Exception as e:
                erreurs.append({"ligne": i + 2, "raison": f"{type(e).__name__}: {e}"})

        return Response(
            {
                "message": "Import Dossier terminé",
                "agence": int(agence_id),
                "created_count": len(created),
                "updated_count": len(updated),
                "ignored_count": len(ignored),
                "errors_count": len(erreurs),
                "dossiers_crees": created,
                "dossiers_mis_a_jour": updated,
                "lignes_ignorees": ignored,
                "erreurs": erreurs,
                "lookup_mode": "agence+ref+date+type+horaires+vol",
            },
            status=200,
        )
