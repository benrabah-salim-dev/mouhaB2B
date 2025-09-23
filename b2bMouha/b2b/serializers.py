# b2b/serializers.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import List

from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

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
    Profile,  # assure-toi qu'il existe bien
    # Nouveaux modèles "produits"
    Zone,
    Produit,
    ProduitEtape,
    ProduitTarif,
    ReservationProduit,
    # Offres inter-agences
    VehicleOffer,
)

# ============== Profil / User ==============

class ProfileSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source='agence.nom', read_only=True)

    class Meta:
        model = Profile
        fields = ['role', 'agence', 'agence_nom']


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'profile']


# ============== Agence / Véhicule / Chauffeur / Hotel ==============

class AgenceVoyageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgenceVoyage
        fields = '__all__'


class VehiculeSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source='agence.nom', read_only=True)

    class Meta:
        model = Vehicule
        fields = [
            'id', 'type', 'marque', 'model', 'immatriculation',
            'capacite', 'annee', 'agence', 'agence_nom'
        ]


class VehiculePublicSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source='agence.nom', read_only=True)

    class Meta:
        model = Vehicule
        fields = ['id', 'type', 'marque', 'model', 'immatriculation', 'capacite', 'agence_nom']


class ChauffeurSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source='agence.nom', read_only=True)

    class Meta:
        model = Chauffeur
        fields = ['id', 'nom', 'prenom', 'cin', 'agence', 'agence_nom']


class HotelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hotel
        fields = '__all__'


# ============== Dossier & liés ==============

# Si ton modèle Touriste existe en M2M via Dossier.touristes, on le déduit dynamiquement
class TouristeSerializer(serializers.ModelSerializer):
    class Meta:
        model = getattr(Dossier, "touristes").rel.model  # évite d'importer un modèle qui peut varier
        fields = '__all__'


class DossierSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source='agence.nom', read_only=True)
    hotel_nom = serializers.CharField(source='hotel.nom', read_only=True)

    # expose les ID des touristes (clé primaire) — ajuste si tu veux l’embed complet
    touristes = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=getattr(Dossier, "touristes").rel.model.objects.all(),
        required=False
    )

    # observation exposée côté API
    observation = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Dossier
        fields = [
            'id', 'reference', 'agence', 'agence_nom', 'ville',
            'aeroport_arrivee', 'num_vol_arrivee', 'heure_arrivee',
            'hotel', 'hotel_nom', 'nombre_personnes_arrivee', 'nom_reservation',
            'touristes', 'aeroport_depart', 'heure_depart', 'num_vol_retour',
            'nombre_personnes_retour', 'tour_operateur', 'observation'
        ]


# ============== PreMission / Mission / OrdreMission ==============

class PreMissionSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source='agence.nom', read_only=True)
    dossier_reference = serializers.CharField(source='dossier.reference', read_only=True)

    class Meta:
        model = PreMission
        fields = [
            'id', 'reference', 'date_creation',
            'agence', 'agence_nom',
            'dossier', 'dossier_reference',
            'trajet_prevu', 'remarques'
        ]


class MissionSerializer(serializers.ModelSerializer):
    premission_reference = serializers.CharField(source='premission.reference', read_only=True)

    class Meta:
        model = Mission
        fields = [
            'id', 'reference', 'premission', 'premission_reference',
            'date_debut', 'date_fin', 'details', 'ordre_mission_genere'
        ]


class OrdreMissionSerializer(serializers.ModelSerializer):
    vehicule_immatriculation = serializers.CharField(source="vehicule.immatriculation", read_only=True)
    vehicule_marque = serializers.CharField(source="vehicule.marque", read_only=True)
    chauffeur_nom = serializers.CharField(source="chauffeur.nom", read_only=True)
    chauffeur_prenom = serializers.CharField(source="chauffeur.prenom", read_only=True)
    agence_nom = serializers.CharField(source="mission.premission.agence.nom", read_only=True)
    mission_reference = serializers.CharField(source="mission.reference", read_only=True)

    class Meta:
        model = OrdreMission
        fields = [
            "id", "reference", "mission", "mission_reference", "agence_nom",
            "date_depart", "date_retour", "trajet",
            "vehicule", "vehicule_immatriculation", "vehicule_marque",
            "chauffeur", "chauffeur_nom", "chauffeur_prenom"
        ]


# ============== LanguageMapping ==============

class LanguageMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = LanguageMapping
        fields = '__all__'


# ============== Fiches Mouvement (list/detail pour l’UI) ==============

class DossierLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dossier
        fields = (
            "id", "reference", "nom_reservation", "ville",
            "aeroport_depart", "aeroport_arrivee",
            "heure_depart", "heure_arrivee",
            "num_vol_arrivee", "num_vol_retour",
            "nombre_personnes_arrivee", "nombre_personnes_retour",
            "observation",
        )


