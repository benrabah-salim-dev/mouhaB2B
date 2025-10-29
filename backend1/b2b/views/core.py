# -*- coding: utf-8 -*-
from __future__ import annotations

from io import BytesIO

from django.core.exceptions import PermissionDenied
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import (
    AgenceVoyage,
    Vehicule,
    Chauffeur,
    Hotel,
    Dossier,
    PreMission,
    Mission,
    OrdreMission,
)
from b2b.views.helpers import (
    _user_role,
    _user_agence,
    _ensure_same_agence_or_superadmin,
    IsSuperAdminRole,
    queryset_dossiers_non_traite,
)
from b2b.serializers import (
    AgenceVoyageSerializer,
    VehiculeSerializer,
    ChauffeurSerializer,
    HotelSerializer,
    DossierSerializer,
    PreMissionSerializer,
    MissionSerializer,
    OrdreMissionSerializer,
)
from b2b.utils import generate_unique_reference

# -----------------------------
# Agence
# -----------------------------
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

# -----------------------------
# Véhicule
# -----------------------------
class VehiculeViewSet(viewsets.ModelViewSet):
    serializer_class = VehiculeSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Vehicule.objects.select_related("agence").all()
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(agence=_user_agence(self.request.user))
        return Vehicule.objects.none()

# -----------------------------
# Chauffeur
# -----------------------------
class ChauffeurViewSet(viewsets.ModelViewSet):
    serializer_class = ChauffeurSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Chauffeur.objects.select_related("agence").all()
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(agence=_user_agence(self.request.user))
        return Chauffeur.objects.none()

# -----------------------------
# Hotel
# -----------------------------
class HotelViewSet(viewsets.ModelViewSet):
    serializer_class = HotelSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Hotel.objects.all()

# -----------------------------
# Dossier (viewset générique)
# -----------------------------
class DossierViewSet(viewsets.ModelViewSet):
    serializer_class = DossierSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Dossier.objects.select_related("agence", "hotel").all()
        role = _user_role(self.request.user)
        agence_id = self.request.query_params.get("agence")
        if role == "superadmin":
            return qs if not agence_id else qs.filter(agence_id=agence_id)
        if role == "adminagence":
            return qs.filter(agence=_user_agence(self.request.user))
        return Dossier.objects.none()

# -----------------------------
# Liste "non traités" + filtres simples (API dédiée)
# -----------------------------
class DossierListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        agence_id = request.query_params.get("agence")
        if not agence_id:
            return Response({"detail": "Paramètre 'agence' requis."}, status=400)
        ag = get_object_or_404(AgenceVoyage, id=agence_id)
        # sécurité : même agence ou superadmin
        _ensure_same_agence_or_superadmin(request, ag)

        hide_used = request.query_params.get("hide_used") in {"1", "true", "True"}
        qs = queryset_dossiers_non_traite(ag) if hide_used else Dossier.objects.filter(agence=ag)

        # Filtres optionnels
        tcode = request.query_params.get("type")  # "A" / "D"
        date  = request.query_params.get("date")  # "YYYY-MM-DD"

        if tcode == "A":
            qs = qs.filter(heure_arrivee__isnull=False, heure_depart__isnull=True)
        elif tcode == "D":
            qs = qs.filter(heure_depart__isnull=False, heure_arrivee__isnull=True)

        if date:
            qs = qs.filter(heure_arrivee__date=date) | qs.filter(heure_depart__date=date)

        data = DossierSerializer(qs, many=True).data
        return Response({"dossiers": data}, status=200)

# -----------------------------
# PreMission
# -----------------------------
class PreMissionViewSet(viewsets.ModelViewSet):
    serializer_class = PreMissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PreMission.objects.select_related("agence", "dossier").all()
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

# -----------------------------
# Mission
# -----------------------------
class MissionViewSet(viewsets.ModelViewSet):
    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Mission.objects.select_related("premission", "premission__agence").all()
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs
        if role == "adminagence":
            return qs.filter(premission__agence=_user_agence(self.request.user))
        return Mission.objects.none()

    @action(detail=True, methods=["post"], url_path="generate-om")
    def generate_om(self, request, pk=None):
        """
        Génère un ordre de mission (retourne un PDF minimal en pièce jointe)
        Requiert: vehicule (id), chauffeur (id)
        """
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
            trajet=mission.premission.trajet_prevu or mission.premission.dossier.ville,
        )
        mission.ordre_mission_genere = True
        mission.save(update_fields=["ordre_mission_genere"])

        # PDF simple
        from reportlab.pdfgen import canvas
        buffer = BytesIO()
        p = canvas.Canvas(buffer)
        p.setFont("Helvetica-Bold", 14)
        p.drawString(100, 800, f"Ordre de Mission: {ordre.reference}")
        p.setFont("Helvetica", 12)
        p.drawString(100, 780, f"Mission: {mission.reference}")
        p.drawString(100, 760, f"Véhicule: {vehicule.immatriculation}")
        p.drawString(100, 740, f"Chauffeur: {chauffeur.nom} {chauffeur.prenom}")
        p.drawString(100, 720, f"Départ: {mission.date_debut}")
        p.drawString(100, 700, f"Retour: {mission.date_fin}")
        p.showPage()
        p.save()
        buffer.seek(0)
        return FileResponse(buffer, as_attachment=True, filename=f"ordre_mission_{ordre.reference}.pdf")

# -----------------------------
# Ordre de Mission
# -----------------------------
class OrdreMissionViewSet(viewsets.ModelViewSet):
    queryset = OrdreMission.objects.all()
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
