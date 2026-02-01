# backend1/apps/views/missions.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime, timedelta, time as dtime
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework.decorators import action, api_view, permission_classes as drf_permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.models import Mission, MissionRessource, OrdreMission, Vehicule, Chauffeur
from apps.serializers import MissionSerializer
from apps.views.helpers import _user_role
from .helpers import _ensure_same_agence_or_superadmin
from .mission_pdf import build_om_pdf_response


# ============================================================
# Permissions helpers
# ============================================================

def _user_agence_id(user):
    prof = getattr(user, "profile", None)
    return getattr(prof, "agence_id", None)


def _ensure_can_manage_om(request, mission: Mission):
    """
    Autorise la gestion OM (replace/cancel) pour :
      - superadmin : OK
      - autres : uniquement si l'utilisateur est dans la même agence que la mission
    """
    role = _user_role(request.user)
    if role == "superadmin":
        return

    agence_user_id = _user_agence_id(request.user)
    if not agence_user_id:
        raise PermissionDenied("Aucune agence associée à l'utilisateur.")

    if agence_user_id != mission.agence_id:
        raise PermissionDenied("Vous n'avez pas le droit de modifier cette mission.")


# ============================================================
# OM versionné helpers
# ============================================================

def _get_latest_ordre(mission: Mission) -> OrdreMission | None:
    return (
        OrdreMission.objects
        .filter(mission=mission)
        .order_by("-version", "-created_at", "-id")
        .first()
    )


def _compute_reference_for_ordre(ordre: OrdreMission) -> str:
    """
    Compatible si ton modèle utilise compute_reference() ou _compute_reference().
    """
    if hasattr(ordre, "compute_reference") and callable(getattr(ordre, "compute_reference")):
        return ordre.compute_reference()
    if hasattr(ordre, "_compute_reference") and callable(getattr(ordre, "_compute_reference")):
        return ordre._compute_reference()

    base = (getattr(ordre, "base_reference", None) or "").strip() or (getattr(ordre, "reference", None) or "").strip()
    v = int(getattr(ordre, "version", None) or 1)
    if v <= 1:
        return base or "OM"
    return f"{base}-V{v}"


def _ensure_first_ordre(mission: Mission, request=None) -> OrdreMission:
    """
    Crée V1 si aucun OM n'existe.
    """
    ordre = _get_latest_ordre(mission)
    if ordre:
        return ordre

    ordre = OrdreMission(
        mission=mission,
        version=1,
        created_by=getattr(request, "user", None),
    )
    ordre.save()
    return ordre


# ============================================================
# PDF cache helpers (par version)
# ============================================================

def _response_pdf_to_bytes(resp: HttpResponse) -> bytes:
    """
    Convertit une HttpResponse/FileResponse (application/pdf) en bytes.
    build_om_pdf_response retourne souvent un FileResponse (streaming).
    """
    try:
        return bytes(resp.content)
    except Exception:
        buf = BytesIO()
        for chunk in resp.streaming_content:
            buf.write(chunk)
        return buf.getvalue()


def _invalidate_cached_pdf(ordre: OrdreMission) -> None:
    """
    Invalide le PDF UNIQUEMENT pour cette version.
    """
    if ordre.fichier_pdf and ordre.fichier_pdf.name:
        try:
            ordre.fichier_pdf.delete(save=False)
        except Exception:
            pass
    ordre.fichier_pdf = None
    ordre.save(update_fields=["fichier_pdf"])


def _ensure_pdf_cached_for_ordre(
    ordre: OrdreMission,
    mission: Mission,
    request=None,
    *,
    force_regen: bool = False,
) -> OrdreMission:
    """
    Cache PDF par version :
    - si fichier_pdf existe => sert
    - sinon => génère et stocke dans cette version
    ✅ garantit ordre.reference avant génération
    """
    if force_regen:
        _invalidate_cached_pdf(ordre)

    # ✅ assure que la référence est bien renseignée
    if not getattr(ordre, "reference", None):
        ordre.reference = _compute_reference_for_ordre(ordre)
        ordre.save(update_fields=["reference"])

    if ordre.fichier_pdf and ordre.fichier_pdf.name:
        return ordre

    # ✅ IMPORTANT : passer ordre pour afficher OM N° dans le PDF
    resp = build_om_pdf_response(mission, request=request, ordre=ordre)
    pdf_bytes = _response_pdf_to_bytes(resp)

    filename = f"OM_{ordre.reference}.pdf"
    ordre.fichier_pdf.save(filename, ContentFile(pdf_bytes), save=True)
    return ordre