class FicheMouvementItemNestedSerializer(serializers.ModelSerializer):
    dossier = DossierLiteSerializer()

    class Meta:
        model = FicheMouvementItem
        fields = ("id", "dossier")


class FicheMouvementListSerializer(serializers.ModelSerializer):
    items_count = serializers.IntegerField(source="items.count", read_only=True)

    class Meta:
        model = FicheMouvement
        fields = ("id", "name", "type", "date", "aeroport", "items_count", "created_at")


class FicheMouvementDetailSerializer(serializers.ModelSerializer):
    items = FicheMouvementItemNestedSerializer(many=True, read_only=True)
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = FicheMouvement
        fields = (
            "id", "name", "type", "date", "aeroport",
            "agence_nom", "created_by_username", "created_at", "items"
        )


# ============== Fiche Mouvement CRUD ==============

class FicheMouvementItemSerializer(serializers.ModelSerializer):
    dossier_reference = serializers.CharField(source='dossier.reference', read_only=True)

    class Meta:
        model = FicheMouvementItem
        fields = ['id', 'fiche', 'dossier', 'dossier_reference']


class FicheMouvementSerializer(serializers.ModelSerializer):
    items = FicheMouvementItemSerializer(many=True, read_only=True)
    agence_nom = serializers.CharField(source='agence.nom', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    # Permet de passer une liste d’IDs de dossiers lors du create/update
    dossier_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = FicheMouvement
        fields = [
            'id', 'agence', 'agence_nom',
            'name', 'type', 'date', 'aeroport',
            'created_by', 'created_by_username', 'created_at',
            'items',
            'dossier_ids',
        ]
        read_only_fields = ['created_by', 'created_at']

    def validate_dossier_ids(self, value: List[int]) -> List[int]:
        if not isinstance(value, list):
            raise serializers.ValidationError("dossier_ids doit être une liste d'IDs.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        dossier_ids = validated_data.pop("dossier_ids", [])
        fiche = super().create(validated_data)
        if dossier_ids:
            dossiers = Dossier.objects.filter(id__in=dossier_ids)
            FicheMouvementItem.objects.bulk_create(
                [FicheMouvementItem(fiche=fiche, dossier=d) for d in dossiers]
            )
        return fiche

    @transaction.atomic
    def update(self, instance, validated_data):
        dossier_ids = validated_data.pop("dossier_ids", None)
        fiche = super().update(instance, validated_data)
        if dossier_ids is not None:
            # reset items puis recréer
            FicheMouvementItem.objects.filter(fiche=fiche).delete()
            if dossier_ids:
                dossiers = Dossier.objects.filter(id__in=dossier_ids)
                FicheMouvementItem.objects.bulk_create(
                    [FicheMouvementItem(fiche=fiche, dossier=d) for d in dossiers]
                )
        return fiche


# =========================
# Zones & Produits (Excursions / Navettes)
# =========================

class ZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = ["id", "nom"]


class ProduitEtapeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProduitEtape
        fields = ["id", "ordre", "titre", "description"]


class ProduitTarifSerializer(serializers.ModelSerializer):
    zone = ZoneSerializer(read_only=True)
    zone_id = serializers.PrimaryKeyRelatedField(
        queryset=Zone.objects.all(), source="zone", write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = ProduitTarif
        fields = ["id", "produit", "agence", "zone", "zone_id", "prix_adulte", "prix_enfant"]


class ProduitSerializer(serializers.ModelSerializer):
    etapes = ProduitEtapeSerializer(many=True, read_only=True)
    tarifs = ProduitTarifSerializer(many=True, read_only=True)

    class Meta:
        model = Produit
        fields = [
            "id", "kind", "agence", "titre", "description", "theme",
            "heure_debut", "heure_fin", "capacite",
            "zone_depart", "avec_repas", "duree",
            "zone_origine", "zone_destination",
            "created_at", "etapes", "tarifs",
        ]


class ReservationProduitSerializer(serializers.ModelSerializer):
    total_ttc = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ReservationProduit
        fields = [
            "id", "produit", "dossier", "agence",
            "date_service", "zone_pickup",
            "nb_adultes", "nb_enfants",
            "prix_adulte_applique", "prix_enfant_applique",
            "total_ttc", "mission", "created_at",
        ]


# =========================
# Offres inter-agences (Rentout / Rideshare)
# =========================

class VehicleOfferSerializer(serializers.ModelSerializer):
    seats_available = serializers.IntegerField(read_only=True)

    class Meta:
        model = VehicleOffer
        fields = [
            "id", "vehicule", "agence", "mode",
            "start", "end",
            "origin_zone", "destination_zone", "origin", "destination",
            "seats_total", "seats_reserved", "seats_available",
            "price", "price_per_adult", "price_per_child", "currency",
            "notes", "is_public", "active", "created_at",
        ]
