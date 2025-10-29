# b2b/admin.py
from django.contrib import admin
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
    ImportValidationError,
)

@admin.register(TourOperateur)
class TourOperateurAdmin(admin.ModelAdmin):
    list_display = ("nom", "email", "telephone")
    search_fields = ("nom", "email")


@admin.register(AgenceVoyage)
class AgenceVoyageAdmin(admin.ModelAdmin):
    list_display = ("nom", "email", "telephone", "roles_mask", "tour_operateur")
    list_filter = ("roles_mask", "tour_operateur")
    search_fields = ("nom", "email")


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "agence")
    list_filter = ("role", "agence")
    search_fields = ("user__username", "user__email")


@admin.register(Succursale)
class SuccursaleAdmin(admin.ModelAdmin):
    list_display = ("nom", "agence", "email", "telephone")
    search_fields = ("nom", "agence__nom")
    list_filter = ("agence",)


@admin.register(Hotel)
class HotelAdmin(admin.ModelAdmin):
    list_display = ("nom",)
    search_fields = ("nom",)


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ("nom",)
    search_fields = ("nom",)


@admin.register(Vehicule)
class VehiculeAdmin(admin.ModelAdmin):
    list_display = ("immatriculation", "type", "marque", "model", "capacite", "annee", "agence")
    list_filter = ("type", "agence", "annee")
    search_fields = ("immatriculation", "marque", "model")


@admin.register(Chauffeur)
class ChauffeurAdmin(admin.ModelAdmin):
    list_display = ("prenom", "nom", "cin", "agence")
    list_filter = ("agence",)
    search_fields = ("nom", "prenom", "cin")


@admin.register(LanguageMapping)
class LanguageMappingAdmin(admin.ModelAdmin):
    list_display = ("code", "name")
    search_fields = ("code", "name")


@admin.register(FicheMouvement)
class FicheMouvementAdmin(admin.ModelAdmin):
    list_display = (
        "id", "agence", "type", "date", "aeroport",
        "ref", "titulaire", "hotel", "pax", "imported_at",
    )
    list_filter = ("agence", "type", "date", "aeroport")
    search_fields = ("ref", "titulaire", "hotel", "client_to", "numero_vol")
    date_hierarchy = "date"
    autocomplete_fields = ("agence", "created_by")


@admin.register(ImportBatch)
class ImportBatchAdmin(admin.ModelAdmin):
    list_display = ("id", "agence", "user", "label", "created_at")
    list_filter = ("agence", "user")
    search_fields = ("label",)


@admin.register(ImportBatchItem)
class ImportBatchItemAdmin(admin.ModelAdmin):
    list_display = ("batch", "fiche")
    list_filter = ("batch__agence",)
    autocomplete_fields = ("batch", "fiche")


@admin.register(ImportValidationError)
class ImportValidationErrorAdmin(admin.ModelAdmin):
    list_display = ("batch", "excel_row", "field", "message", "created_at")
    list_filter = ("batch",)
    search_fields = ("field", "message")