def _serve_ordre_pdf(ordre: OrdreMission) -> FileResponse:
    return FileResponse(
        ordre.fichier_pdf.open("rb"),
        content_type="application/pdf",
        filename=f"OM_{ordre.reference}.pdf",
    )


def _get_mission_for_pdf(pk: int) -> Mission:
    return (
        Mission.objects
        .select_related("vehicule", "chauffeur", "agence")
        .prefetch_related("fiches", "fiches__dossiers", "fiches__hotel")
        .get(pk=pk)
    )


# ============================================================
# ViewSet
# ============================================================

class MissionViewSet(ReadOnlyModelViewSet):
    """
    - list:          GET  /api/missions/
    - retrieve:      GET  /api/missions/<id>/
    - pdf:           GET  /api/missions/<id>/pdf/?version=2 (optionnel)
    - generate-om:   POST /api/missions/<id>/generate-om/
    - cancel-om:     POST /api/missions/<id>/cancel-om/
    - replace-om:    POST /api/missions/<id>/replace-om/
    """
    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        req = self.request
        qs = Mission.objects.all()

        # --- Agence ---
        agence_id = req.query_params.get("agence")
        if agence_id:
            _ensure_same_agence_or_superadmin(req, int(agence_id))
            qs = qs.filter(agence_id=agence_id)
        else:
            prof = getattr(req.user, "profile", None)
            if getattr(prof, "agence_id", None):
                qs = qs.filter(agence_id=prof.agence_id)

        # --- Type ---
        m_type = req.query_params.get("type")
        if m_type:
            qs = qs.filter(type=m_type)

        # --- Bornes date ---
        date_min = req.query_params.get("date_min") or req.query_params.get("date_from")
        date_max = req.query_params.get("date_max") or req.query_params.get("date_to")
        if date_min:
            qs = qs.filter(date__gte=date_min)
        if date_max:
            qs = qs.filter(date__lte=date_max)

        # --- Search ---
        search = (req.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(numero_vol__icontains=search)
                | Q(aeroport__icontains=search)
                | Q(reference__icontains=search)
            ).distinct()

        ordering = req.query_params.get("ordering")
        if ordering in ("created_at", "-created_at", "date", "-date"):
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-created_at")

        return qs

    # -------------------------
    # PDF endpoint (toujours le dernier, ou une version via ?version=)
    # -------------------------
    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        mission = _get_mission_for_pdf(int(pk))
        _ensure_same_agence_or_superadmin(request, mission.agence_id)

        version = request.query_params.get("version")
        if version:
            ordre = OrdreMission.objects.filter(mission=mission, version=int(version)).first()
            if not ordre:
                return Response({"detail": "Version OM introuvable."}, status=404)
        else:
            ordre = _ensure_first_ordre(mission, request=request)
            ordre = _get_latest_ordre(mission) or ordre

        ordre = _ensure_pdf_cached_for_ordre(ordre, mission, request=request)
        return _serve_ordre_pdf(ordre)

    # -------------------------
    # Generate OM (ne crée pas de nouvelle version si déjà existante)
    # -------------------------
    @action(detail=True, methods=["post"], url_path="generate-om")
    @transaction.atomic
    def generate_om(self, request, pk=None):
        """
        POST /api/missions/<id>/generate-om/
        Body: { "vehicule": <id>, "chauffeur": <id> }

        ✅ ne crée pas de nouvelle version si OM existe déjà
        ✅ sert le dernier OM existant
        ✅ regen PDF du dernier seulement si ressources changent ET pdf existant
        """
        mission = self.get_object()
        _ensure_same_agence_or_superadmin(request, mission.agence_id)

        vehicule_id = request.data.get("vehicule")
        chauffeur_id = request.data.get("chauffeur")

        vehicule = get_object_or_404(Vehicule, id=vehicule_id) if vehicule_id else None
        chauffeur = get_object_or_404(Chauffeur, id=chauffeur_id) if chauffeur_id else None

        if vehicule and vehicule.agence_id != mission.agence_id:
            return Response({"detail": "Véhicule d'une autre agence."}, status=400)
        if chauffeur and chauffeur.agence_id != mission.agence_id:
            return Response({"detail": "Chauffeur d'une autre agence."}, status=400)

        old_v_id = mission.vehicule_id
        old_c_id = mission.chauffeur_id
        changed = (old_v_id != (vehicule.id if vehicule else None)) or (old_c_id != (chauffeur.id if chauffeur else None))

        mission.vehicule = vehicule
        mission.chauffeur = chauffeur
        mission.save(update_fields=["vehicule", "chauffeur"])

        # Fenêtre + lieux
        fiches = list(mission.fiches.filter(is_deleted=False))
        if fiches:
            from .fiches import _infer_window_and_lieux_from_fiches
            start_dt, end_dt, lieu_depart, lieu_arrivee = _infer_window_and_lieux_from_fiches(fiches, mission)
        else:
            h = mission.horaires or dtime(0, 0)
            start_dt = datetime.combine(mission.date, h)
            if timezone.is_naive(start_dt):
                start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
            end_dt = start_dt + timedelta(hours=3)
            lieu_depart = mission.aeroport
            lieu_arrivee = None

        if end_dt <= start_dt:
            end_dt = start_dt + timedelta(minutes=30)

        MissionRessource.objects.update_or_create(
            mission=mission,
            defaults={
                "vehicule": vehicule,
                "chauffeur": chauffeur,
                "date_heure_debut": start_dt,
                "date_heure_fin": end_dt,
                "lieu_depart": lieu_depart,
                "lieu_arrivee": lieu_arrivee,
                "is_deleted": False,
                "deleted_at": None,
            },
        )

        mission_full = _get_mission_for_pdf(mission.pk)

        # ✅ OM : V1 si absent, sinon dernier
        ordre = _ensure_first_ordre(mission_full, request=request)
        ordre = _get_latest_ordre(mission_full) or ordre

        # ✅ si ressources changent ET un pdf existe => regen pdf du DERNIER (sans créer de version)
        force_regen = bool(changed and ordre.fichier_pdf and ordre.fichier_pdf.name)
        ordre = _ensure_pdf_cached_for_ordre(ordre, mission_full, request=request, force_regen=force_regen)
        return _serve_ordre_pdf(ordre)

    # -------------------------
    # Cancel OM (ne supprime pas l'historique)
    # -------------------------
    @action(detail=True, methods=["post"], url_path="cancel-om")
    @transaction.atomic
    def cancel_om(self, request, pk=None):
        """
        POST /api/missions/<id>/cancel-om/

        ✅ garde la traçabilité des OM existants
        ✅ remet vehicule/chauffeur à NULL
        ✅ soft-delete l'affectation MissionRessource existante (si existe)
        ✅ option: invalide le PDF du dernier OM (sans toucher aux anciens)
        """
        mission = self.get_object()
        _ensure_same_agence_or_superadmin(request, mission.agence_id)
        _ensure_can_manage_om(request, mission)

        # Option : invalider le pdf du dernier OM (pas obligatoire)
        last = _get_latest_ordre(mission)
        if last and last.fichier_pdf and last.fichier_pdf.name:
            _invalidate_cached_pdf(last)

        MissionRessource.objects.filter(mission=mission, is_deleted=False).update(
            is_deleted=True,
            deleted_at=timezone.now(),
        )

        mission.vehicule = None
        mission.chauffeur = None
        mission.save(update_fields=["vehicule", "chauffeur"])

        return Response(
            {"ok": True, "detail": "Mission annulée (ressources vidées). Historique OM conservé."},
            status=200,
        )

    # -------------------------
    # Replace OM (crée une nouvelle version)
    # -------------------------
    @action(detail=True, methods=["post"], url_path="replace-om")
    @transaction.atomic
    def replace_om(self, request, pk=None):
        """
        POST /api/missions/<id>/replace-om/
        Body identique à generate-om.

        ✅ garde ancien OM
        ✅ crée une nouvelle version V+1 (lock pour éviter doublons)
        ✅ génère le PDF pour cette nouvelle version
        ✅ renvoie le PDF du dernier (nouveau) OM
        """
        mission = self.get_object()
        _ensure_same_agence_or_superadmin(request, mission.agence_id)
        _ensure_can_manage_om(request, mission)

        vehicule_id = request.data.get("vehicule")
        chauffeur_id = request.data.get("chauffeur")

        vehicule = get_object_or_404(Vehicule, id=vehicule_id) if vehicule_id else None
        chauffeur = get_object_or_404(Chauffeur, id=chauffeur_id) if chauffeur_id else None

        if vehicule and vehicule.agence_id != mission.agence_id:
            return Response({"detail": "Véhicule d'une autre agence."}, status=400)
        if chauffeur and chauffeur.agence_id != mission.agence_id:
            return Response({"detail": "Chauffeur d'une autre agence."}, status=400)

        # ✅ MAJ mission
        mission.vehicule = vehicule
        mission.chauffeur = chauffeur
        mission.save(update_fields=["vehicule", "chauffeur"])

        # ✅ fenêtre + lieux
        fiches = list(mission.fiches.filter(is_deleted=False))
        if fiches:
            from .fiches import _infer_window_and_lieux_from_fiches
            start_dt, end_dt, lieu_depart, lieu_arrivee = _infer_window_and_lieux_from_fiches(fiches, mission)
        else:
            h = mission.horaires or dtime(0, 0)
            start_dt = datetime.combine(mission.date, h)
            if timezone.is_naive(start_dt):
                start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
            end_dt = start_dt + timedelta(hours=3)
            lieu_depart = mission.aeroport
            lieu_arrivee = None

        if end_dt <= start_dt:
            end_dt = start_dt + timedelta(minutes=30)

        # ✅ MAJ affectation
        MissionRessource.objects.update_or_create(
            mission=mission,
            defaults={
                "vehicule": vehicule,
                "chauffeur": chauffeur,
                "date_heure_debut": start_dt,
                "date_heure_fin": end_dt,
                "lieu_depart": lieu_depart,
                "lieu_arrivee": lieu_arrivee,
                "is_deleted": False,
                "deleted_at": None,
            },
        )

        mission_full = _get_mission_for_pdf(mission.pk)

        # ✅ lock dernière version pour éviter doublons en concurrence
        last = (
            OrdreMission.objects
            .select_for_update()
            .filter(mission=mission_full)
            .order_by("-version", "-created_at", "-id")
            .first()
        )

        # ✅ crée nouvelle version V+1 (avec fallback base_reference)
        if not last:
            ordre = _ensure_first_ordre(mission_full, request=request)
        else:
            new_version = int(last.version or 1) + 1
            base_ref = (last.base_reference or "").strip() or (last.reference or "").strip()
            ordre = OrdreMission(
                mission=mission_full,
                base_reference=base_ref,
                version=new_version,
                created_by=getattr(request, "user", None),
            )
            ordre.save()

            # ✅ si ton modèle ne calcule pas reference, on la force
            if not getattr(ordre, "reference", None):
                ordre.reference = _compute_reference_for_ordre(ordre)
                ordre.save(update_fields=["reference"])

        # ✅ génère PDF sur cette version (sans toucher aux anciennes)
        ordre = _ensure_pdf_cached_for_ordre(ordre, mission_full, request=request, force_regen=True)
        return _serve_ordre_pdf(ordre)


# ============================================================
# Endpoint direct: /api/ordres/<id>/pdf/
# (IMPORTANT : hors de la classe pour éviter le shadowing permission_classes)
# ============================================================

@api_view(["GET"])
@drf_permission_classes([IsAuthenticated])
def ordre_mission_pdf(request, ordre_id: int):
    ordre = get_object_or_404(OrdreMission, id=ordre_id)
    _ensure_same_agence_or_superadmin(request, ordre.mission.agence_id)

    mission = _get_mission_for_pdf(int(ordre.mission_id))
    ordre = _ensure_pdf_cached_for_ordre(ordre, mission, request=request)
    return _serve_ordre_pdf(ordre)
