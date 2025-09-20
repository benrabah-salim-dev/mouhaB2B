from django.contrib import admin
from .models import (
    AgenceVoyage, Vehicule, Chauffeur,
    Dossier, Touriste, Hotel,
    PreMission, OrdreMission, Mission, Succursale, TourOperateur, Profile
)

# Admin TourOperateur
@admin.register(TourOperateur)
class TourOperateurAdmin(admin.ModelAdmin):
    list_display = ('nom', 'email', 'telephone')
    search_fields = ('nom', 'email')
    ordering = ('nom',)

# Admin Profile
@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'agence', 'agence_nom')  # Affichage de l'utilisateur, son rôle et l'agence associée
    search_fields = ('user__username', 'role', 'agence__nom')  # Recherche par nom d'utilisateur, rôle et agence
    list_filter = ('role', 'agence')  # Filtres par rôle et agence
    ordering = ('user__username',)

    def agence_nom(self, obj):
        return obj.agence.nom if obj.agence else 'Aucune'
    agence_nom.short_description = 'Nom de l\'agence'

# Admin Succursale
@admin.register(Succursale)
class SuccursaleAdmin(admin.ModelAdmin):
    list_display = ('nom', 'adresse', 'agence')
    search_fields = ('nom', 'adresse', 'agence__nom')
    list_filter = ('agence',)
    ordering = ('nom',)

# Admin AgenceVoyage
class VehiculeInline(admin.TabularInline):
    model = Vehicule
    extra = 0

class ChauffeurInline(admin.TabularInline):
    model = Chauffeur
    extra = 0

@admin.register(AgenceVoyage)
class AgenceVoyageAdmin(admin.ModelAdmin):
    list_display = ('nom', 'email', 'telephone')
    search_fields = ('nom', 'email', 'telephone')
    inlines = [VehiculeInline, ChauffeurInline]
    list_display_links = ('nom',)
    ordering = ('nom',)

# Admin Vehicule
@admin.register(Vehicule)
class VehiculeAdmin(admin.ModelAdmin):
    list_display = ('type', 'marque', 'model', 'immatriculation', 'capacite', 'annee', 'agence')
    search_fields = ('marque', 'model', 'immatriculation', 'agence__nom')
    list_filter = ('type', 'annee')
    list_display_links = ('immatriculation',)
    ordering = ('type', 'marque')

# Admin Chauffeur
@admin.register(Chauffeur)
class ChauffeurAdmin(admin.ModelAdmin):
    list_display = ('prenom', 'nom', 'cin', 'agence')
    search_fields = ('nom', 'prenom', 'cin', 'agence__nom')
    list_display_links = ('cin',)
    ordering = ('nom',)

# Admin Dossier
class TouristeInline(admin.TabularInline):
    model = Dossier.touristes.through
    extra = 0

@admin.register(Dossier)
class DossierAdmin(admin.ModelAdmin):
    list_display = ('reference', 'nom_reservation', 'agence', 'hotel', 'ville', 'nombre_personnes_arrivee')
    list_filter = ('agence', 'hotel', 'ville')
    search_fields = ('reference', 'nom_reservation', 'ville', 'agence__nom')
    inlines = [TouristeInline]
    exclude = ('touristes',)
    list_display_links = ('reference',)
    ordering = ('reference',)

# Admin Touriste
@admin.register(Touriste)
class TouristeAdmin(admin.ModelAdmin):
    list_display = ('prenom', 'nom', 'vol_arrivee', 'hotel')
    search_fields = ('prenom', 'nom', 'hotel')
    list_display_links = ('prenom',)
    ordering = ('nom',)

# Admin Hotel
@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ('nom', 'adresse')
    search_fields = ('nom',)
    list_display_links = ('nom',)

# Admin PreMission
@admin.register(PreMission)
class PreMissionAdmin(admin.ModelAdmin):
    list_display = ('reference', 'agence', 'dossier', 'date_creation')
    search_fields = ('reference', 'agence__nom', 'dossier__reference')
    list_display_links = ('reference',)
    ordering = ('date_creation',)

# Admin Mission
@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    list_display = ('reference', 'premission', 'date_debut', 'date_fin')
    search_fields = ('reference', 'premission__reference')
    list_display_links = ('reference',)
    ordering = ('date_debut',)

# Admin OrdreMission
@admin.register(OrdreMission)
class OrdreMissionAdmin(admin.ModelAdmin):
    list_display = ('reference', 'mission', 'vehicule', 'chauffeur', 'date_depart', 'date_retour')
    search_fields = ('reference', 'mission__reference', 'vehicule__immatriculation', 'chauffeur__nom')
    list_display_links = ('reference',)
    ordering = ('date_depart',)