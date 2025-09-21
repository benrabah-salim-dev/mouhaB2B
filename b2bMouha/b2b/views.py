# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
import unicodedata
from io import BytesIO
from datetime import datetime, timedelta, time as time_cls
from typing import Any, Dict, List, Optional

import pandas as pd
import torch
from django.conf import settings
from django.contrib.auth.models import User
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Q, Prefetch
from django.http import HttpResponse, FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime, parse_date

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from sentence_transformers import SentenceTransformer, util

from .models import (
    AgenceVoyage,
    Chauffeur,
    Dossier,
    Hotel,
    LanguageMapping,
    Mission,
    OrdreMission,
    PreMission,
    Vehicule,
    FicheMouvement,
    FicheMouvementItem,
    Profile,
)

# ---- serializers centralisés ----
from .serializers import (
    AgenceVoyageSerializer,
    VehiculeSerializer,
    ChauffeurSerializer,
    HotelSerializer,
    DossierSerializer,
    PreMissionSerializer,
    MissionSerializer,
    OrdreMissionSerializer,
    LanguageMappingSerializer,
    FicheMouvementSerializer,
    FicheMouvementItemSerializer,
    FicheMouvementListSerializer,
    FicheMouvementDetailSerializer,
    DossierLiteSerializer,
    UserSerializer,
)

# =========================
# Helpers Sécurité / Rôles
# =========================

def _user_role(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "superadmin"
    return getattr(getattr(user, "profile", None), "role", None)

def _user_agence(user):
    return getattr(getattr(user, "profile", None), "agence", None)

class IsSuperAdminRole(BasePermission):
    def has_permission(self, request, view):
        return _user_role(request.user) == "superadmin"

def _ensure_same_agence_or_superadmin(request, agence_obj_or_id):
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

# =========================
# Auth de base
# =========================

class TokenRefresh(APIView):
    permission_classes = [AllowAny]
    def post(self, request, *args, **kwargs):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"error": "Refresh token is required."}, status=400)
        try:
            refresh = RefreshToken(refresh_token)
            return Response({"access": str(refresh.access_token)}, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

class LoginView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = User.objects.filter(username=username).first()
        if not user or not user.check_password(password):
            return Response({"detail": "Nom d'utilisateur ou mot de passe incorrect"}, status=401)

        refresh = RefreshToken.for_user(user)
        role = "superadmin" if user.is_superuser else getattr(getattr(user, "profile", None), "role", "adminagence")
        agence_id = getattr(getattr(getattr(user, "profile", None), "agence", None), "id", None)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "role": role,
            "agence_id": agence_id,
        }, status=200)

class UserMeAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response(UserSerializer(request.user).data)

# =========================
# ViewSets & API
# =========================

class AgenceVoyageViewSet(viewsets.ModelViewSet):
    serializer_class = AgenceVoyageSerializer
    permission_classes = [IsAuthenticated]
    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            return [IsSuperAdminRole()]
        return [IsAuthenticated()]
    def get_queryset(self):
        qs = AgenceVoyage.objects.all()
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(id=getattr(_user_agence(self.request.user), "id", None))
        return AgenceVoyage.objects.none()

class VehiculeViewSet(viewsets.ModelViewSet):
    serializer_class = VehiculeSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        qs = Vehicule.objects.all().select_related("agence")
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(agence=_user_agence(self.request.user))
        return Vehicule.objects.none()

class ChauffeurViewSet(viewsets.ModelViewSet):
    serializer_class = ChauffeurSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        qs = Chauffeur.objects.all().select_related("agence")
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(agence=_user_agence(self.request.user))
        return Chauffeur.objects.none()

class HotelViewSet(viewsets.ModelViewSet):
    serializer_class = HotelSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        return Hotel.objects.all()

class DossierViewSet(viewsets.ModelViewSet):
    serializer_class = DossierSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        qs = Dossier.objects.all().select_related("agence", "hotel")
        role = _user_role(self.request.user)
        agence_id = self.request.query_params.get("agence")
        if role == "superadmin":
            return qs if not agence_id else qs.filter(agence_id=agence_id)
        if role == "adminagence":
            return qs.filter(agence=_user_agence(self.request.user))
        return Dossier.objects.none()

class PreMissionViewSet(viewsets.ModelViewSet):
    serializer_class = PreMissionSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        qs = PreMission.objects.all().select_related("agence", "dossier")
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(agence=_user_agence(self.request.user))
        return PreMission.objects.none()
    def perform_create(self, serializer):
        role = _user_role(self.request.user)
        if role == "superadmin":
            serializer.save()
            return
        my_agence = _user_agence(self.request.user)
        if not my_agence:
            raise PermissionDenied("Aucune agence associée.")
        dossier = serializer.validated_data.get("dossier")
        if dossier.agence_id != my_agence.id:
            raise PermissionDenied("Dossier d'une autre agence.")
        serializer.save(agence=my_agence)
    def perform_update(self, serializer):
        instance = self.get_object()
        _ensure_same_agence_or_superadmin(self.request, instance.agence)
        if _user_role(self.request.user) != "superadmin":
            serializer.validated_data.pop("agence", None)
        serializer.save()
    def perform_destroy(self, instance):
        _ensure_same_agence_or_superadmin(self.request, instance.agence)
        instance.delete()

class MissionViewSet(viewsets.ModelViewSet):
    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        qs = Mission.objects.all().select_related("premission", "premission__agence")
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(premission__agence=_user_agence(self.request.user))
        return Mission.objects.none()

    @action(detail=True, methods=["post"], url_path="generate-om")
    def generate_om(self, request, pk=None):
        mission = self.get_object()
        vehicule_id = request.data.get("vehicule")
        chauffeur_id = request.data.get("chauffeur")
        if not vehicule_id or not chauffeur_id:
            return Response({"error": "Chauffeur et véhicule requis"}, status=400)
        vehicule = get_object_or_404(Vehicule, id=vehicule_id)
        chauffeur = get_object_or_404(Chauffeur, id=chauffeur_id)
        _ensure_same_agence_or_superadmin(request, mission.premission.agence)
        ordre = OrdreMission.objects.create(
            reference=generate_unique_reference("OM", OrdreMission),
            mission=mission,
            vehicule=vehicule,
            chauffeur=chauffeur,
            date_depart=mission.date_debut,
            date_retour=mission.date_fin,
            trajet=mission.premission.trajet_prevu or mission.premission.dossier.ville
        )
        mission.ordre_mission_genere = True
        mission.save(update_fields=["ordre_mission_genere"])
        buffer = BytesIO()
        p = canvas.Canvas(buffer)
        p.setFont("Helvetica-Bold", 14)
        p.drawString(100, 800, f"Ordre de Mission: {ordre.reference}")
        p.setFont("Helvetica", 12)
        p.drawString(100, 780, f"Mission: {mission.reference}")
        p.drawString(100, 760, f"Véhicule: {vehicule.immatriculation}")
        p.drawString(100, 740, f"Chauffeur: {chauffeur.nom} {chauffeur.prenom}")
        p.drawString(100, 720, f"Date départ: {mission.date_debut}")
        p.drawString(100, 700, f"Date retour: {mission.date_fin}")
        p.showPage()
        p.save()
        buffer.seek(0)
        return FileResponse(buffer, as_attachment=True, filename=f"ordre_mission_{ordre.reference}.pdf")

