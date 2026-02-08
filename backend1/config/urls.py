# backend1/appsMouha/urls.py
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from accounts.auth import LoginView, RefreshAccessView, LogoutView, UserMeAPIView

from apps.views.fiches import UpdateHorairesRamassageAPIView, FicheMouvementViewSet
from apps.views.importers import ImporterChauffeursAPIView, ImporterVehiculesAPIView
from apps.views.missions import MissionViewSet
from apps.views.dossiers_import import ImporterDossierAPIView
from apps.views.Fiches_import import ImporterFicheMouvementAPIView
from apps.views.pdf import ordre_mission_pdf
from apps.views.dossiers_to_fiche import DossiersToFicheAPIView
from apps.views.agences import (
    DemandeInscriptionAgenceViewSet,
    DemandeInscriptionAgencePublicCreateAPIView,
    AgenceVoyageViewSet,
    SendAgencyOtpAPIView,
)
from apps.views.agency_applications import (
    AgencyApplicationCreateAPIView,
    AgencyApplicationResendOtpAPIView,
    AgencyApplicationAdminViewSet,
)
from apps.views.ressources import VehiculeViewSet, ChauffeurViewSet
from apps.views.fiche_manual import FicheMouvementManualCreateAPIView
from apps.views.zones import ZoneViewSet
from apps.views.fournisseur import fournisseur_config, fournisseur_vehicule_tarifs
from apps.views.rentout import RentoutAvailableVehiclesAPIView
from apps.views.excursions import ExcursionTemplateViewSet, ExcursionStepViewSet, ExcursionEventViewSet
from apps.views.views_calendar import CalendarMissionsAPIView, CalendarResourcesAPIView
from apps.views.gestion_suivi import GestionSuiviMissionsView, GestionSuiviMissionOMsView
from apps.views.agences import ChangePasswordView

router = DefaultRouter()
router.register(r"fiches-mouvement", FicheMouvementViewSet)
router.register(r"missions", MissionViewSet, basename="mission")
router.register(r"vehicules", VehiculeViewSet, basename="vehicule")
router.register(r"chauffeurs", ChauffeurViewSet, basename="chauffeur")
router.register(r"zones", ZoneViewSet, basename="zones")
router.register(r"excursion-templates", ExcursionTemplateViewSet, basename="excursion-template")
router.register(r"excursion-steps", ExcursionStepViewSet, basename="excursion-step")
router.register(r"excursion-events", ExcursionEventViewSet, basename="excursion-event")

# demandes d’inscription (1 seule fois)
router.register(
    r"agences/demandes-inscription",
    DemandeInscriptionAgenceViewSet,
    basename="demande-inscription-agence",
)
router.register(r"agences", AgenceVoyageViewSet, basename="agence")

# admin agency applications
router.register(
    r"admin/agency-applications",
    AgencyApplicationAdminViewSet,
    basename="admin-agency-applications",
)

urlpatterns = [
    path("admin/", admin.site.urls),

    # API
    path("api/", include(router.urls)),

    # ✅ Auth PRO (remplace token/ et login/refresh/)
    path("api/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/auth/refresh/", RefreshAccessView.as_view(), name="auth-refresh"),
    path("api/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/auth/me/", UserMeAPIView.as_view(), name="auth-me"),
    
path("api/auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),

    # Calendrier
    path("api/calendar/missions", CalendarMissionsAPIView.as_view()),
    path("api/calendar/resources", CalendarResourcesAPIView.as_view()),

    # PDF
    path("api/ordres-mission/<int:ordre_id>/pdf/", ordre_mission_pdf, name="ordre-mission-pdf"),

    # Gestion suivi
    path("api/gestion/suivi/missions/", GestionSuiviMissionsView.as_view()),
    path("api/gestion/suivi/missions/<int:mission_id>/oms/", GestionSuiviMissionOMsView.as_view()),

    # Import
    path("api/importer-dossier/", ImporterDossierAPIView.as_view(), name="importer-dossier"),
    path("api/importer-fiches/", ImporterFicheMouvementAPIView.as_view(), name="importer-fiches"),
    path("api/importer-vehicules/", ImporterVehiculesAPIView.as_view(), name="importer-vehicules"),
    path("api/importer-chauffeurs/", ImporterChauffeursAPIView.as_view(), name="importer-chauffeurs"),

    # Dossiers -> Fiche
    path("api/dossiers/to-fiche/", DossiersToFicheAPIView.as_view(), name="dossiers_to_fiche"),

    # Update horaires
    path("api/fiches-mouvement/<int:fiche_id>/horaires/", UpdateHorairesRamassageAPIView.as_view(), name="fiche-horaires"),

    # Création manuelle fiche
    path("api/fiches-mouvement/create/", FicheMouvementManualCreateAPIView.as_view(), name="fiche-mouvement-create"),

    # Public demandes inscription (1 seule version, cohérente)
    path("api/public/demandes-inscription/send-otp/", SendAgencyOtpAPIView.as_view(), name="public-agency-send-otp"),
    path("api/public/demandes-inscription/", DemandeInscriptionAgencePublicCreateAPIView.as_view(), name="public-agency-finalize"),

    # Agency applications
    path("api/agency-applications/", AgencyApplicationCreateAPIView.as_view(), name="agency-application-create"),
    path("api/agency-applications/resend-otp/", AgencyApplicationResendOtpAPIView.as_view(), name="agency-application-resend-otp"),

    # Fournisseur
    path("api/fournisseur/config/", fournisseur_config),
    path("api/fournisseur/vehicule-tarifs/", fournisseur_vehicule_tarifs, name="fournisseur_vehicule_tarifs"),

    # Rentout
    path("api/rentout/available-vehicles/", RentoutAvailableVehiclesAPIView.as_view(), name="rentout-available-vehicles"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
