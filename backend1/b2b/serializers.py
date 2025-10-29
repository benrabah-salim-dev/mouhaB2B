# b2b/serializers.py
from __future__ import annotations

from django.contrib.auth.models import User
from rest_framework import serializers

from .models import (
    TourOperateur,
    AgenceVoyage,
    Profile,
    Succursale,
    Hotel,
    Zone,
    Vehicule,
    Chauffeur,
    LanguageMapping,
    FicheMouvement,
    ImportBatch,
    ImportBatchItem,
)

# ====== User / Profile ======

class ProfileSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)

    class Meta:
        model = Profile
        fields = ["role", "agence", "agence_nom"]


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "profile"]


# ====== Tiers / Référentiels / Ressources ======

class TourOperateurSerializer(serializers.ModelSerializer):
    class Meta:
        model = TourOperateur
        fields = "__all__"


class AgenceVoyageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgenceVoyage
        fields = "__all__"


class SuccursaleSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)

    class Meta:
        model = Succursale
        fields = ["id", "agence", "agence_nom", "nom", "adresse", "email", "telephone"]


class HotelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hotel
        fields = "__all__"


class ZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = ["id", "nom"]


class VehiculeSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)

    class Meta:
        model = Vehicule
        fields = [
            "id",
            "type",
            "marque",
            "model",
            "immatriculation",
            "capacite",
            "annee",
            "agence",
            "agence_nom",
        ]


class ChauffeurSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)

    class Meta:
        model = Chauffeur
        fields = ["id", "nom", "prenom", "cin", "agence", "agence_nom"]


class LanguageMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = LanguageMapping
        fields = "__all__"


# ====== Fiche Mouvement (inclut anciens champs Dossier) ======

class FicheMouvementListSerializer(serializers.ModelSerializer):
    reference = serializers.CharField(source="name", allow_blank=True, required=False)
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)

    class Meta:
        model = FicheMouvement
        fields = [
            "id",
            "reference",
            "type",
            "aeroport",
            "date",
            "agence",
            "agence_nom",
            "hotel",
            "pax",
            "client_to",
            "created_at",
        ]


class FicheMouvementDetailSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = FicheMouvement
        fields = (
            "id",
            "name",
            "type",
            "date",
            "aeroport",
            "agence",
            "agence_nom",
            "created_by",
            "created_by_username",
            "created_at",
            # Champs ex-Dossier
            "horaires",
            "provenance",
            "destination",
            "numero_vol",
            "client_to",
            "hotel",
            "ref",
            "titulaire",
            "pax",
            "adulte",
            "enfants",
            "bb_gratuit",
            "observation",
            "ville",
            "code_postal",
            "imported_at",
            "hotel_schedule",
        )
        read_only_fields = ("created_at", "imported_at")


class FicheMouvementSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    name = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")
    aeroport = serializers.CharField(required=False, allow_blank=True, default="")
    hotel_schedule = serializers.ListField(child=serializers.DictField(), required=False, allow_null=True)

    class Meta:
        model = FicheMouvement
        fields = "__all__"
        read_only_fields = ["created_by", "created_at", "imported_at"]


# ====== Imports ======

class ImportBatchSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = ImportBatch
        fields = ["id", "label", "agence", "agence_nom", "user", "user_username", "created_at"]


class ImportBatchItemSerializer(serializers.ModelSerializer):
    batch_label = serializers.CharField(source="batch.label", read_only=True)
    fiche_ref = serializers.CharField(source="fiche.ref", read_only=True)

    class Meta:
        model = ImportBatchItem
        fields = ["id", "batch", "batch_label", "fiche", "fiche_ref"]