class OrdreMissionViewSet(viewsets.ModelViewSet):
    queryset = OrdreMission.objects.select_related(
        "mission", "mission__premission", "mission__premission__agence", "vehicule", "chauffeur"
    ).all()
    serializer_class = OrdreMissionSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        qs = super().get_queryset()
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(mission__premission__agence=_user_agence(self.request.user))
        return OrdreMission.objects.none()
    def perform_create(self, serializer):
        mission = serializer.validated_data.get("mission")
        _ensure_same_agence_or_superadmin(self.request, mission.premission.agence)
        ordre = serializer.save(reference=generate_unique_reference("OM", OrdreMission))
        mission.ordre_mission_genere = True
        mission.save(update_fields=["ordre_mission_genere"])
        return ordre
    def perform_destroy(self, instance):
        mission = instance.mission
        _ensure_same_agence_or_superadmin(self.request, mission.premission.agence)
        instance.delete()
        mission.ordre_mission_genere = False
        mission.save(update_fields=["ordre_mission_genere"])

# =========================
# Utils
# =========================

def generate_unique_reference(prefix: str, model_cls) -> str:
    base = f"{prefix}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
    if not model_cls.objects.filter(reference=base).exists():
        return base
    i = 1
    while True:
        ref = f"{base}-{i}"
        if not model_cls.objects.filter(reference=ref).exists():
            return ref
        i += 1

# =========================
# IA: mapping colonnes (embeddings)
# =========================

_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

def find_best_match(keywords, columns, min_score=0.30):
    if not columns:
        return None
    try:
        emb_cols = _model.encode(columns, convert_to_tensor=True)
        emb_tgt = _model.encode(keywords, convert_to_tensor=True)
        scores = util.cos_sim(emb_tgt, emb_cols)
        if scores.numel() == 0:
            return None
        best_idx = torch.argmax(scores).item()
        best_score = torch.max(scores).item()
        if best_score < min_score:
            for col in columns:
                if any(k.lower() in str(col).lower() for k in keywords):
                    return col
            return None
        return columns[best_idx]
    except Exception:
        return None

# =========================
# Parse datetime Excel robuste
# =========================

