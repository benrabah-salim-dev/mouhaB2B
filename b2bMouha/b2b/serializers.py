from rest_framework import serializers
from .models import (
    AgenceVoyage, Vehicule, Chauffeur, Dossier, Touriste, Hotel,
    PreMission, Mission, OrdreMission,Profile,User
)

from django.contrib.auth.models import User

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
        
class AgenceVoyageSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = AgenceVoyage
        fields = '__all__'

    def validate_user(self, value):
        if AgenceVoyage.objects.filter(user=value).exists():
            raise serializers.ValidationError("Une agence voyage existe déjà pour cet utilisateur.")
        return value

class VehiculeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicule
        fields = ['id', 'type', 'marque', 'model', 'immatriculation', 'capacite', 'annee']

class ChauffeurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chauffeur
        fields = ['id', 'nom', 'prenom', 'cin', 'agence']

class OrdreMissionSerializer(serializers.ModelSerializer):
    vehicule_immatriculation = serializers.ReadOnlyField(source='vehicule.immatriculation')
    chauffeur_nom = serializers.ReadOnlyField(source='chauffeur.nom')

    class Meta:
        model = OrdreMission
        fields = ['id', 'reference', 'mission', 'date_depart', 'date_retour', 'vehicule', 'vehicule_immatriculation', 'chauffeur', 'chauffeur_nom', 'trajet']
        


class DossierSerializer(serializers.ModelSerializer):
    agence_nom = serializers.ReadOnlyField(source='agence.nom')
    hotel_nom = serializers.ReadOnlyField(source='hotel.nom')
    touristes = serializers.PrimaryKeyRelatedField(
    many=True,
    queryset=Touriste.objects.all(),
    required=False,  # <-- Permet d’éviter l’erreur si absent
    )

    class Meta:
        model = Dossier
        fields = [
            'id',
            'reference',
            'agence',
            'agence_nom',
            'ville',
            'aeroport_arrivee',
            'num_vol_arrivee',
            'heure_arrivee',
            'hotel',
            'hotel_nom',
            'nombre_personnes_arrivee',
            'nom_reservation',
            'touristes',
            'aeroport_depart',
            'heure_depart',
            'num_vol_retour',
            'nombre_personnes_retour',
        ]

    def create(self, validated_data):
        touristes_data = validated_data.pop('touristes', [])
        dossier = Dossier.objects.create(**validated_data)
        dossier.touristes.set(touristes_data)
        return dossier

    def update(self, instance, validated_data):
        touristes_data = validated_data.pop('touristes', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if touristes_data is not None:
            instance.touristes.set(touristes_data)
        instance.save()
        return instance

class TouristeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Touriste
        fields = '__all__'

class HotelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hotel
        fields = '__all__'

class PreMissionSerializer(serializers.ModelSerializer):
    agence_nom = serializers.ReadOnlyField(source='agence.nom')
    dossier_reference = serializers.ReadOnlyField(source='dossier.reference')

    class Meta:
        model = PreMission
        fields = [
            'id',
            'reference',
            'date_creation',
            'agence',
            'agence_nom',
            'dossier',
            'dossier_reference',
            'trajet_prevu',
            'remarques',
        ]

class MissionSerializer(serializers.ModelSerializer):
    premission_reference = serializers.ReadOnlyField(source='premission.reference')

    class Meta:
        model = Mission
        fields = [
            'id',
            'reference',
            'premission',
            'premission_reference',
            'date_debut',
            'date_fin',
            'details',
        ]
