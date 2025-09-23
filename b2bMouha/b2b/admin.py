# b2b/admin.py

from django.contrib import admin
from .models import (
    # existants
    AgenceVoyage, Vehicule, Chauffeur,
    Dossier, Touriste, Hotel,
    PreMission, OrdreMission, Mission, Succursale, TourOperateur, Profile,
    # nouveaux
    Zone, Produit, ProduitEtape, ProduitTarif, ReservationProduit, VehicleOffer,
)


# =========================
# Tiers / Profils / Succursales
# =========================

@admin.register(TourOperateur)
class TourOperateurAdmin(admin.ModelAdmin):
    list_display = ('nom', 'email', 'telephone')
    search_fields = ('nom', 'email')
    ordering = ('nom',)


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'agence', 'agence_nom')
    search_fields = ('user__username', 'role', 'agence__nom')
    list_filter = ('role', 'agence')
    ordering = ('user__username',)

    def agence_nom(self, obj):
        return obj.agence.nom if obj.agence else 'Aucune'
    agence_nom.short_description = "Nom de l'agence"


@admin.register(Succursale)
class SuccursaleAdmin(admin.ModelAdmin):
    list_display = ('nom', 'adresse', 'agence')
    search_fields = ('nom', 'adresse', 'agence__nom')
    list_filter = ('agence',)
    ordering = ('nom',)


# =========================
# Agences (inlines véhicules/chauffeurs)
# =========================

class VehiculeInline(admin.TabularInline):
    model = Vehicule
    extra = 0
    fields = ('immatriculation', 'type', 'marque', 'model', 'capacite', 'annee')


class ChauffeurInline(admin.TabularInline):
    model = Chauffeur
    extra = 0
    fields = ('prenom', 'nom', 'cin')


@admin.register(AgenceVoyage)
class AgenceVoyageAdmin(admin.ModelAdmin):
    list_display = ('nom', 'email', 'telephone')
    search_fields = ('nom', 'email', 'telephone')
    inlines = [VehiculeInline, ChauffeurInline]
    list_display_links = ('nom',)
    ordering = ('nom',)


# =========================
# Ressources (Véhicules / Chauffeurs)
# =========================

@admin.register(Vehicule)
class VehiculeAdmin(admin.ModelAdmin):
    list_display = ('type', 'marque', 'model', 'immatriculation', 'capacite', 'annee', 'agence')
    search_fields = ('marque', 'model', 'immatriculation', 'agence__nom')
    list_filter = ('type', 'annee', 'agence')
    list_display_links = ('immatriculation',)
    ordering = ('type', 'marque')
    autocomplete_fields = ('agence',)


@admin.register(Chauffeur)
class ChauffeurAdmin(admin.ModelAdmin):
    list_display = ('prenom', 'nom', 'cin', 'agence')
    search_fields = ('nom', 'prenom', 'cin', 'agence__nom')
    list_filter = ('agence',)
    list_display_links = ('cin',)
    ordering = ('nom',)
    autocomplete_fields = ('agence',)


# =========================
# Hôtellerie / Touristes
# =========================

@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ('nom', 'adresse')
    search_fields = ('nom',)
    list_display_links = ('nom',)


@admin.register(Touriste)
class TouristeAdmin(admin.ModelAdmin):
    list_display = ('prenom', 'nom', 'vol_arrivee', 'hotel')
    search_fields = ('prenom', 'nom', 'hotel')
    list_display_links = ('prenom',)
    ordering = ('nom',)


# =========================
# Dossiers (avec inline touristes)
# =========================

class TouristeInlineForDossier(admin.TabularInline):
    model = Dossier.touristes.through
    extra = 0


@admin.register(Dossier)
class DossierAdmin(admin.ModelAdmin):
    list_display = (
        'reference', 'nom_reservation', 'agence', 'hotel', 'ville',
        'nombre_personnes_arrivee', 'nombre_personnes_retour',
        'aeroport_arrivee', 'aeroport_depart', 'short_observation',
    )
    list_filter = ('agence', 'hotel', 'ville', 'aeroport_arrivee', 'aeroport_depart')
    search_fields = ('reference', 'nom_reservation', 'ville', 'agence__nom', 'tour_operateur')
    inlines = [TouristeInlineForDossier]
    exclude = ('touristes',)
    list_display_links = ('reference',)
    ordering = ('reference',)
    autocomplete_fields = ('agence', 'hotel')

    def short_observation(self, obj):
        if not obj.observation:
            return '-'
        s = str(obj.observation)
        return (s[:60] + '…') if len(s) > 60 else s
    short_observation.short_description = 'Observation'


# =========================
# Pré-missions / Missions / Ordres
# =========================

@admin.register(PreMission)
class PreMissionAdmin(admin.ModelAdmin):
    list_display = ('reference', 'agence', 'dossier', 'trajet_prevu', 'date_creation')
    search_fields = ('reference', 'agence__nom', 'dossier__reference')
    list_display_links = ('reference',)
    ordering = ('date_creation',)
    autocomplete_fields = ('agence', 'dossier')


class OrdreMissionInline(admin.TabularInline):
    model = OrdreMission
    extra = 0
    fields = ('reference', 'vehicule', 'chauffeur', 'trajet', 'date_depart', 'date_retour')
    readonly_fields = ('reference',)
    autocomplete_fields = ('vehicule', 'chauffeur')