def parse_excel_datetime(date_val, time_val=None):
    try:
        if isinstance(date_val, (int, float)) and not pd.isna(date_val):
            base_date = datetime(1899, 12, 30) + pd.Timedelta(days=float(date_val))
        elif isinstance(date_val, str):
            base_date = pd.to_datetime(date_val, errors='coerce')
            if pd.isna(base_date):
                return None
        elif isinstance(date_val, pd.Timestamp):
            base_date = date_val.to_pydatetime()
        else:
            return None

        if time_val:
            if isinstance(time_val, (int, float)) and not pd.isna(time_val):
                seconds = float(time_val) * 24 * 3600
                base_date = base_date.replace(hour=int(seconds // 3600),
                                              minute=int((seconds % 3600) // 60))
            else:
                t = pd.to_datetime(time_val, errors='coerce')
                if not pd.isna(t):
                    t = t.to_pydatetime().time()
                    base_date = base_date.replace(hour=t.hour, minute=t.minute)

        if timezone.is_naive(base_date):
            base_date = timezone.make_aware(base_date)
        return base_date
    except Exception:
        return None

 #=========================
# Import Dossiers (Excel) — version améliorée (détection "nom de réservation")
# =========================

class ImporterDossierAPIView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [AllowAny]

    # -------------------------
    # Utils "header" & strings
    # -------------------------
    @staticmethod
    def _norm_header(s: str) -> str:
        if s is None:
            return ""
        s = str(s).strip().lower()
        s = unicodedata.normalize("NFD", s)
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")  # supprime accents
        s = re.sub(r"[^a-z0-9]+", "", s)  # garde lettres/chiffres
        return s

    @staticmethod
    def _first_str(val: Any) -> Optional[str]:
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return None
        s = str(val).strip()
        if s.lower() in {"", "nan", "none", "null", "-"}:
            return None
        # 123.0 => 123
        if re.fullmatch(r"\d+\.0", s):
            s = s[:-2]
        return s or None

    @staticmethod
    def _first_nonempty_str(*vals: Any) -> Optional[str]:
        for v in vals:
            s = ImporterDossierAPIView._first_str(v)
            if s:
                return s
        return None

    def _find_col(self, df: pd.DataFrame, *keyword_groups: List[str], prefer: Optional[str] = None) -> Optional[str]:
        """Trouve une colonne dont l'en-tête normalisé matche l'un des mots clés.
        Essaye d'abord l'égalité stricte, puis la recherche 'contient'."""
        norm_map: Dict[str, List[str]] = {}
        for c in df.columns:
            norm = self._norm_header(c)
            norm_map.setdefault(norm, []).append(c)

        # recherche stricte
        for group in keyword_groups:
            for k in group:
                k_norm = self._norm_header(k)
                if k_norm in norm_map:
                    cols = norm_map[k_norm]
                    if prefer and prefer in cols:
                        return prefer
                    return cols[0]

        # recherche partielle
        for group in keyword_groups:
            for k in group:
                k_norm = self._norm_header(k)
                candidates = [orig for norm, lst in norm_map.items() if k_norm in norm for orig in lst]
                if candidates:
                    if prefer and prefer in candidates:
                        return prefer
                    return candidates[0]
        return None

    def _find_cols_any(self, df: pd.DataFrame, *keywords: str) -> List[str]:
        """Retourne toutes les colonnes dont le header normalisé matche au moins un keyword (en contient)."""
        want = {self._norm_header(k) for k in keywords}
        results = []
        for col in df.columns:
            n = self._norm_header(col)
            if any(w in n for w in want):
                results.append(col)
        return results

    def _pick_hotel_col(self, df: pd.DataFrame) -> Optional[str]:
        candidates = [c for c in df.columns if "hotel" in self._norm_header(c)]
        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]
        # heuristique: privilégie une colonne avec du texte (noms d'hôtels)
        best_col, best_score = candidates[0], -1
        for col in candidates:
            ser = df[col].dropna().astype(str).head(50)
            score = sum(1 for v in ser if re.search(r"[A-Za-zÀ-ÿ]", v))
            if score > best_score:
                best_col, best_score = col, score
        return best_col

    @staticmethod
    def _clean_time_cell(v: Any) -> Optional[str]:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        # Excel time fraction
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

    def _combine_datetime(self, day_val: Any, time_val: Any) -> Optional[datetime]:
        if day_val is None or (isinstance(day_val, float) and pd.isna(day_val)):
            return None
        try:
            d = pd.to_datetime(day_val, dayfirst=True, errors="coerce")
        except Exception:
            d = pd.NaT
        if pd.isna(d):
            return None
        t_str = self._clean_time_cell(time_val)
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

    # -------------------------
    # Extraction "Nom de réservation" robuste
    # -------------------------
    def _extract_nom_reservation(self, df: pd.DataFrame, row: pd.Series) -> Optional[str]:
        """
        Essaie plusieurs colonnes possibles *à la ligne* :
        - 'nom réservation', 'nom reservation', 'reservation', 'booking name',
          'titular(e)', 'groupe', 'group', 'party name', 'holder', 'client', etc.
        - compose à partir de (nom, prénom) si présent.
        - retourne le premier texte non vide et propre.
        """
        # 1) liste élargie de synonymes (on matche "contient")
        candidates_headers = self._find_cols_any(
            df,
            "nomreservation", "nomresa", "reservation", "booking", "bookingname",
            "groupe", "group", "party", "partyname",
            "titular", "titulaire", "holder", "client", "clients",
            "lead", "leadname", "contact", "passager", "passengers", "paxnames", "pax"
        )

        # 2) lecture des valeurs non vides dans l'ordre
        values = []
        for col in candidates_headers:
            val = self._first_str(row.get(col))
            if val:
                values.append(val)

        # 3) si rien, essaie de composer Nom + Prénom
        #    (en cherchant entêtes plausibles pour nom/prénom)
        if not values:
            last_name_cols = self._find_cols_any(df, "nom", "lastname", "last_name", "surname")
            first_name_cols = self._find_cols_any(df, "prenom", "firstname", "first_name", "givenname")
            ln = None
            fn = None
            for col in last_name_cols:
                ln = self._first_str(row.get(col))
                if ln:
                    break
            for col in first_name_cols:
                fn = self._first_str(row.get(col))
                if fn:
                    break
            combined = " ".join([fn or "", ln or ""]).strip()
            if combined:
                values.append(combined)

        # 4) nettoie et retourne le premier non vide
        for v in values:
            s = re.sub(r"\s+", " ", v).strip()
            if s and s.lower() not in {"nan", "none", "null", "-"}:
                return s
        return None

    # -------------------------
    # Observations multi-colonnes
    # -------------------------
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
            norm_map.setdefault(self._norm_header(c), []).append(c)

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

        def _is_meaningful_obs(val) -> bool:
            if val is None or (isinstance(val, float) and pd.isna(val)):
                return False
            s = str(val).strip()
            return bool(s) and s.lower() not in {"0", "0.0", "nan", "none", "null", "-"}

        def _clean_obs_text(s: str) -> str:
            s = str(s).replace("\r", " ").replace("\n", " ")
            s = s.replace("T#", " ").replace("#", " ")
            s = re.sub(r"\s+", " ", s).strip()
            return s

        pieces, seen = [], set()
        for c in obs_cols:
            raw = row.get(c)
            if _is_meaningful_obs(raw):
                txt = _clean_obs_text(self._first_str(raw) or "")
                if txt and txt not in seen:
                    seen.add(txt)
                    pieces.append(txt)
        return " | ".join(pieces)

    # -------------------------
    # POST
    # -------------------------
    def post(self, request):
        fichier = request.FILES.get("file")
        agence_id = request.data.get("agence")
        if not fichier:
            return Response({"error": "Aucun fichier envoyé."}, status=400)
        if not agence_id:
            return Response({"error": "Agence requise."}, status=400)

        agence = get_object_or_404(AgenceVoyage, id=agence_id)

        try:
            df = pd.read_excel(fichier)
        except Exception as e:
            return Response({"error": f"Erreur lecture Excel: {e}"}, status=400)
        if df.empty:
            return Response({"error": "Le fichier est vide."}, status=400)

        cols = list(df.columns)

        # --- helpers de recherche colonne (avec fallback fuzzy find_best_match si tu l'as déjà)
        def choose_col(keywords, prefer=None):
            col = self._find_col(df, keywords, prefer=prefer)
            if col:
                return col
            # fallback si tu as une fonction find_best_match disponible dans ton projet
            try:
                return find_best_match(keywords, cols, min_score=0.30)  # noqa
            except Exception:
                return None

        # Références
        col_ref_to   = choose_col(["Ref.T.O.", "Ref TO", "RefTO", "RefTO.", "Ref T.O.", "Ref T O", "Ref_T_O"])
        col_ntra_ref = choose_col(["Ntra.Ref", "NtraRef", "Ntra Ref", "Ntra"])
        col_ref_alt  = choose_col(["Reference", "Référence", "Ref", "REF"])
        col_ref      = col_ref_to or col_ntra_ref or col_ref_alt

        # Datetime
        col_day  = choose_col(["Dia", "DATE", "Date", "Fecha", "Jour", "Data"])
        col_time = choose_col(["Hora", "Horaires", "Horaire", "Heure", "Time", "Horas"])

        # Vol / orig / dest / type
        col_vol = choose_col(["Vuelo", "Vol", "Flight", "N° VOL", "N VOL", "Nº VOL"])
        col_org = choose_col(["Org", "Provenance", "Orig", "From"])
        col_dst = choose_col(["Dst", "Destination", "To"])
        col_ls  = choose_col(["L/S", "LS", "D/A", "A/D", "DA", "AD", "Type Mouvement", "Type", "Mouvement"])

        # Infos diverses
        col_city  = choose_col(["Ciudad", "Ville", "City", "Localite", "Localité"])
        col_pax   = choose_col(["Pax", "PAX", "Passengers", "Adultes", "Adultos"])
        # ancien "nom" (on garde mais on le traitera avec la méthode robuste)
        col_name  = choose_col(["Titular", "Titulaire", "Nom", "Name", "Holder", "Client"])
        col_to    = choose_col(["T.O.", "TO", "Client TO", "CLIENT/ TO", "CLIENT TO",
                                "Client/ TO", "Tour Operateur", "Tour Opérateur",
                                "Tour Operador", "Tour Operator"])
        col_hotel = self._pick_hotel_col(df)

        dossiers_crees: List[str] = []
        dossiers_mis_a_jour: List[str] = []
        lignes_ignorees: List[Dict[str, Any]] = []
        ui_rows: List[Dict[str, Any]] = []

        for idx, row in df.iterrows():
            # ---- Référence obligatoire
            ref = None
            if col_ref:
                ref = self._first_str(row.get(col_ref))
            if (not ref) and col_ref_to:
                ref = self._first_str(row.get(col_ref_to))
            if (not ref) and col_ntra_ref:
                ref = self._first_str(row.get(col_ntra_ref))
            if (not ref) and col_ref_alt:
                ref = self._first_str(row.get(col_ref_alt))
            if not ref:
                lignes_ignorees.append({"ligne": idx + 2, "raison": "Référence manquante"})
                continue

            # ---- Datetime / sens
            day_val  = row.get(col_day)  if col_day  else None
            time_val = row.get(col_time) if col_time else None
            dt = self._combine_datetime(day_val, time_val)

            org = self._first_str(row.get(col_org)) if col_org else ""
            dst = self._first_str(row.get(col_dst)) if col_dst else ""
            type_hint = (self._first_str(row.get(col_ls)) or "").upper() if col_ls else ""
            if type_hint in {"L", "A", "ARRIVE", "ARRIVEE", "ARRIVAL"}:
                type_code = "A"
            elif type_hint in {"S", "D", "DEPART", "SALIDA", "DEPARTURE"}:
                type_code = "D"
            else:
                type_code = None

            vol = self._first_str(row.get(col_vol)) if col_vol else ""
            ville = self._first_str(row.get(col_city)) if col_city else ""

            # PAX
            pax_raw = self._first_str(row.get(col_pax)) if col_pax else None
            try:
                pax = int(float(pax_raw)) if pax_raw is not None else 0
            except Exception:
                pax = 0

            # ---- NOM DE RÉSERVATION (robuste)
            nom_resa = self._extract_nom_reservation(df, row)
            # si toujours vide, dernier fallback : l'ancienne colonne "name"
            if not nom_resa and col_name:
                nom_resa = self._first_str(row.get(col_name)) or ""

            # Tour opérateur
            tour_op  = self._first_str(row.get(col_to)) if col_to else ""

            # Hôtel (création si inconnu)
            hotel_nom = self._first_str(row.get(col_hotel)) if col_hotel else None
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
                # heuristique si non précisé
                if org and not dst:
                    heure_depart, num_vol_retour = dt, (vol or "")
                else:
                    heure_arrivee, num_vol_arrivee = dt, (vol or "")

            # Observations multi-colonnes consolidées
            obs_joined = self._collect_observations(df, row)

            # ---- Enregistrement base
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

            # ---- Payload UI (normalisé pour ton front)
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
                # >>> normalisation clients pour le tableau React
                "nom_reservation": obj.nom_reservation or "",
                "clients": obj.nom_reservation or "",   # <— clé supplémentaire pour le front
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


# =========================
# Import Véhicules (Excel simple)
# =========================

class ImporterVehiculesAPIView(APIView):
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated]

    HEADERS = {
        "immatriculation": ["IMMATRICULATION", "Immatriculation", "Plaque", "Matricule", "Plate"],
        "marque": ["MARQUE", "Marque", "Brand", "Fabricant"],
        "model": ["MODELE", "Modèle", "Model", "Type"],
        "capacite": ["CAPACITE", "Capacité", "Capacity", "Seats", "Places"]
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

# =========================
# Import Chauffeurs (Excel simple)
# =========================

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
                agence=agence, nom=nom, prenom=prenom or "",
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

# =========================
# Génération PDF OM “beau”
# =========================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ordre_mission_pdf(request, ordre_id):
    try:
        ordre = (
            OrdreMission.objects
            .select_related(
                "mission",
                "mission__premission",
                "mission__premission__agence",
                "mission__premission__dossier",
                "mission__premission__dossier__hotel",
                "vehicule",
                "chauffeur",
            )
            .get(id=ordre_id)
        )
    except OrdreMission.DoesNotExist:
        return HttpResponse("Ordre de mission non trouvé.", status=404)

    mission = ordre.mission
    pre = getattr(mission, "premission", None)
    agence = getattr(pre, "agence", None)
    dossier = getattr(pre, "dossier", None)
    vehicule = ordre.vehicule
    chauffeur = ordre.chauffeur

    def fmt_dt(dt, fmt="%d-%m-%Y %H:%M"):
        try:
            return dt.strftime(fmt) if dt else "—"
        except Exception:
            return "—"

    def first_nonempty(*vals, default="—"):
        for v in vals:
            if v is None:
                continue
            s = str(v).strip()
            if s:
                return s
        return default

    def get_attr_any(obj, names, default=None):
        for n in names:
            if hasattr(obj, n):
                v = getattr(obj, n)
                if v not in [None, ""]:
                    return v
        return default

    def infer_type(d):
        if not d:
            return None
        if getattr(d, "heure_depart", None) and not getattr(d, "heure_arrivee", None):
            return "D"
        if getattr(d, "heure_arrivee", None) and not getattr(d, "heure_depart", None):
            return "A"
        details = (mission.details or "").lower()
        if "arriv" in details:
            return "A"
        if "départ" in details or "depart" in details:
            return "D"
        return None

    type_code = infer_type(dossier) or "D"

    hotel_nom = first_nonempty(getattr(getattr(dossier, "hotel", None), "nom", None))
    ville = first_nonempty(getattr(dossier, "ville", None), hotel_nom)
    trajet_affiche = first_nonempty(getattr(pre, "trajet_prevu", None), ville)

    if type_code == "A":
        aeroport = first_nonempty(getattr(dossier, "aeroport_arrivee", None))
        pax = getattr(dossier, "nombre_personnes_arrivee", 0) or 0
        num_vol = first_nonempty(getattr(dossier, "num_vol_arrivee", None))
        h_vol = fmt_dt(getattr(dossier, "heure_arrivee", None), "%H:%M")
        heure_ligne = fmt_dt(getattr(dossier, "heure_arrivee", None), "%H:%M")
    else:
        aeroport = first_nonempty(getattr(dossier, "aeroport_depart", None))
        pax = getattr(dossier, "nombre_personnes_retour", 0) or 0
        num_vol = first_nonempty(getattr(dossier, "num_vol_retour", None))
        h_vol = fmt_dt(getattr(dossier, "heure_depart", None), "%H:%M")
        heure_ligne = fmt_dt(getattr(dossier, "heure_depart", None), "%H:%M")

    tour_operateur = first_nonempty(
        getattr(dossier, "tour_operateur", None),
        getattr(dossier, "nom_reservation", None),
        default="-",
    )

    km_depart = get_attr_any(ordre, ["km_depart", "kilometrage_depart", "km_debut", "km_start"])
    km_retour = get_attr_any(ordre, ["km_retour", "kilometrage_retour", "km_fin", "km_end"])
    try:
        km_total = (km_retour or 0) - (km_depart or 0) if (km_depart is not None and km_retour is not None) else None
    except Exception:
        km_total = None

    styles = getSampleStyleSheet()
    style_normal = styles["Normal"]
    style_small_right = ParagraphStyle("small_right", parent=styles["Normal"], alignment=TA_RIGHT, fontSize=10, leading=12)
    style_subtle = ParagraphStyle("subtle", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
    style_title = ParagraphStyle("title", parent=styles["Heading1"], alignment=TA_CENTER, fontSize=16, spaceAfter=8)
    style_h2 = ParagraphStyle("h2", parent=styles["Heading2"], alignment=TA_LEFT, fontSize=12, textColor=colors.HexColor("#111827"))

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="ordre_{ordre.reference}.pdf"'
    doc = SimpleDocTemplate(response, pagesize=A4, leftMargin=1.7*cm, rightMargin=1.7*cm, topMargin=1.4*cm, bottomMargin=1.4*cm)
    elements = []

    logo = Paragraph("", style_normal)
    try:
        logo_path = os.path.join(settings.BASE_DIR, "b2b", "static", "b2b", "logo_agence.png")
        if os.path.exists(logo_path):
            logo = Image(logo_path, width=3.2 * cm, height=3.2 * cm)
    except Exception:
        pass

    agence_nom = first_nonempty(getattr(agence, "nom", None))
    agence_adresse = first_nonempty(getattr(agence, "adresse", None))
    agence_tel = first_nonempty(getattr(agence, "telephone", None))
    agence_email = first_nonempty(getattr(agence, "email", None))

    agence_info = Paragraph(
        f"<b>{agence_nom}</b><br/>{agence_adresse}<br/>"
        f"Tél : {agence_tel} &nbsp;&nbsp;|&nbsp;&nbsp; Email : {agence_email}",
        style_small_right,
    )
    header = Table([[logo, agence_info]], colWidths=[6.5 * cm, 11.5 * cm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(header)
    elements.append(Spacer(1, 6))
    elements.append(Table([[""]], colWidths=[18*cm], style=TableStyle([("LINEBELOW", (0,0), (-1,0), 0.5, colors.HexColor("#e5e7eb"))])))
    elements.append(Spacer(1, 6))

    titre = "ARRIVÉE" if type_code == "A" else "DEPART"
    elements.append(Paragraph(titre, style_title))
    elements.append(Spacer(1, 6))

    l1 = [
        Paragraph(f"<b>OM N° :</b> {ordre.reference}", style_normal),
        Paragraph(f"<b>Date :</b> {fmt_dt(ordre.date_depart, '%d-%m-%Y')}", style_normal),
    ]
    l2 = [
        Paragraph(f"<b>{trajet_affiche}</b>", style_normal),
        Paragraph(f"<b>Aéroport :</b> {aeroport}", style_normal),
    ]
    vehicule = ordre.vehicule
    chauffeur = ordre.chauffeur
    veh_label = f"{getattr(vehicule, 'marque', '')} {getattr(vehicule, 'model', '')} ({getattr(vehicule, 'immatriculation', '')})"
    l3 = [
        Paragraph(f"<b>BUS :</b> {veh_label}", style_normal),
        Paragraph(f"<b>TOTAL :</b> {pax}", style_normal),
        Paragraph(f"<b>CHAUFFEUR :</b> {getattr(chauffeur,'nom','')} {getattr(chauffeur,'prenom','')}", style_normal),
    ]

    infos_tbl = Table([l1, l2], colWidths=[9 * cm, 9 * cm], style=TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    l3_tbl = Table([l3], colWidths=[7.2 * cm, 4.2 * cm, 6.6 * cm], style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    elements.append(infos_tbl)
    elements.append(l3_tbl)
    elements.append(Spacer(1, 10))

    table_data = [[
        Paragraph("<b>Heure</b>", style_normal),
        Paragraph("<b>Hôtel</b>", style_normal),
        Paragraph("<b>PAX</b>", style_normal),
        Paragraph("<b>N° VOL</b>", style_normal),
        Paragraph("<b>H. VOL</b>", style_normal),
        Paragraph("<b>Tour Opérateur</b>", style_normal),
    ]]
    table_data.append([heure_ligne, ville, str(pax), num_vol, h_vol, tour_operateur])

    passagers_tbl = Table(table_data, colWidths=[2.6*cm, 5.4*cm, 1.8*cm, 3.0*cm, 2.6*cm, 4.4*cm])
    passagers_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#111827")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 1), (2, -1), "CENTER"),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
    ]))
    elements.append(passagers_tbl)
    elements.append(Spacer(1, 10))

    km_rows = [[
        Paragraph("<b>Kilométrage départ</b>", style_normal),
        Paragraph(str(km_depart) if km_depart is not None else "—", style_normal),
        Paragraph("<b>Kilométrage retour</b>", style_normal),
        Paragraph(str(km_retour) if km_retour is not None else "—", style_normal),
        Paragraph("<b>Total</b>", style_normal),
        Paragraph(str(km_total) if km_total is not None else "—", style_normal),
    ]]
    km_tbl = Table(km_rows, colWidths=[4.2*cm, 2.0*cm, 4.2*cm, 2.0*cm, 2.0*cm, 2.6*cm])
    km_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#9ca3af")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    elements.append(km_tbl)
    elements.append(Spacer(1, 8))

    obs_pre = (getattr(pre, "remarques", "") or "").strip()
    obs_dossier = (
        getattr(dossier, "observation", None)
        or getattr(dossier, "observations", None)
        or getattr(dossier, "remarques", None)
        or getattr(dossier, "notes", None)
        or getattr(dossier, "commentaires", None)
        or ""
    )
    obs_dossier = (obs_dossier or "").strip()
    parts = []
    for p_ in (obs_pre, obs_dossier):
        if p_ and p_ not in parts:
            parts.append(p_)
    observations = " | ".join(parts) if parts else "—"

    elements.append(Paragraph("Observations :", style_h2))
    obs_box = Table([[Paragraph(observations if observations != "—" else "&nbsp;", style_subtle)]], colWidths=[18*cm])
    obs_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fcfcfd")),
        ("MINROWHEIGHT", (0, 0), (-1, -1), 2.2*cm),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    elements.append(obs_box)
    elements.append(Spacer(1, 12))

    sign_tbl = Table(
        [[Paragraph("Signature Chauffeur", style_subtle), Paragraph("Cachet & Signature Responsable", style_subtle)]],
        colWidths=[9*cm, 9*cm]
    )
    sign_tbl.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 28),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LINEABOVE", (0, 0), (0, 0), 0.4, colors.HexColor("#9ca3af")),
        ("LINEABOVE", (1, 0), (1, 0), 0.4, colors.HexColor("#9ca3af")),
    ]))
    elements.append(sign_tbl)

    doc.build(elements)
    return response

