# b2b/admin.py
from django.contrib import admin

from b2b.models import (
    TourOperateur,
    AgenceVoyage,
    Profile,
    Succursale,
    Zone,
    Hotel,
    Dossier,
    FicheMouvement,
    Vehicule,
    VehiculeTarifZone,
    RentoutRequest,
    Chauffeur,
    ExcursionTemplate,
    ExcursionStep,
    ExcursionEvent,
    Mission,
    MissionRessource,
    OrdreMission,
    LanguageMapping,
)


@admin.register(TourOperateur)
class TourOperateurAdmin(admin.ModelAdmin):
    list_display = ("nom", "email", "telephone")
    search_fields = ("nom", "email", "telephone")


@admin.register(AgenceVoyage)
class AgenceVoyageAdmin(admin.ModelAdmin):
    list_display = ("nom", "pays", "telephone", "email")
    search_fields = ("nom", "pays", "telephone", "email")
    list_filter = ("pays", "tour_operateur")


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "agence")
    list_filter = ("role", "agence")
    search_fields = ("user__username", "user__email")


@admin.register(Succursale)
class SuccursaleAdmin(admin.ModelAdmin):
    list_display = ("nom", "agence", "telephone", "email")
    search_fields = ("nom", "agence__nom")
    list_filter = ("agence",)


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ("nom", "ville", "code_postal", "type")
    search_fields = ("nom", "ville", "code_postal")
    list_filter = ("type",)


@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ("nom", "zone", "agence")
    search_fields = ("nom",)
    list_filter = ("zone", "agence")


@admin.register(Dossier)
class DossierAdmin(admin.ModelAdmin):
    list_display = ("reference", "agence", "type_mouvement", "date", "pax")
    search_fields = ("reference", "client", "titulaire", "hotel")
    list_filter = ("agence", "type_mouvement", "date")


@admin.register(FicheMouvement)
class FicheMouvementAdmin(admin.ModelAdmin):
    list_display = ("ref", "agence", "type", "date", "hotel", "pax")
    search_fields = ("ref", "client_to", "hotel__nom", "numero_vol")
    list_filter = ("agence", "type", "date")


@admin.register(Vehicule)
class VehiculeAdmin(admin.ModelAdmin):
    list_display = (
        "immatriculation",
        "marque",
        "modele",
        "type",
        "capacite",
        "agence",
        "statut",
        "louer_autres_agences",
    )
    list_filter = ("type", "agence", "statut", "louer_autres_agences")
    search_fields = ("immatriculation", "marque", "modele")


@admin.register(VehiculeTarifZone)
class VehiculeTarifZoneAdmin(admin.ModelAdmin):
    list_display = ("agence", "aeroport", "zone", "type_code", "vehicule", "prix", "devise")
    list_filter = ("agence", "aeroport", "zone", "type_code", "devise")
    search_fields = ("aeroport", "zone__nom", "vehicule__immatriculation")


@admin.register(RentoutRequest)
class RentoutRequestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "vehicule",
        "agence_demandeuse",
        "agence_fournisseuse",
        "date_debut",
        "date_fin",
        "status",
    )
    list_filter = ("status", "agence_demandeuse", "agence_fournisseuse")
    search_fields = ("vehicule__immatriculation", "adresse_prise_en_charge")


@admin.register(Chauffeur)
class ChauffeurAdmin(admin.ModelAdmin):
    list_display = ("prenom", "nom", "cin", "agence", "statut")
    list_filter = ("agence", "statut")
    search_fields = ("prenom", "nom", "cin")


# ==============
# Excursions
# ==============

@admin.register(ExcursionTemplate)
class ExcursionTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "nom",
        "type_duree",
        "nb_jours",
        "repas_inclus",
        "created_at",
    )
    list_filter = (
        "type_duree",
        "repas_inclus",
    )
    search_fields = ("nom", "description", "depart_label")
    readonly_fields = ("created_at",)


@admin.register(ExcursionStep)
class ExcursionStepAdmin(admin.ModelAdmin):
    list_display = ("template", "ordre", "nom", "adresse", "is_meal_stop_midi")
    list_filter = ("template",)
    search_fields = ("nom", "adresse")


@admin.register(ExcursionEvent)
class ExcursionEventAdmin(admin.ModelAdmin):
    list_display = ("template", "date_debut", "date_fin", "agence", "statut")
    list_filter = ("statut", "vehicle_source", "agence")
    search_fields = ("template__nom",)


# ==============
# Missions / OM
# ==============

class MissionRessourceInline(admin.TabularInline):
    model = MissionRessource
    extra = 0


@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    list_display = ("id", "type", "agence", "date", "numero_vol", "aeroport")
    list_filter = ("type", "agence", "date")
    search_fields = ("numero_vol", "aeroport")
    inlines = [MissionRessourceInline]


@admin.register(MissionRessource)
class MissionRessourceAdmin(admin.ModelAdmin):
    list_display = (
        "mission",
        "vehicule",
        "chauffeur",
        "date_heure_debut",
        "date_heure_fin",
        "lieu_depart",
        "lieu_arrivee",
    )
    list_filter = ("mission__agence", "date_heure_debut", "vehicule", "chauffeur")
    search_fields = ("mission__id", "lieu_depart", "lieu_arrivee")


@admin.register(OrdreMission)
class OrdreMissionAdmin(admin.ModelAdmin):
    list_display = ("id", "mission", "created_at", "reference", "version")
    list_filter = ("created_at", "version")
    search_fields = ("reference", "mission__reference")
    ordering = ("-created_at", "-version")

    def has_pdf(self, obj: OrdreMission):
        return bool(obj.fichier_pdf and obj.fichier_pdf.name)
    has_pdf.boolean = True
    has_pdf.short_description = "PDF"


@admin.register(LanguageMapping)
class LanguageMappingAdmin(admin.ModelAdmin):
    list_display = ("code", "name")
    search_fields = ("code", "name")