@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    list_display = ('reference', 'premission', 'date_debut', 'date_fin', 'ordre_mission_genere')
    search_fields = ('reference', 'premission__reference')
    list_display_links = ('reference',)
    ordering = ('date_debut',)
    autocomplete_fields = ('premission',)
    inlines = [OrdreMissionInline]


@admin.register(OrdreMission)
class OrdreMissionAdmin(admin.ModelAdmin):
    list_display = ('reference', 'mission', 'vehicule', 'chauffeur', 'trajet', 'date_depart', 'date_retour')
    search_fields = ('reference', 'mission__reference', 'vehicule__immatriculation', 'chauffeur__nom')
    list_display_links = ('reference',)
    ordering = ('date_depart',)
    autocomplete_fields = ('mission', 'vehicule', 'chauffeur')
    readonly_fields = ('reference',)


# =========================
# Zones / Produits (Excursions & Navettes)
# =========================

@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ('id', 'nom')
    search_fields = ('nom',)


class ProduitEtapeInline(admin.TabularInline):
    model = ProduitEtape
    extra = 0
    fields = ('ordre', 'titre', 'description')


class ProduitTarifInline(admin.TabularInline):
    model = ProduitTarif
    extra = 1
    fields = ('agence', 'zone', 'prix_adulte', 'prix_enfant')
    autocomplete_fields = ('agence', 'zone')


@admin.register(Produit)
class ProduitAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'kind', 'titre', 'agence',
        'heure_debut', 'heure_fin', 'capacite',
        'zones_display', 'duree', 'avec_repas',
        'created_at',
    )
    list_filter = ('kind', 'agence', 'avec_repas', 'duree', 'created_at')
    search_fields = ('titre', 'description', 'theme')
    autocomplete_fields = ('agence', 'zone_depart', 'zone_origine', 'zone_destination')
    inlines = [ProduitEtapeInline, ProduitTarifInline]

    fieldsets = (
        ('Général', {
            'fields': (
                'kind', 'agence',
                'titre', 'description', 'theme',
                ('heure_debut', 'heure_fin'), 'capacite',
            )
        }),
        ('Excursion (si kind = EXCURSION)', {
            'fields': ('zone_depart', 'avec_repas', 'duree'),
        }),
        ('Navette (si kind = NAVETTE)', {
            'fields': ('zone_origine', 'zone_destination'),
        }),
    )

    def zones_display(self, obj):
        if obj.kind == 'EXCURSION':
            return obj.zone_depart.nom if obj.zone_depart else '-'
        if obj.kind == 'NAVETTE':
            a = obj.zone_origine.nom if obj.zone_origine else '-'
            b = obj.zone_destination.nom if obj.zone_destination else '-'
            return f'{a} → {b}'
        return '-'
    zones_display.short_description = 'Zones'


# =========================
# Réservations de produits (production réelle)
# =========================

@admin.register(ReservationProduit)
class ReservationProduitAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'dossier', 'produit', 'agence',
        'date_service', 'zone_pickup',
        'nb_adultes', 'nb_enfants',
        'prix_adulte_applique', 'prix_enfant_applique', 'total_ttc',
        'mission',
        'created_at',
    )
    list_filter = ('agence', 'produit__kind', 'date_service', 'zone_pickup')
    search_fields = ('dossier__reference', 'dossier__nom_reservation', 'produit__titre')
    autocomplete_fields = ('dossier', 'produit', 'agence', 'zone_pickup', 'mission')
    readonly_fields = ('total_ttc',)

    def save_model(self, request, obj, form, change):
        # recalcul simple du total à l’enregistrement
        obj.total_ttc = obj.compute_total()
        super().save_model(request, obj, form, change)


# =========================
# Offres inter-agences (Rentout / Rideshare)
# =========================

@admin.register(VehicleOffer)
class VehicleOfferAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'vehicule', 'agence', 'mode',
        'start', 'end',
        'trajet_display',
        'seats_total', 'seats_reserved', 'seats_available',
        'price', 'price_per_adult', 'price_per_child', 'currency',
        'active', 'is_public',
        'created_at',
    )
    list_filter = ('mode', 'agence', 'active', 'is_public', 'start')
    search_fields = ('vehicule__immatriculation', 'origin', 'destination', 'agence__nom')
    autocomplete_fields = ('vehicule', 'agence', 'origin_zone', 'destination_zone')
    readonly_fields = ('seats_available',)

    fieldsets = (
        ('Général', {
            'fields': ('vehicule', 'agence', 'mode', ('start', 'end'), 'notes', 'active', 'is_public')
        }),
        ('Trajet', {
            'fields': (('origin_zone', 'destination_zone'), ('origin', 'destination')),
            'description': "Zones référentielles recommandées. Les champs texte restent pour compatibilité.",
        }),
        ('Capacité & Prix', {
            'fields': ('seats_total', 'seats_reserved', 'price', ('price_per_adult', 'price_per_child'), 'currency'),
        }),
    )

    def trajet_display(self, obj):
        if obj.origin_zone or obj.destination_zone:
            a = obj.origin_zone.nom if obj.origin_zone else (obj.origin or '-')
            b = obj.destination_zone.nom if obj.destination_zone else (obj.destination or '-')
        else:
            a = obj.origin or '-'
            b = obj.destination or '-'
        return f'{a} → {b}'
    trajet_display.short_description = 'Trajet'