# =========================
# Création Fiche Mouvement & Missions
# =========================

class CreerFicheMouvementAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def _to_aware(self, dt):
        if not dt:
            return None
        return timezone.make_aware(dt) if timezone.is_naive(dt) else dt

    def _parse_dt(self, s):
        if not s:
            return None
        dt = parse_datetime(s)
        if not dt:
            try:
                dt = datetime.fromisoformat(s)
            except Exception:
                dt = None
        return self._to_aware(dt) if dt else None

    def _infer_type(self, d):
        if getattr(d, "heure_depart", None) and not getattr(d, "heure_arrivee", None):
            return "D"
        if getattr(d, "heure_arrivee", None) and not getattr(d, "heure_depart", None):
            return "A"
        return None

    def _unique_or_none(self, iterable):
        s = {x for x in iterable if x}
        return list(s)[0] if len(s) == 1 else None

    def _bounds_from_dossiers(self, dossiers, type_code, given_date=None):
        if type_code == "A":
            times = [d.heure_arrivee for d in dossiers if d.heure_arrivee]
        else:
            times = [d.heure_depart for d in dossiers if d.heure_depart]
        times = [self._to_aware(t) for t in times if t]
        if times:
            return (min(times), max(times))
        if given_date:
            d = parse_date(given_date)
            if d:
                start = timezone.make_aware(datetime.combine(d, time_cls.min))
                end = timezone.make_aware(datetime.combine(d, time_cls.max))
                return (start, end)
        return (None, None)

    @transaction.atomic
    def post(self, request):
        data = request.data
        dossier_ids = data.get("dossier_ids", []) or []
        type_code = data.get("type")
        date_key = data.get("date")
        aeroport = data.get("aeroport")
        dossier_refs = data.get("dossier_references", []) or []
        trajet = data.get("trajet")
        date_debut_str = data.get("date_debut")
        date_fin_str = data.get("date_fin")
        vehicule_id = data.get("vehicule_id")
        chauffeur_id = data.get("chauffeur_id")

        role = _user_role(request.user)
        if role not in ("superadmin", "adminagence"):
            raise PermissionDenied("Accès refusé.")

        qs = Dossier.objects.all()
        if role == "adminagence":
            qs = qs.filter(agence=_user_agence(request.user))
        if dossier_ids:
            qs = qs.filter(id__in=dossier_ids)
        if dossier_refs:
            qs = qs | Dossier.objects.filter(reference__in=dossier_refs)
        dossiers = list(qs.distinct())
        if not dossiers:
            return Response({"error": "Aucun dossier valide trouvé."}, status=400)

        if not type_code:
            inferred = {self._infer_type(d) for d in dossiers}
            inferred.discard(None)
            if len(inferred) == 1:
                type_code = inferred.pop()
            else:
                return Response({"error": "Impossible de déduire un type unique (A/D)."}, status=400)
        else:
            type_code = str(type_code).strip().upper()
            if type_code not in ("A", "D"):
                return Response({"error": "Type invalide (A/D)."}, status=400)

        if not aeroport:
            aeroport = self._unique_or_none([d.aeroport_arrivee for d in dossiers]) if type_code == "A" else self._unique_or_none([d.aeroport_depart for d in dossiers])

        date_debut = self._parse_dt(date_debut_str) if date_debut_str else None
        date_fin = self._parse_dt(date_fin_str) if date_fin_str else None
        if not date_debut or not date_fin:
            calc_start, calc_end = self._bounds_from_dossiers(dossiers, type_code, given_date=date_key)
            date_debut = date_debut or calc_start
            date_fin = date_fin or calc_end
        if not date_debut or not date_fin:
            return Response({"error": "Aucune plage temporelle exploitable."}, status=400)

        vehicule = get_object_or_404(Vehicule, id=vehicule_id) if vehicule_id else None
        chauffeur = get_object_or_404(Chauffeur, id=chauffeur_id) if chauffeur_id else None
        if vehicule:
            _ensure_same_agence_or_superadmin(request, vehicule.agence)
        if chauffeur:
            _ensure_same_agence_or_superadmin(request, chauffeur.agence)

        obs_list = data.get("observations") or []  # [{ref, obs}]
        obs_by_hotel = data.get("observations_par_hotel") or {}  # {hotel: [{ref,pax,obs}]}

        def _fmt_line(ref, txt, pax=None):
            ref_s = str(ref).strip() if ref is not None else "—"
            pax_s = f" ({pax} pax)" if pax not in (None, "", 0) else ""
            txt_s = str(txt).strip()
            return f"[{ref_s}{pax_s}] {txt_s}" if txt_s else ""

        obs_lines = []
        for o in obs_list:
            line = _fmt_line(o.get("ref"), o.get("obs"), None)
            if line:
                obs_lines.append(line)
        for hotel, items in (obs_by_hotel or {}).items():
            hotel = (hotel or "").strip() or "(Sans hôtel)"
            hotel_lines = []
            for it in items or []:
                l = _fmt_line(it.get("ref"), it.get("obs"), it.get("pax"))
                if l:
                    hotel_lines.append(l)
            if hotel_lines:
                obs_lines.append(f"{hotel}: " + " | ".join(hotel_lines))

        remarques_text = " ; ".join(obs_lines).strip()

        created_premissions, created_missions, created_ordres = [], [], []

        for dossier in dossiers:
            if role == "adminagence":
                _ensure_same_agence_or_superadmin(request, dossier.agence)
            premission = PreMission.objects.create(
                reference=generate_unique_reference("PRE", PreMission),
                agence=dossier.agence,
                dossier=dossier,
                trajet_prevu=trajet or aeroport or "",
                remarques=remarques_text or "",
            )
            created_premissions.append(premission.reference)

            mission = premission.creer_mission(
                date_debut=date_debut,
                date_fin=date_fin,
                details=f"Mission {('Arrivée' if type_code=='A' else 'Départ')} – Dossier {dossier.reference} – APT: {aeroport or '-'}",
            )
            created_missions.append(getattr(mission, "reference", None))

            if vehicule and chauffeur:
                ordre = mission.creer_ordre_mission(
                    vehicule=vehicule,
                    chauffeur=chauffeur,
                    date_depart=mission.date_debut,
                    date_retour=mission.date_fin,
                    trajet=mission.premission.trajet_prevu or mission.premission.dossier.ville
                )
                created_ordres.append(getattr(ordre, "reference", None))

        return Response(
            {
                "message": "Fiches de mouvement / missions créées avec succès" + ("" if not created_ordres else " (ordres de mission inclus)"),
                "type": type_code,
                "aeroport": aeroport,
                "date_debut": date_debut.isoformat(),
                "date_fin": date_fin.isoformat(),
                "premissions": created_premissions,
                "missions": [r for r in created_missions if r],
                "ordres_mission": [r for r in created_ordres if r],
                "count": {
                    "premissions": len(created_premissions),
                    "missions": len([r for r in created_missions if r]),
                    "ordres": len([r for r in created_ordres if r]),
                },
            },
            status=201,
        )

