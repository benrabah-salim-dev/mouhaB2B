# b2b/views/fiches_import.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import io
import json
import re
import unicodedata
from datetime import date, time
from typing import Any, Dict, Optional, Set, Tuple

import pandas as pd
from django.apps import apps
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# =============================================================================
# Utils: strings / dates / times
# =============================================================================

def _to_str(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() in {"nan", "none", "null", "-"} else s

def _smart_time(v: Any) -> Optional[time]:
    try:
        dt = pd.to_datetime(v, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.time().replace(microsecond=0)
    except Exception:
        return None

def _smart_date(v: Any) -> Optional[date]:
    try:
        dt = pd.to_datetime(v, errors="coerce", dayfirst=True)
        if pd.isna(dt):
            return None
        return dt.date()
    except Exception:
        return None

def _normalize_type(v: Any) -> str:
    s = _to_str(v).upper()
    m = re.search(r"[ADLS]", s)
    c = (m.group(0) if m else s[:1]) or ""
    if c in {"A", "L"}:
        return "A"
    if c in {"D", "S"}:
        return "D"
    return ""

def _norm_key(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s

def _is_fk(model, fieldname: Optional[str]) -> bool:
    if not fieldname:
        return False
    try:
        f = model._meta.get_field(fieldname)
        return getattr(f, "remote_field", None) is not None
    except Exception:
        return False

def _allowed_fields(model_cls) -> Set[str]:
    allowed: Set[str] = set()
    for f in model_cls._meta.get_fields():
        att = getattr(f, "attname", None)
        if att:
            allowed.add(f.name)
    allowed.update({f"{name}_id" for name in list(allowed)})
    return allowed

def _sanitize_defaults(model_cls, defaults: Dict[str, Any]) -> Dict[str, Any]:
    allowed = _allowed_fields(model_cls)
    return {k: v for k, v in defaults.items() if k in allowed}

# =============================================================================
# File detection: excel signatures (avoid UTF-8 decode on binaries)
# =============================================================================

def _peek(upload, n: int) -> bytes:
    pos = upload.tell()
    head = upload.read(n)
    upload.seek(pos)
    return head or b""

def is_xlsx(upload) -> bool:
    head = _peek(upload, 4)
    return head[:2] == b"PK"

def is_xls(upload) -> bool:
    head = _peek(upload, 8)
    return head.startswith(b"\xD0\xCF\x11\xE0")

# =============================================================================
# CSV reading: robust decoding + delimiter sniffing
# =============================================================================

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
    sio = io.StringIO(text)
    return pd.read_csv(sio, sep=sep, dtype=str, keep_default_na=True, engine="python")

# =============================================================================
# Importer FicheMouvement
# =============================================================================

class ImporterFicheMouvementAPIView(APIView):
    """
    POST /api/importer-fiches/
    Form-Data:
      - file: Excel/CSV
      - agence: <id>
      - mapping: JSON {canonique -> colonne}

    Canonique (front):
      date, horaires, provenance, destination, da, num_vol, client_to, hotel, ref,
      titulaire, pax, adulte, enfants, bb_gratuit, ville, code_postal, observation, zone
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    _ALIASES = {
        "date": ["date", "jour", "dia", "fecha"],
        "horaires": ["horaire", "horaires", "heure", "time", "hora", "h/v", "h v"],
        "provenance": ["provenance", "origine", "from", "org", "origin", "aeroport_depart"],
        "destination": ["destination", "to", "dst", "dest", "aeroport_arrivee"],
        "type_mouvement": ["type_mouvement", "type", "mouvement", "d/a", "d a", "da", "ad", "ls", "l/s", "depart/arriver"],
        "da": ["da", "d/a", "depart/arriver", "type_mouvement", "type"],
        "num_vol": ["num_vol", "numero_vol", "n_vol", "n° vol", "vol", "flight", "vuelo", "nº vol"],
        "client_to": ["client_to", "client", "to", "tour operateur", "tour_op", "t.o."],
        "hotel": ["hotel", "hôtel"],
        "ref": ["ref", "reference", "référence", "ref to", "ref t.o.", "ntra.ref"],
        "titulaire": ["titulaire", "holder", "leadname", "nom_reservation"],
        "pax": ["pax", "passengers", "nb_pax", "personnes"],
        "adulte": ["adulte", "adultes", "adults", "adultos"],
        "enfants": ["enfants", "children", "kids"],
        "bebe": ["bebe", "bb_gratuit", "bb/gratuit", "infant", "baby", "gratuit"],
        "bb_gratuit": ["bb_gratuit", "bb/gratuit", "bebe", "infant", "baby", "gratuit"],
        "observation": ["observation", "observ", "comment", "remark", "notes"],
        "ville": ["ville", "city", "localite", "localité", "ciudad"],
        "code_postal": ["code_postal", "cp", "postal", "zip", "code postal"],
        "zone": ["zone", "secteur", "area", "district"],
    }
    _KNOWN = set(_ALIASES.keys())

    def _normalize_mapping(self, raw) -> Dict[str, str]:
        if not isinstance(raw, dict):
            raise ValueError("mapping doit être un objet JSON")
        alias2canon = {}
        for canon, al in self._ALIASES.items():
            for a in al:
                alias2canon[_norm_key(a)] = canon

        out: Dict[str, str] = {}
        for k, v in raw.items():
            kk = _norm_key(str(k))
            canon = alias2canon.get(kk) or (kk if kk in self._KNOWN else None)
            if canon and str(v or "").strip():
                out[canon] = str(v).strip()

        # compat: si le front envoie "da", on l'utilise comme type_mouvement
        if "type_mouvement" not in out and "da" in out:
            out["type_mouvement"] = out["da"]
        return out

    def _resolve_models(self):
        AgenceVoyage = apps.get_model("b2b", "AgenceVoyage")
        Fiche = apps.get_model("b2b", "FicheMouvement")
        Hotel = apps.get_model("b2b", "Hotel")
        Zone = apps.get_model("b2b", "Zone")
        if not (AgenceVoyage and Fiche):
            raise LookupError("Modèles AgenceVoyage/FicheMouvement introuvables.")
        return AgenceVoyage, Fiche, Hotel, Zone

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

        try:
            mapping = self._normalize_mapping(json.loads(mapping_raw))
        except Exception as e:
            return Response({"error": f"Mapping invalide ({e})."}, status=400)

        try:
            AgenceVoyage, Fiche, Hotel, Zone = self._resolve_models()
        except LookupError as e:
            return Response({"error": str(e)}, status=500)

        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        # Load file into DataFrame robustly
        try:
            name = str(getattr(fichier, "name", "")).lower()
            if name.endswith(".csv") or (not is_xlsx(fichier) and not is_xls(fichier) and name.endswith((".txt", ".dat"))):
                df = read_csv_df(fichier)
            else:
                fichier.seek(0)
                df = pd.read_excel(fichier, dtype=str, keep_default_na=True)
        except Exception as e:
            return Response({"error": f"Fichier illisible ({e})."}, status=400)

        if df is None or df.empty:
            return Response({"error": "Fichier vide."}, status=400)

        fiche_fields = {f.name for f in Fiche._meta.get_fields()}
        has_ref_field = "ref" in fiche_fields  # ✅ crucial pour ne plus écraser

        created, updated, ignored, erreurs = [], [], [], []
        _hotel_cache: Dict[str, Any] = {}
        _zone_cache: Dict[str, Any] = {}

        def cell(row, key):
            col = mapping.get(key)
            if not col:
                return None
            if col in row.index:
                return row.get(col)
            for c in row.index:
                if str(c).strip() == str(col).strip():
                    return row.get(c)
            return None

        def _safe_int(x):
            s = _to_str(x)
            return int(s) if s.isdigit() else 0

        for i, row in df.iterrows():
            try:
                t = _normalize_type(cell(row, "type_mouvement"))
                if not t:
                    ignored.append({"ligne": i + 2, "raison": "type A/D manquant"})
                    continue

                d = _smart_date(cell(row, "date"))
                if not d:
                    ignored.append({"ligne": i + 2, "raison": "date invalide"})
                    continue

                hv = _smart_time(cell(row, "horaires"))
                prov = _to_str(cell(row, "provenance"))
                dest = _to_str(cell(row, "destination"))
                vol = _to_str(cell(row, "num_vol"))
                to = _to_str(cell(row, "client_to"))
                tit = _to_str(cell(row, "titulaire"))
                hotel_txt = _to_str(cell(row, "hotel"))
                ref = _to_str(cell(row, "ref"))
                ville = _to_str(cell(row, "ville"))
                cp = _to_str(cell(row, "code_postal"))
                obs = _to_str(cell(row, "observation"))

                # Si on a ref dans le modèle -> on accepte même si hotel vide (sinon impossible)
                if has_ref_field:
                    if not ref:
                        ignored.append({"ligne": i + 2, "raison": "REF manquante"})
                        continue
                else:
                    # fallback historique: sans ref, on exige hotel pour éviter collisions
                    if not hotel_txt:
                        ignored.append({"ligne": i + 2, "raison": "hotel manquant (pas de champ ref côté modèle)"})
                        continue

                ad = _safe_int(cell(row, "adulte"))
                ch = _safe_int(cell(row, "enfants"))
                bb = _safe_int(cell(row, "bb_gratuit")) or _safe_int(cell(row, "bebe"))
                pax_raw = _to_str(cell(row, "pax"))
                pax = int(pax_raw) if pax_raw.isdigit() else (ad + ch + bb)

                hotel_obj = None
                if hotel_txt and Hotel:
                    k = hotel_txt.lower()
                    hotel_obj = (
                        _hotel_cache.get(k)
                        or Hotel.objects.filter(nom__iexact=hotel_txt).first()
                        or Hotel.objects.create(nom=hotel_txt)
                    )
                    _hotel_cache[k] = hotel_obj

                zone_txt = _to_str(cell(row, "zone"))
                zone_obj = None
                if zone_txt and Zone:
                    kz = zone_txt.lower()
                    zone_obj = (
                        _zone_cache.get(kz)
                        or Zone.objects.filter(nom__iexact=zone_txt).first()
                        or Zone.objects.create(nom=zone_txt)
                    )
                    _zone_cache[kz] = zone_obj

                defaults = {
                    "agence": agence,
                    "type": t,
                    "date": d,
                    "horaires": hv,
                    "numero_vol": vol or "",
                    "client_to": to or "",
                    "titulaire": tit or "",
                    "hotel": hotel_obj if _is_fk(Fiche, "hotel") else (hotel_txt or ""),
                    "ville": ville or "",
                    "code_postal": cp or "",
                    "observation": obs or "",
                    "adulte": ad,
                    "enfants": ch,
                    "bebe": bb,
                    "pax": pax,
                }

                if has_ref_field:
                    defaults["ref"] = ref

                if _is_fk(Fiche, "zone_fk") and zone_obj:
                    defaults["zone_fk"] = zone_obj
                elif "zone" in fiche_fields:
                    defaults["zone"] = zone_txt or ""

                if t == "D":
                    defaults["provenance"] = prov or dest or ""
                else:
                    defaults["destination"] = dest or prov or ""

                defaults = _sanitize_defaults(Fiche, defaults)

                # ✅ LOOKUP FIX: si champ ref existe -> (agence, ref) => 1 ligne = 1 fiche
                if has_ref_field:
                    lookup = {"agence": agence, "ref": ref}
                else:
                    # fallback ancien (moins fiable)
                    lookup = {
                        "agence": agence,
                        "type": t,
                        "date": d,
                        "numero_vol": vol or "",
                        "hotel": hotel_obj if _is_fk(Fiche, "hotel") else (hotel_txt or ""),
                    }

                obj, was_created = Fiche.objects.update_or_create(defaults=defaults, **lookup)
                (created if was_created else updated).append(getattr(obj, "ref", f"{obj.date} {obj.type}"))

            except Exception as e:
                erreurs.append({"ligne": i + 2, "raison": f"{type(e).__name__}: {e}"})

        return Response(
            {
                "message": "Import fiches terminé",
                "agence": int(agence_id),
                "created_count": len(created),
                "updated_count": len(updated),
                "ignored_count": len(ignored),
                "errors_count": len(erreurs),
                "fiches_creees": created,
                "fiches_mises_a_jour": updated,
                "lignes_ignorees": ignored,
                "erreurs": erreurs,
                "lookup_mode": "ref" if has_ref_field else "fallback(type+date+num_vol+hotel)",
            },
            status=200,
        )
