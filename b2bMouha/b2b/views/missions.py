# -*- coding: utf-8 -*-
from __future__ import annotations
from io import BytesIO

from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from reportlab.pdfgen import canvas

from ..models import PreMission, Mission, OrdreMission, Vehicule, Chauffeur
from ..serializers import PreMissionSerializer, MissionSerializer, OrdreMissionSerializer
from .helpers import _user_role, _user_agence, _ensure_same_agence_or_superadmin, generate_unique_reference

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
        else:
            agence = _user_agence(self.request.user)
            dossier = serializer.validated_data.get("dossier")
            if dossier.agence_id != getattr(agence, "id", None):
                raise PermissionError("Dossier d'une autre agence.")
            serializer.save(agence=agence)

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
        mission = self.get_object()
        vehicule = get_object_or_404(Vehicule, id=request.data.get("vehicule"))
        chauffeur = get_object_or_404(Chauffeur, id=request.data.get("chauffeur"))
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

        buff = BytesIO()
        p = canvas.Canvas(buff)
        p.setFont("Helvetica-Bold", 14)
        p.drawString(100, 800, f"Ordre de Mission: {ordre.reference}")
        p.setFont("Helvetica", 12)
        p.drawString(100, 780, f"Mission: {mission.reference}")
        p.drawString(100, 760, f"Véhicule: {vehicule.immatriculation}")
        p.drawString(100, 740, f"Chauffeur: {chauffeur.nom} {chauffeur.prenom}")
        p.drawString(100, 720, f"Date départ: {mission.date_debut}")
        p.drawString(100, 700, f"Date retour: {mission.date_fin}")
        p.showPage(); p.save(); buff.seek(0)
        return FileResponse(buff, as_attachment=True, filename=f"ordre_mission_{ordre.reference}.pdf")

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

# PDF "beau" (ta version complète est dans ton ancien fichier; on garde une route courte ici)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ordre_mission_pdf(request, ordre_id):
    ordre = get_object_or_404(OrdreMission, id=ordre_id)
    buff = BytesIO()
    p = canvas.Canvas(buff)
    p.drawString(100, 800, f"OM {ordre.reference}")
    p.drawString(100, 780, f"Mission: {ordre.mission.reference}")
    p.showPage(); p.save(); buff.seek(0)
    return FileResponse(buff, as_attachment=True, filename=f"ordre_{ordre.reference}.pdf")