# =========================
# Liste Fiches Mouvement (items “plats” côté UI)
# =========================
class FichesMouvementListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def _infer_type(self, dossier):
        if getattr(dossier, "heure_depart", None) and not getattr(dossier, "heure_arrivee", None):
            return "D"
        if getattr(dossier, "heure_arrivee", None) and not getattr(dossier, "heure_depart", None):
            return "A"
        return None

    def _display_reference(self, mission):
        try:
            dt = getattr(mission, "date_debut", None)
            if dt:
                d = dt.date()
                return f"M_{d.isoformat()}"
        except Exception:
            pass
        return getattr(mission, "reference", None)

    def _first_nonempty(self, *vals):
        for v in vals:
            if v is None:
                continue
            s = str(v).strip()
            if s and s.lower() not in {"nan", "none", "null", "-"}:
                return s
        return None

    def _format_clients(self, dossier):
        """
        Normalise l'affichage des clients à partir du dossier.
        Source principale : dossier.nom_reservation
        Fallbacks (si jamais tu ajoutes ces champs plus tard) : nom, name, titulaire, titular, clients
        """
        if not dossier:
            return ""
        raw = self._first_nonempty(
            getattr(dossier, "nom_reservation", None),
            getattr(dossier, "nom", None),
            getattr(dossier, "name", None),
            getattr(dossier, "titulaire", None),
            getattr(dossier, "titular", None),
            getattr(dossier, "clients", None),
        )
        if not raw:
            return ""
        # nettoyage léger (espaces multiples, retours ligne)
        raw = re.sub(r"\s+", " ", str(raw)).strip()
        return raw

    def get(self, request):
        qs = (
            Mission.objects.all()
            .select_related("premission", "premission__dossier", "premission__dossier__hotel")
            .prefetch_related(
                Prefetch(
                    "ordres_mission",
                    queryset=OrdreMission.objects.select_related("vehicule", "chauffeur")
                )
            )
        )

        role = _user_role(request.user)
        if role == "adminagence":
            qs = qs.filter(premission__agence=_user_agence(request.user))
        elif role != "superadmin":
            return Response({"results": [], "count": 0, "page": 1, "page_size": 20, "total_pages": 0}, status=200)

        search = (request.query_params.get("search") or "").strip()
        type_code = (request.query_params.get("type") or "").strip().upper()
        aeroport_filter = (request.query_params.get("aeroport") or "").strip().upper()
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))

        if search:
            qs = qs.filter(
                Q(reference__icontains=search)
                | Q(premission__dossier__reference__icontains=search)
                | Q(details__icontains=search)
                | Q(ordres_mission__vehicule__immatriculation__icontains=search)
                | Q(ordres_mission__chauffeur__nom__icontains=search)
                | Q(ordres_mission__chauffeur__prenom__icontains=search)
                | Q(premission__dossier__nom_reservation__icontains=search)  # <— recherche aussi par client
            ).distinct()

        if date_from:
            try:
                df = timezone.make_aware(datetime.fromisoformat(date_from + "T00:00:00"))
                qs = qs.filter(date_debut__gte=df)
            except Exception:
                pass
        if date_to:
            try:
                dt_ = timezone.make_aware(datetime.fromisoformat(date_to + "T23:59:59.999999"))
                qs = qs.filter(date_fin__lte=dt_)
            except Exception:
                pass

        rows = []
        for m in qs.order_by("-date_debut"):
            pre = getattr(m, "premission", None)
            dossier = getattr(pre, "dossier", None) if pre else None
            ordre = m.ordres_mission.all().first()

            t = self._infer_type(dossier) if dossier else None
            apt = dossier.aeroport_arrivee if (dossier and t == "A") else dossier.aeroport_depart if (dossier and t == "D") else None

            if type_code in ("A", "D") and t != type_code:
                continue
            if aeroport_filter and (apt or "").strip().upper() != aeroport_filter:
                continue

            ville = getattr(dossier, "ville", "") if dossier else ""
            hotel_name = getattr(getattr(dossier, "hotel", None), "nom", "") if dossier else ""
            ref_display = self._display_reference(m)
            obs = (getattr(dossier, "observation", "") or "").strip()
            clients_disp = self._format_clients(dossier)  # <— NOUVEAU

            rows.append(
                {
                    "id": getattr(m, "id", None),
                    "reference": ref_display,
                    "type": t,
                    "aeroport": apt,
                    "trajet": ville,
                    "ville": ville,
                    "hotel": hotel_name,
                    "date_debut": getattr(m, "date_debut", None),
                    "date_fin": getattr(m, "date_fin", None),
                    "vehicule": getattr(getattr(ordre, "vehicule", None), "immatriculation", None) if ordre else None,
                    "chauffeur": (
                        f"{getattr(getattr(ordre, 'chauffeur', None), 'prenom', '')} {getattr(getattr(ordre, 'chauffeur', None), 'nom', '')}".strip()
                        if ordre and getattr(ordre, "chauffeur", None)
                        else None
                    ),
                    "dossier_reference": getattr(dossier, "reference", None) if dossier else None,
                    "pax": (
                        getattr(dossier, "nombre_personnes_arrivee", None) if t == "A"
                        else getattr(dossier, "nombre_personnes_retour", None)
                    ) if dossier else None,
                    "created_at": getattr(pre, "date_creation", None) if pre else None,
                    "observation": obs,
                    "clients": clients_disp,  # <— NOUVEAU CHAMP POUR LE FRONT
                }
            )

        paginator = Paginator(rows, page_size)
        page_obj = paginator.get_page(page)
        return Response(
            {
                "results": list(page_obj.object_list),
                "count": paginator.count,
                "page": page_obj.number,
                "page_size": page_size,
                "total_pages": paginator.num_pages,
            },
            status=200,
        )


