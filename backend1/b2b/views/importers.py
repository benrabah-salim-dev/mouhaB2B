# b2b/views/importers.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
import unicodedata
from datetime import datetime, date, time
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd
from django.db import transaction
from django.shortcuts import get_object_or_404
from openpyxl import load_workbook
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.views.helpers import _ensure_same_agence_or_superadmin
from b2b.models import (
    AgenceVoyage,
    FicheMouvement,
    Zone,
    Profile,
    Vehicule,
    Chauffeur,
    Hotel,
    Dossier,
)

# =====================================================================
# Helpers génériques
# =====================================================================

def _to_str(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() in {"nan", "none", "null", "-"} else s


def _to_int(v: Any, default: int = 0) -> int:
    if v is None:
        return default
    try:
        s = str(v).strip().replace("\u00A0", " ").replace(",", ".")
        m = re.search(r"[-+]?\d*\.?\d+", s)
        if not m:
            return default
        n = float(m.group(0))
        if not (n == n):  # NaN
            return default
        return int(round(n))
    except Exception:
        return default


def _to_date_any(val: Any) -> Optional[date]:
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except Exception:
        pass

    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()

    s = str(val).strip()
    if not s:
        return None
    s = unicodedata.normalize("NFKC", s)

    # Excel serial number (ex: 44679)
    if re.fullmatch(r"\d+(\.\d+)?", s):
        try:
            n = float(s)
            if 20000 <= n <= 60000:
                dt = pd.to_datetime(n, origin="1899-12-30", unit="D", errors="coerce")
                if pd.notna(dt):
                    return dt.date()
        except Exception:
            pass

    # strip time part
    s_main = s.split(" ")[0].split("T")[0]

    # normalize separators to "/"
    cleaned = []
    last_sep = False
    for ch in s_main:
        if ch.isdigit():
            cleaned.append(ch)
            last_sep = False
        else:
            if not last_sep:
                cleaned.append("/")
                last_sep = True
    norm = "".join(cleaned).strip("/")
    parts = [p for p in norm.split("/") if p]

    if len(parts) >= 3 and all(p.isdigit() for p in parts[:3]):
        a, b, c = parts[:3]
        ai, bi, ci = int(a), int(b), int(c)
        year = month = day = None

        if len(a) == 4 and ai >= 1900:  # YYYY/MM/DD
            year, month, day = ai, bi, ci
        elif len(c) == 4 and ci >= 1900:  # DD/MM/YYYY
            year, month, day = ci, bi, ai
        elif len(c) == 2:  # DD/MM/YY
            year = 2000 + ci if ci < 50 else 1900 + ci
            day, month = ai, bi

        if year and month and day:
            try:
                return date(year, month, day)
            except Exception:
                pass

    yearfirst = bool(re.match(r"^\d{4}[/\-\.]", s_main))
    try:
        dt = pd.to_datetime(s_main, errors="coerce", yearfirst=yearfirst, dayfirst=not yearfirst)
        if pd.notna(dt):
            return dt.date()
    except Exception:
        pass

    try:
        dt = pd.to_datetime(s_main, errors="coerce", dayfirst=True)
        if pd.notna(dt):
            return dt.date()
    except Exception:
        pass
    return None


def _parse_time(v: Any) -> Optional[time]:
    if v is None or v == "":
        return None
    if isinstance(v, time):
        return v
    if isinstance(v, datetime):
        return v.time().replace(microsecond=0)

    # excel fraction (0< x <1)
    if isinstance(v, (int, float)) and 0 <= float(v) < 1:
        minutes = int(round(float(v) * 24 * 60))
        hh = minutes // 60
        mm = minutes % 60
        try:
            return time(hh, mm)
        except Exception:
            return None

    try:
        dt = pd.to_datetime(v, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.time().replace(microsecond=0)
    except Exception:
        return None


def _normalize_type_fiche(val: Any) -> Optional[str]:
    if val is None or val == "":
        return None
    t = unicodedata.normalize("NFKC", str(val)).strip().upper()
    if t in {"A", "ARRIVEE", "ARRIVÉE", "ARRIVAL", "L", "LLEGADA"}:
        return "A"
    if t in {"D", "DEPART", "DÉPART", "DEPARTURE", "S", "SALIDA", "SORTIE"}:
        return "D"
    if t in {"A", "D"}:
        return t
    return None


def _is_fk(model_cls, fieldname: Optional[str]) -> bool:
    if not fieldname:
        return False
    try:
        f = model_cls._meta.get_field(fieldname)
        return getattr(f, "remote_field", None) is not None
    except Exception:
        return False


def _allowed_fields(model_cls) -> Set[str]:
    fields: Set[str] = set()
    for f in model_cls._meta.get_fields():
        att = getattr(f, "attname", None)
        if att:
            fields.add(f.name)
    fields.update({f"{name}_id" for name in list(fields)})
    return fields


def _sanitize_defaults(model_cls, defaults: Dict[str, Any]) -> Dict[str, Any]:
    allowed = _allowed_fields(model_cls)
    return {k: v for k, v in defaults.items() if k in allowed}


def purge_empty_foreign_keys(model_cls, defaults: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in list(defaults.items()):
        if _is_fk(model_cls, k) and not v:
            continue
        if k.endswith("_id") and not v:
            continue
        out[k] = (None if v == "" else v)
    return out


def _clean_str(v: Any):
    if v is None:
        return ""
    if isinstance(v, (date, time, datetime)):
        return v
    s = unicodedata.normalize("NFKC", str(v)).strip()
    return "" if s.lower() in {"nan", "none", "null", "-"} else s


# =====================================================================
# Mapping FicheMouvement
# =====================================================================

COL_MAP_FICHE = {
    "DATE": "date",
    "H/V": "horaires",
    "PROVENANCE": "provenance",
    "DESTINATION": "destination",
    "N° VOL": "numero_vol",
    "N°VOL": "numero_vol",
    "NO VOL": "numero_vol",
    "CLIENT / TO": "client_to",
    "CLIENT/TO": "client_to",
    "HOTEL": "hotel",
    "TITULAIRE": "titulaire",
    "PAX": "pax",
    "ADULTE": "adulte",
    "ENFANTS": "enfants",
    "BB/GRATUIT": "bebe",
    "VILLE": "ville",
    "CODE POSTAL": "code_postal",
    "ZONE": "zone_fk",
    "TYPE": "type",
    "DEPART/ARRIVER": "type",
    "AEROPORT": "_aeroport_tmp",
}

# =====================================================================
# Lecture fichier robuste (évite l'utf-8 decode d'un Excel)
# =====================================================================

def _peek(upload, n: int = 8) -> bytes:
    pos = upload.tell()
    b = upload.read(n)
    upload.seek(pos)
    return b or b""


def _is_xlsx(upload) -> bool:
    # XLSX = ZIP => "PK"
    head = _peek(upload, 4)
    return head[:2] == b"PK"


def _is_xls(upload) -> bool:
    # XLS (OLE) => D0 CF 11 E0 A1 B1 1A E1
    head = _peek(upload, 8)
    return head.startswith(b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1")


def _read_csv_df(upload) -> pd.DataFrame:
    """
    CSV robuste:
    - tente plusieurs encodages
    - tente plusieurs séparateurs (souvent ';' en FR)
    """
    last_err = None
    for enc in ("utf-8-sig", "cp1252", "latin1"):
        for sep in (None, ";", ",", "\t"):
            try:
                upload.seek(0)
                if sep is None:
                    # sep=None + python engine => sniff
                    return pd.read_csv(upload, encoding=enc, sep=None, engine="python")
                return pd.read_csv(upload, encoding=enc, sep=sep)
            except UnicodeDecodeError as e:
                last_err = e
                continue
            except Exception as e:
                # si sniff/sep foire, on continue
                last_err = e
                continue
    upload.seek(0)
    # fallback "brutal" : remplace les caractères illisibles
    return pd.read_csv(upload, encoding="latin1", errors="replace", sep=None, engine="python")


def read_upload_to_df(upload) -> pd.DataFrame:
    """
    IMPORTANT: NE JAMAIS essayer de décoder un Excel en UTF-8.
    Stratégie:
      1) Détection par signature binaire (xlsx/xls)
      2) Sinon: lire comme CSV avec encodages/separateurs robustes
      3) En dernier recours: on tente read_excel quand même (certains serveurs altèrent le nom)
    """
    if upload is None:
        raise ValueError("Aucun fichier fourni.")

    name = (getattr(upload, "name", "") or "").lower()
    ext = os.path.splitext(name)[1]

    # 1) Détection binaire (fiable)
    if _is_xlsx(upload):
        upload.seek(0)
        return pd.read_excel(upload, engine="openpyxl")
    if _is_xls(upload):
        upload.seek(0)
        # nécessite xlrd si vrai .xls
        # si xlrd absent, on aura une exception claire
        return pd.read_excel(upload)

    # 2) Détection par extension
    if ext in (".xlsx",):
        upload.seek(0)
        return pd.read_excel(upload, engine="openpyxl")
    if ext in (".xls",):
        upload.seek(0)
        return pd.read_excel(upload)  # xlrd requis

    if ext in (".csv", ".txt"):
        return _read_csv_df(upload)

    # 3) Fallback: essayer Excel d'abord, sinon CSV
    try:
        upload.seek(0)
        return pd.read_excel(upload, engine="openpyxl")
    except Exception:
        return _read_csv_df(upload)


# =====================================================================
# Import FicheMouvement
# =====================================================================

class ImporterFicheMouvementAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    @transaction.atomic
    def post(self, request):
        try:
            agence = self._resolve_agence(request)
        except Exception as e:
            return Response({"detail": str(e)}, status=400)

        f = request.FILES.get("file")
        if not f:
            return Response({"detail": "Aucun fichier fourni."}, status=400)

        # === lecture robuste (c'est ici que l'erreur utf-8 venait) ===
        try:
            df = read_upload_to_df(f)
        except Exception as e:
            return Response({"detail": f"Fichier illisible ({e})."}, status=400)

        df = df.fillna("")
        # normalise colonnes en MAJ
        df.columns = [str(c).strip().upper() for c in df.columns.tolist()]

        created = updated = ignored = 0
        errors: List[Dict[str, Any]] = []
        dossiers_crees: List[str] = []
        dossiers_mis_a_jour: List[str] = []

        for idx, raw_row in df.iterrows():
            line_no = int(idx) + 2  # header = ligne 1
            try:
                defaults: Dict[str, Any] = {"agence": agence}
                lookup: Dict[str, Any] = {}
                tmp: Dict[str, Any] = {}

                # mapping colonnes -> champs internes
                for col_name in df.columns:
                    field = COL_MAP_FICHE.get(col_name)
                    if not field:
                        continue
                    tmp[field] = _clean_str(raw_row.get(col_name, ""))

                dt = _to_date_any(tmp.get("date"))
                hv = _parse_time(tmp.get("horaires"))
                typ = _normalize_type_fiche(tmp.get("type")) or "A"

                lookup["date"] = dt
                lookup["hotel"] = tmp.get("hotel") or None
                if not (lookup["date"] and lookup["hotel"]):
                    ignored += 1
                    continue

                defaults["type"] = typ
                if hv:
                    defaults["horaires"] = hv

                aeroport_val = tmp.get("_aeroport_tmp") or ""
                if aeroport_val:
                    if typ == "D":
                        defaults["provenance"] = aeroport_val
                    else:
                        defaults["destination"] = aeroport_val

                for k in [
                    "provenance",
                    "destination",
                    "numero_vol",
                    "client_to",
                    "hotel",
                    "titulaire",
                    "ville",
                    "code_postal",
                    "observation",
                ]:
                    v = tmp.get(k, "")
                    if v != "":
                        defaults[k] = v

                for k in ["pax", "adulte", "enfants", "bebe"]:
                    v = tmp.get(k, "")
                    if v not in ("", None):
                        defaults[k] = _to_int(v, default=0)

                ztxt = tmp.get("zone_fk", "")
                if isinstance(ztxt, str):
                    ztxt = ztxt.strip()
                if ztxt:
                    z = Zone.objects.filter(nom__iexact=ztxt).first()
                    if not z:
                        z = Zone.objects.create(nom=ztxt)
                    defaults["zone_fk"] = z

                defaults = purge_empty_foreign_keys(FicheMouvement, defaults)
                defaults = _sanitize_defaults(FicheMouvement, defaults)

                obj, was_created = FicheMouvement.objects.update_or_create(
                    agence=agence, **lookup, defaults=defaults
                )

                if was_created:
                    created += 1
                    dossiers_crees.append(getattr(obj, "ref", str(obj.pk)))
                else:
                    updated += 1
                    dossiers_mis_a_jour.append(getattr(obj, "ref", str(obj.pk)))

            except Exception as e:
                errors.append({"ligne": line_no, "raison": f"{type(e).__name__}: {e}"})

        return Response(
            {
                "message": "Import fiches terminé",
                "agence": agence.id,
                "created_count": created,
                "updated_count": updated,
                "ignored_count": ignored,
                "errors_count": len(errors),
                "dossiers_crees": dossiers_crees,
                "dossiers_mis_a_jour": dossiers_mis_a_jour,
                "erreurs": errors,
            },
            status=200,
        )

    def _resolve_agence(self, request) -> AgenceVoyage:
        # profil
        try:
            prof = Profile.objects.select_related("agence").get(user=request.user)
            if prof.agence_id:
                return prof.agence
        except Profile.DoesNotExist:
            pass

        # param
        agence_id = request.query_params.get("agence") or request.data.get("agence")
        if agence_id:
            return get_object_or_404(AgenceVoyage, pk=int(agence_id))

        raise ValueError("Aucune agence détectée (profil ou paramètre ?agence manquant).")


# =====================================================================
# Dossiers -> une FicheMouvement (création agrégée)
# =====================================================================

class DossiersToSingleFicheAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        data = request.data or {}
        agence_id = data.get("agence")
        dossier_ids = data.get("dossier_ids") or []
        if not agence_id:
            return Response({"error": "Paramètre 'agence' requis."}, status=400)
        if not dossier_ids:
            return Response({"error": "Paramètre 'dossier_ids' requis."}, status=400)

        _ensure_same_agence_or_superadmin(request, int(agence_id))
        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        qs = Dossier.objects.filter(pk__in=dossier_ids)
        if not qs.exists():
            return Response({"error": "Aucun dossier trouvé."}, status=400)

        def get_attr(d, *names):
            for n in names:
                if hasattr(d, n):
                    return getattr(d, n)
            return None

        first = qs.first()
        type_val = ((data.get("type") or get_attr(first, "type_mouvement", "type") or "A").strip()[:1].upper())
        date_val = data.get("date") or (min([get_attr(d, "date") for d in qs if get_attr(d, "date")]) or None)
        numero_vol = data.get("numero_vol") or next(
            (get_attr(d, "num_vol", "numero_vol", "vol") for d in qs if get_attr(d, "num_vol", "numero_vol", "vol")),
            None,
        )

        aeroport = data.get("aeroport")
        if not aeroport:
            if type_val == "D":
                aeroport = next((get_attr(d, "provenance", "from_") for d in qs if get_attr(d, "provenance", "from_")), None)
            else:
                aeroport = next((get_attr(d, "destination", "to_", "dst") for d in qs if get_attr(d, "destination", "to_", "dst")), None)

        total_adulte = sum(int(get_attr(d, "adulte") or 0) for d in qs)
        total_enfants = sum(int(get_attr(d, "enfants") or 0) for d in qs)
        total_bebe = sum(int(get_attr(d, "bb_gratuit") or 0) for d in qs)
        total_pax = sum(
            int(get_attr(d, "pax") or 0) or (int(get_attr(d, "adulte") or 0) + int(get_attr(d, "enfants") or 0) + int(get_attr(d, "bb_gratuit") or 0))
            for d in qs
        )

        hotel_txt = get_attr(first, "hotel", "hotel_txt") or ""
        titulaire = get_attr(first, "titulaire", "holder", "nom_reservation") or ""

        lookup = dict(agence=agence, type=type_val, date=date_val, numero_vol=numero_vol or "", hotel=hotel_txt or "")
        defaults = dict(
            horaires=get_attr(first, "horaires", "heure", "time") or time(0, 0),
            client_to=get_attr(first, "client", "client_to") or "",
            titulaire=titulaire or "",
            pax=total_pax,
            adulte=total_adulte,
            enfants=total_enfants,
            bebe=total_bebe,
            observation="",
            ville=get_attr(first, "ville") or "",
            code_postal=get_attr(first, "code_postal") or "",
        )
        if type_val == "D":
            defaults["provenance"] = aeroport or ""
        else:
            defaults["destination"] = aeroport or ""

        fiche, _ = FicheMouvement.objects.update_or_create(lookup, defaults=defaults)

        for d in qs:
            for fname in ("fiche", "fiche_mouvement", "fiche_fk"):
                if hasattr(d, fname):
                    setattr(d, fname, fiche)
                    d.save(update_fields=[fname])
                    break
            else:
                try:
                    getattr(d, "fiches").add(fiche)
                except Exception:
                    pass

        return Response(
            {"fiche_id": fiche.id, "numero_vol": fiche.numero_vol, "date": str(fiche.date) if fiche.date else None, "type": fiche.type, "aeroport": aeroport, "pax": fiche.pax},
            status=200,
        )


# =====================================================================
# Enrichissement des adresses d’hôtels
# =====================================================================

try:
    from b2b.services.geocoding import lookup_hotel_address
except Exception:  # fallback neutre
    def lookup_hotel_address(hotel_name: str, city: Optional[str], postal: Optional[str], country: Optional[str] = None) -> Optional[str]:
        return None


class EnrichHotelAddressesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        HotelModel = Hotel
        if not HotelModel:
            return Response({"error": "Modèle Hotel introuvable."}, status=500)

        hotel_ids = request.data.get("hotel_ids") or []
        limit = int(request.data.get("limit") or 300)
        country = _to_str(request.data.get("country") or "Tunisia") or None

        from django.db.models import Q

        qs = HotelModel.objects.all()
        if hotel_ids:
            qs = qs.filter(id__in=hotel_ids)
        qs = qs.filter(Q(adresse__isnull=True) | Q(adresse="")).order_by("id")[:limit]

        updated, skipped, errors = 0, 0, []
        for h in qs:
            try:
                city = getattr(h, "ville", None) or None
                cp = getattr(h, "code_postal", None) or None
                addr = lookup_hotel_address(h.nom, city, cp, country=country)
                if addr:
                    h.adresse = addr
                    h.save(update_fields=["adresse"])
                    updated += 1
                else:
                    skipped += 1
            except Exception as e:
                errors.append({"hotel": getattr(h, "nom", f"id={h.id}"), "err": str(e)})

        return Response({"updated": updated, "skipped": skipped, "errors": errors}, status=200)


# =====================================================================
# Import Véhicules (Excel/CSV)
# =====================================================================

# =====================================================================
# Import Véhicules (Excel/CSV) — ROBUSTE
# =====================================================================

class ImporterVehiculesAPIView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    # Synonymes colonnes possibles (FR/EN + variantes)
    VEH_HEADERS = {
        "type": [
            "type", "vehicule", "véhicule", "vehicle type", "vehicle", "categorie", "catégorie",
        ],
        "marque": [
            "marque", "brand", "constructeur", "make",
        ],
        "modele": [
            "modele", "modèle", "model", "modèle",
        ],
        "immatriculation": [
            "immatriculation", "immat", "plaque", "matricule", "registration", "license plate", "plate",
            "id", "id (immatriculation)", "id immatriculation",
        ],
        "capacite": [
            "capacite", "capacité", "capacity", "places", "nb places", "nombre de places", "pax max", "pax",
        ],
        "annee_mise_en_circulation": [
            "annee", "année", "annee mise en circulation", "année mise en circulation",
            "mise en circulation", "year", "year of registration",
            "annee_mise_en_circulation", "année_mise_en_circulation",
        ],
        "adresse": [
            "adresse", "adresse actuelle", "position", "position actuelle", "emplacement",
            "location", "current address", "address",
        ],
        "statut": [
            "statut", "status", "disponibilite", "disponibilité",
        ],
        # optionnels si tu les as dans ton modèle
        "last_lat": ["last lat", "lat", "latitude", "gps lat"],
        "last_lng": ["last lng", "lng", "longitude", "gps lng", "long"],
        "louer_autres_agences": ["louer autres agences", "rentout", "rent out", "louable", "louer"],
    }

    # ---------- Helpers ----------
    def _norm_key(self, s: str) -> str:
        if s is None:
            return ""
        s = unicodedata.normalize("NFKC", str(s)).strip().lower()
        # supprime accents
        s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
        # compact espaces
        s = re.sub(r"\s+", " ", s)
        return s

    def _find_col(self, df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
        # Map normalized->original
        mapping = {self._norm_key(c): c for c in df.columns}
        for cand in candidates:
            key = self._norm_key(cand)
            if key in mapping:
                return mapping[key]

        # fallback : contient / startswith
        for norm_col, original in mapping.items():
            for cand in candidates:
                k = self._norm_key(cand)
                if k and (k == norm_col or k in norm_col or norm_col in k):
                    return original
        return None

    def _to_str(self, v: Any) -> str:
        if v is None:
            return ""
        s = str(v).strip()
        if s.lower() in {"nan", "none", "null", "-", "—"}:
            return ""
        return s

    def _to_int(self, v: Any, default: Optional[int] = None) -> Optional[int]:
        if v is None or v == "":
            return default
        try:
            s = str(v).strip().replace("\u00A0", " ").replace(",", ".")
            m = re.search(r"[-+]?\d*\.?\d+", s)
            if not m:
                return default
            n = float(m.group(0))
            if not (n == n):  # NaN
                return default
            return int(round(n))
        except Exception:
            return default

    def _to_bool(self, v: Any) -> Optional[bool]:
        if v is None or v == "":
            return None
        s = self._to_str(v).lower()
        if s in {"1", "true", "vrai", "yes", "y", "oui"}:
            return True
        if s in {"0", "false", "faux", "no", "n", "non"}:
            return False
        return None

    def _normalize_type(self, v: Any) -> str:
        s = self._to_str(v).lower()
        if not s:
            return "bus"
        # normalisations
        if "4x4" in s or "4 x 4" in s or "suv" in s:
            return "4x4"
        if "van" in s or "minibus" in s or "mini bus" in s:
            return "van"
        if "car" in s or "coach" in s or "autocar" in s:
            return "bus"
        if "bus" in s:
            return "bus"
        if "voiture" in s or "car" == s or "sedan" in s:
            return "voiture"
        return s  # fallback (si tu gères d’autres types)

    def _normalize_statut(self, v: Any) -> str:
        s = self._to_str(v).lower()
        if not s:
            return "disponible"
        if s in {"dispo", "available", "free", "ok"}:
            return "disponible"
        if s in {"indispo", "unavailable", "busy", "occupe", "occupé"}:
            return "indisponible"
        if "maint" in s or "repair" in s or "panne" in s:
            return "maintenance"
        if "reserve" in s or "réserv" in s:
            return "reserve"
        return s

    def _get_agence_id(self, request) -> Optional[int]:
        agence_id = request.data.get("agence") or getattr(getattr(request.user, "profile", None), "agence_id", None)
        try:
            return int(agence_id) if agence_id else None
        except Exception:
            return None

    def _get_agence_base_address(self, agence: AgenceVoyage) -> str:
        # adapte selon tes champs AgenceVoyage
        for fname in ("adresse", "address", "emplacement", "adresse_base", "localisation"):
            if hasattr(agence, fname):
                val = getattr(agence, fname)
                val = self._to_str(val)
                if val:
                    return val
        return ""

    # ---------- POST ----------
    def post(self, request, *args, **kwargs):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Aucun fichier envoyé (champ 'file')."}, status=status.HTTP_400_BAD_REQUEST)

        agence_id = self._get_agence_id(request)
        if not agence_id:
            return Response({"detail": "Agence non déterminée pour l'import."}, status=status.HTTP_400_BAD_REQUEST)

        _ensure_same_agence_or_superadmin(request, int(agence_id))

        try:
            agence = AgenceVoyage.objects.get(pk=agence_id)
        except AgenceVoyage.DoesNotExist:
            return Response({"detail": f"Agence {agence_id} introuvable."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            df = read_upload_to_df(upload).fillna("")
        except Exception as e:
            return Response({"detail": f"Impossible de lire le fichier : {e}"}, status=status.HTTP_400_BAD_REQUEST)

        # Trouver colonnes (robuste)
        cols = {}
        for field, candidates in self.VEH_HEADERS.items():
            cols[field] = self._find_col(df, candidates)

        # immatriculation obligatoire
        if not cols["immatriculation"]:
            return Response(
                {"detail": "Colonne immatriculation introuvable. Ex: 'Immat', 'Plaque', 'ID (Immatriculation)'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_addr = self._get_agence_base_address(agence)

        created = 0
        updated = 0
        ignored = 0
        errors: List[Dict[str, Any]] = []

        with transaction.atomic():
            for idx, row in df.iterrows():
                line_no = int(idx) + 2

                try:
                    immat = self._to_str(row.get(cols["immatriculation"]))
                    if not immat:
                        ignored += 1
                        errors.append({"ligne": line_no, "raison": "Immatriculation manquante"})
                        continue

                    v_type = self._normalize_type(row.get(cols["type"])) if cols["type"] else "bus"
                    v_marque = self._to_str(row.get(cols["marque"])) if cols["marque"] else ""
                    v_modele = self._to_str(row.get(cols["modele"])) if cols["modele"] else ""

                    v_cap = self._to_int(row.get(cols["capacite"]), default=None) if cols["capacite"] else None
                    v_year = self._to_int(row.get(cols["annee_mise_en_circulation"]), default=None) if cols["annee_mise_en_circulation"] else None

                    v_addr = self._to_str(row.get(cols["adresse"])) if cols["adresse"] else ""
                    if not v_addr:
                        v_addr = base_addr  # ✅ adresse par défaut = agence

                    v_statut = self._normalize_statut(row.get(cols["statut"])) if cols["statut"] else "disponible"

                    v_lat = None
                    v_lng = None
                    if cols.get("last_lat"):
                        v_lat = self._to_int(row.get(cols["last_lat"]), default=None)
                    if cols.get("last_lng"):
                        v_lng = self._to_int(row.get(cols["last_lng"]), default=None)

                    louable = None
                    if cols.get("louer_autres_agences"):
                        louable = self._to_bool(row.get(cols["louer_autres_agences"]))

                    # 🔥 IMPORTANT : on n’écrase PAS avec vide.
                    defaults: Dict[str, Any] = {
                        "agence": agence,
                        "statut": v_statut,
                        "type": v_type,
                    }
                    if v_marque != "":
                        defaults["marque"] = v_marque
                    if v_modele != "":
                        defaults["modele"] = v_modele
                    if v_cap is not None:
                        defaults["capacite"] = v_cap
                    if v_year is not None:
                        # adapte le nom du champ selon ton modèle
                        # (tu utilises déjà "annee_mise_en_circulation" côté front)
                        defaults["annee_mise_en_circulation"] = v_year
                    if v_addr != "":
                        defaults["adresse"] = v_addr
                    if v_lat is not None and "last_lat" in _allowed_fields(Vehicule):
                        defaults["last_lat"] = v_lat
                    if v_lng is not None and "last_lng" in _allowed_fields(Vehicule):
                        defaults["last_lng"] = v_lng
                    if louable is not None and "louer_autres_agences" in _allowed_fields(Vehicule):
                        defaults["louer_autres_agences"] = louable

                    # Nettoyage final : garde uniquement champs existants
                    defaults = _sanitize_defaults(Vehicule, defaults)
                    defaults = purge_empty_foreign_keys(Vehicule, defaults)

                    vehicule, created_flag = Vehicule.objects.update_or_create(
                        immatriculation=immat,
                        agence=agence,
                        defaults=defaults,
                    )
                    if created_flag:
                        created += 1
                    else:
                        updated += 1

                except Exception as e:
                    errors.append({"ligne": line_no, "raison": f"{type(e).__name__}: {e}"})

        return Response(
            {
                "detail": "Import des véhicules terminé.",
                "agence": agence.id,
                "created": created,
                "updated": updated,
                "ignored": ignored,
                "errors_count": len(errors),
                "errors": errors,
                "columns_detected": cols,  # utile pour debug
            },
            status=status.HTTP_200_OK,
        )



# =====================================================================
# Import Chauffeurs (Excel/CSV)
# =====================================================================

class ImporterChauffeursAPIView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    HEADERS = {
        "nom": ["NOM", "Nom", "Last name", "Apellido"],
        "prenom": ["PRENOM", "Prénom", "First name", "Nombre"],
        "cin": ["CIN", "N° CIN", "C.I.N", "ID", "Identité"],
    }

    def _find_col(self, df: pd.DataFrame, candidates):
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
        if val is None or (isinstance(val, float) and pd.isna(val)):
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
            df = read_upload_to_df(fichier).fillna("")
        except Exception as e:
            return Response({"error": f"Erreur lecture fichier : {e}"}, status=400)

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
                ignored.append({"ligne": int(idx) + 2, "raison": "Nom manquant"})
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
                "resume": {"crees": len(created), "mis_a_jour": len(updated), "ignores": len(ignored), "total_lues": int(df.shape[0])},
            },
            status=200,
        )