# =========================
# Fiche Mouvement CRUD
# =========================

class FicheMouvementViewSet(viewsets.ModelViewSet):
    serializer_class = FicheMouvementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FicheMouvement.objects.all().select_related('agence', 'created_by').prefetch_related('items__dossier')
        role = _user_role(self.request.user)
        agence_id = self.request.query_params.get('agence')
        if role == 'superadmin':
            return qs if not agence_id else qs.filter(agence_id=agence_id)
        if role == 'adminagence':
            return qs.filter(agence=_user_agence(self.request.user))
        return FicheMouvement.objects.none()

    def _validate_dossiers_same_agence(self, agence, dossier_ids):
        if not dossier_ids:
            return []
        dossiers = list(Dossier.objects.filter(id__in=dossier_ids))
        if len(dossiers) != len(set(dossier_ids)):
            raise PermissionDenied("Certains dossiers sont introuvables.")
        for d in dossiers:
            if d.agence_id != getattr(agence, 'id', None):
                raise PermissionDenied(f"Dossier {d.reference} appartient à une autre agence.")
        return dossiers

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        role = _user_role(request.user)
        user_agence = _user_agence(request.user)

        body_agence_id = request.data.get('agence') or request.query_params.get('agence')
        if role == 'superadmin':
            if not body_agence_id:
                return Response({"error": "agence requise pour superadmin."}, status=400)
            agence = get_object_or_404(AgenceVoyage, id=body_agence_id)
        else:
            if not user_agence:
                raise PermissionDenied("Aucune agence associée.")
            agence = user_agence

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        dossier_ids = serializer.validated_data.pop('dossier_ids', [])
        dossiers = self._validate_dossiers_same_agence(agence, dossier_ids)

        fiche = FicheMouvement.objects.create(
            agence=agence,
            name=serializer.validated_data.get('name', ''),
            type=serializer.validated_data['type'],
            date=serializer.validated_data['date'],
            aeroport=serializer.validated_data.get('aeroport', ''),
            created_by=request.user,
        )

        for d in dossiers:
            FicheMouvementItem.objects.create(fiche=fiche, dossier=d)

        out = self.get_serializer(fiche)
        headers = self.get_success_headers(out.data)
        return Response(out.data, status=201, headers=headers)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        fiche = self.get_object()
        _ensure_same_agence_or_superadmin(request, fiche.agence)
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(fiche, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        dossier_ids = serializer.validated_data.pop('dossier_ids', None)

        for f in ['name', 'type', 'date', 'aeroport']:
            if f in serializer.validated_data:
                setattr(fiche, f, serializer.validated_data[f])
        fiche.save()

        if dossier_ids is not None:
            dossiers = self._validate_dossiers_same_agence(fiche.agence, dossier_ids)
            FicheMouvementItem.objects.filter(fiche=fiche).delete()
            for d in dossiers:
                FicheMouvementItem.objects.create(fiche=fiche, dossier=d)

        return Response(self.get_serializer(fiche).data)

    def destroy(self, request, *args, **kwargs):
        fiche = self.get_object()
        _ensure_same_agence_or_superadmin(request, fiche.agence)
        return super().destroy(request, *args, **kwargs)

class FicheMouvementItemViewSet(viewsets.ModelViewSet):
    serializer_class = FicheMouvementItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FicheMouvementItem.objects.select_related('fiche', 'fiche__agence', 'dossier')
        role = _user_role(self.request.user)
        if role == 'superadmin':
            return qs.all()
        if role == 'adminagence':
            return qs.filter(fiche__agence=_user_agence(self.request.user))
        return FicheMouvementItem.objects.none()

    def perform_create(self, serializer):
        fiche = serializer.validated_data.get('fiche')
        _ensure_same_agence_or_superadmin(self.request, fiche.agence)
        serializer.save()

    def perform_update(self, serializer):
        fiche = serializer.instance.fiche
        _ensure_same_agence_or_superadmin(self.request, fiche.agence)
        serializer.save()

    def perform_destroy(self, instance):
        _ensure_same_agence_or_superadmin(self.request, instance.fiche.agence)
        instance.delete()

# =========================
# Public “inter-agences” (AllowAny) — sans VehicleOffer
# =========================

def _overlap(qs, start, end, start_field="date_depart", end_field="date_retour"):
    if not start or not end:
        return qs
    cond = Q(**{f"{end_field}__gt": start}) & Q(**{f"{start_field}__lt": end})
    return qs.filter(cond)

def _parse_dt_param(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
    except Exception:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt

class PublicRentoutListAPIView(APIView):
    permission_classes = [AllowAny]
    def get(self, request):
        exclude_agence = request.query_params.get("exclude_agence")
        date_from = _parse_dt_param(request.query_params.get("date_from"))
        date_to   = _parse_dt_param(request.query_params.get("date_to"))
        type_veh  = (request.query_params.get("type") or "").strip().lower()
        min_cap   = request.query_params.get("min_capacity")

        qs = Vehicule.objects.select_related("agence").all()
        if type_veh:
            qs = qs.filter(type__iexact=type_veh)
        try:
            if min_cap is not None:
                qs = qs.filter(capacite__gte=int(min_cap))
        except Exception:
            pass
        if exclude_agence:
            qs = qs.exclude(agence_id=exclude_agence)

        engaged_vehicle_ids = set(
            _overlap(OrdreMission.objects.all(), date_from, date_to)
            .values_list("vehicule_id", flat=True)
        )
        qs = qs.exclude(id__in=[vid for vid in engaged_vehicle_ids if vid])

        data = [{
            "id": v.id, "type": v.type, "marque": v.marque, "model": v.model,
            "capacite": v.capacite, "immatriculation": v.immatriculation,
            "agence_id": v.agence_id, "agence_nom": getattr(v.agence, "nom", "")
        } for v in qs]

        return Response({"rentout": data}, status=200)

class PublicRideshareListAPIView(APIView):
    permission_classes = [AllowAny]

    def _infer_type(self, dossier):
        if getattr(dossier, "heure_depart", None) and not getattr(dossier, "heure_arrivee", None):
            return "D"
        if getattr(dossier, "heure_arrivee", None) and not getattr(dossier, "heure_depart", None):
            return "A"
        return None

    def _mission_pax(self, mission):
        pre = getattr(mission, "premission", None)
        dossier = getattr(pre, "dossier", None)
        if not dossier:
            return 0
        t = self._infer_type(dossier)
        if t == "A":
            return int(getattr(dossier, "nombre_personnes_arrivee", 0) or 0)
        if t == "D":
            return int(getattr(dossier, "nombre_personnes_retour", 0) or 0)
        a = int(getattr(dossier, "nombre_personnes_arrivee", 0) or 0)
        d = int(getattr(dossier, "nombre_personnes_retour", 0) or 0)
        return max(a, d)

    def get(self, request):
        exclude_agence = request.query_params.get("exclude_agence")
        date_from = _parse_dt_param(request.query_params.get("date_from"))
        date_to   = _parse_dt_param(request.query_params.get("date_to"))
        destination = (request.query_params.get("destination") or "").strip()
        origin      = (request.query_params.get("origin") or "").strip()

        om_qs = (
            OrdreMission.objects
            .select_related(
                "vehicule", "chauffeur",
                "mission", "mission__premission", "mission__premission__agence", "mission__premission__dossier",
            )
        )
        om_qs = _overlap(om_qs, date_from, date_to)

        data = []
        for om in om_qs:
            v = om.vehicule
            ch = om.chauffeur
            m = om.mission
            pre = getattr(m, "premission", None)
            agence = getattr(pre, "agence", None)
            dossier = getattr(pre, "dossier", None)
            if exclude_agence and getattr(agence, "id", None) and str(agence.id) == str(exclude_agence):
                continue
            if not v:
                continue
            pax = self._mission_pax(m)
            cap = int(getattr(v, "capacite", 0) or 0)
            places_dispo = max(0, cap - pax)
            if places_dispo <= 0:
                continue
            traj = (om.trajet or "").strip()
            if destination and destination.lower() not in traj.lower():
                continue
            if origin:
                ok_origin = False
                for cand in [getattr(dossier, "ville", ""), getattr(dossier, "aeroport_depart", ""), getattr(dossier, "aeroport_arrivee", "")]:
                    if cand and origin.lower() in str(cand).lower():
                        ok_origin = True
                        break
                if not ok_origin:
                    continue

            data.append({
                "ordre_id": om.id,
                "mission_id": getattr(m, "id", None),
                "vehicule_id": getattr(v, "id", None),
                "vehicule": {
                    "type": v.type, "marque": v.marque, "model": v.model,
                    "capacite": v.capacite, "immatriculation": v.immatriculation,
                },
                "chauffeur": {
                    "id": getattr(ch, "id", None),
                    "nom": getattr(ch, "nom", ""),
                    "prenom": getattr(ch, "prenom", ""),
                } if ch else None,
                "agence_id": getattr(agence, "id", None),
                "agence_nom": getattr(agence, "nom", ""),
                "trajet": traj,
                "date_depart": getattr(om, "date_depart", None),
                "date_retour": getattr(om, "date_retour", None),
                "places_disponibles": places_dispo,
                "pax_deja_reserves": pax,
            })

        data.sort(key=lambda x: (-x["places_disponibles"], x["date_depart"] or timezone.now()))
        return Response({"rideshare": data}, status=200)

# =========================
# LanguageMapping (list)
# =========================

class LanguageMappingListView(ListAPIView):
    queryset = LanguageMapping.objects.all()
    serializer_class = LanguageMappingSerializer
    permission_classes = [AllowAny]


from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q

class PublicResourceSearchAPIView(APIView):
    """
    Point d’entrée public combiné :
      - rentout : flotte disponible pour location (pas de date/destination) ; 
                  on renvoie simplement les véhicules éligibles et leurs modes de location possibles.
      - rideshare : ordres de mission avec places dispo, filtrables par période/origine/destination.

    Query params pris en compte :
      Commun :
        - type (ex: bus, van...), min_capacity, exclude_agence

      Rideshare uniquement :
        - date_debut, date_fin (ISO: 2022-08-27T01:25)
        - origin, destination
    """
    permission_classes = [AllowAny]

    def get(self, request):
        # -------------------- filtres communs
        type_veh       = (request.query_params.get("type") or "").strip()
        min_cap_param  = request.query_params.get("min_capacity")
        exclude_agence = request.query_params.get("exclude_agence")

        # -------------------- RENTOUT (pas de dates, pas de destination)
        v_qs = Vehicule.objects.select_related("agence").all()
        if type_veh:
            v_qs = v_qs.filter(type__iexact=type_veh)
        if exclude_agence:
            v_qs = v_qs.exclude(agence_id=exclude_agence)
        try:
            if min_cap_param is not None:
                v_qs = v_qs.filter(capacite__gte=int(min_cap_param))
        except Exception:
            pass

        rentout = []
        for v in v_qs:
            rentout.append({
                "id": v.id,
                "type": v.type,
                "marque": v.marque,
                "model": v.model,
                "capacite": v.capacite,
                "immatriculation": v.immatriculation,
                "agence_id": v.agence_id,
                "agence_nom": getattr(v.agence, "nom", ""),
                # 👉 modes de location proposés (pas de date précise ici)
                "modes_location": ["demi_journee", "journee"],
            })

        # -------------------- RIDESHARE (garde les dates & destination)
        date_from   = _parse_dt_param(request.query_params.get("date_debut"))
        date_to     = _parse_dt_param(request.query_params.get("date_fin"))
        origin      = (request.query_params.get("origin") or "").strip()
        destination = (request.query_params.get("destination") or "").strip()

        def _infer_type(dossier):
            if getattr(dossier, "heure_depart", None) and not getattr(dossier, "heure_arrivee", None):
                return "D"
            if getattr(dossier, "heure_arrivee", None) and not getattr(dossier, "heure_depart", None):
                return "A"
            return None

        def _mission_pax(mission):
            pre = getattr(mission, "premission", None)
            dossier = getattr(pre, "dossier", None)
            if not dossier:
                return 0
            t = _infer_type(dossier)
            if t == "A":
                return int(getattr(dossier, "nombre_personnes_arrivee", 0) or 0)
            if t == "D":
                return int(getattr(dossier, "nombre_personnes_retour", 0) or 0)
            a = int(getattr(dossier, "nombre_personnes_arrivee", 0) or 0)
            d = int(getattr(dossier, "nombre_personnes_retour", 0) or 0)
            return max(a, d)

        om_qs = (
            OrdreMission.objects
            .select_related(
                "vehicule", "chauffeur",
                "mission", "mission__premission", "mission__premission__agence", "mission__premission__dossier",
            )
        )
        # filtres période appliqués UNIQUEMENT au rideshare
        om_qs = _overlap(om_qs, date_from, date_to)

        rideshare = []
        for om in om_qs:
            v = om.vehicule
            ch = om.chauffeur
            m = om.mission
            pre = getattr(m, "premission", None)
            agence = getattr(pre, "agence", None)
            dossier = getattr(pre, "dossier", None)
            if not v:
                continue
            if exclude_agence and getattr(agence, "id", None) and str(agence.id) == str(exclude_agence):
                continue

            pax = _mission_pax(m)
            cap = int(getattr(v, "capacite", 0) or 0)
            dispo = max(0, cap - pax)
            if min_cap_param is not None:
                try:
                    if dispo < int(min_cap_param):
                        continue
                except Exception:
                    pass
            if dispo <= 0:
                continue

            # destination/origin seulement pour rideshare
            traj = (om.trajet or "").strip()
            if destination and destination.lower() not in traj.lower():
                continue
            if origin:
                ok_origin = False
                for cand in [
                    getattr(dossier, "ville", ""),
                    getattr(dossier, "aeroport_depart", ""),
                    getattr(dossier, "aeroport_arrivee", ""),
                ]:
                    if cand and origin.lower() in str(cand).lower():
                        ok_origin = True
                        break
                if not ok_origin:
                    continue

            rideshare.append({
                "ordre_id": om.id,
                "mission_id": getattr(m, "id", None),
                "vehicule_id": getattr(v, "id", None),
                "vehicule": {
                    "type": v.type, "marque": v.marque, "model": v.model,
                    "capacite": v.capacite, "immatriculation": v.immatriculation,
                },
                "chauffeur": {
                    "id": getattr(ch, "id", None),
                    "nom": getattr(ch, "nom", ""),
                    "prenom": getattr(ch, "prenom", ""),
                } if ch else None,
                "agence_id": getattr(agence, "id", None),
                "agence_nom": getattr(agence, "nom", ""),
                "trajet": traj,
                "date_depart": getattr(om, "date_depart", None),
                "date_retour": getattr(om, "date_retour", None),
                "places_disponibles": dispo,
                "pax_deja_reserves": pax,
            })

        rideshare.sort(key=lambda x: (-(x["places_disponibles"]), x["date_depart"] or timezone.now()))
        return Response({"rentout": rentout, "rideshare": rideshare}, status=200)

