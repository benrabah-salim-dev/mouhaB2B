# urls.py
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from b2b.views import LoginView
from b2b.views.fiches import (
    FichesAggregationsAPIView,
    UpdateHorairesRamassageAPIView,
    FicheMouvementViewSet,
)
from b2b.views.importers import (
    ImporterChauffeursAPIView,
    ImporterVehiculesAPIView,
)
from b2b.views.missions import MissionViewSet
from b2b.views.dossiers_import import ImporterDossierAPIView
from b2b.views.Fiches_import import ImporterFicheMouvementAPIView
from b2b.views.pdf import ordre_mission_pdf
from b2b.views.dossiers_to_fiche import DossiersToFicheAPIView
from b2b.views.agences import (
    DemandeInscriptionAgenceViewSet,
    DemandeInscriptionAgencePublicCreateAPIView,
    AgenceVoyageViewSet,
    SendAgencyOtpAPIView,
)
from b2b.views.agency_applications import (
    AgencyApplicationCreateAPIView,
    AgencyApplicationResendOtpAPIView,
    AgencyApplicationAdminViewSet,
)
from b2b.views.ressources import VehiculeViewSet, ChauffeurViewSet
from b2b.views.fiche_manual import FicheMouvementManualCreateAPIView
from b2b.views.zones import ZoneViewSet
from b2b.views.fournisseur import fournisseur_config, fournisseur_vehicule_tarifs
from b2b.views.rentout import RentoutAvailableVehiclesAPIView

from b2b.views.excursions import (
    ExcursionTemplateViewSet,
    ExcursionStepViewSet,
    ExcursionEventViewSet,
)
from b2b.views.views_calendar import CalendarMissionsAPIView, CalendarResourcesAPIView
from b2b.views.gestion_suivi import (
    GestionSuiviMissionsView,
    GestionSuiviMissionOMsView,
)


router = DefaultRouter()

router.register(r"fiches-mouvement", FicheMouvementViewSet)
router.register(r"missions", MissionViewSet, basename="mission")
router.register(
    r"agences/demandes-inscription",
    DemandeInscriptionAgenceViewSet,
    basename="demande-inscription-agence",
)
router.register(
    r"admin/agency-applications",
    AgencyApplicationAdminViewSet,
    basename="admin-agency-applications",
)
router.register(r"agences", AgenceVoyageViewSet, basename="agence")
router.register(
    r"agences/demandes-inscription",
    DemandeInscriptionAgenceViewSet,
    basename="demande-inscription",
)
router.register(r"vehicules", VehiculeViewSet, basename="vehicule")
router.register(r"chauffeurs", ChauffeurViewSet, basename="chauffeur")
router.register(r"zones", ZoneViewSet, basename="zones")
router.register(r"excursion-templates", ExcursionTemplateViewSet, basename="excursion-template")
router.register(r"excursion-steps", ExcursionStepViewSet, basename="excursion-step")
router.register(r"excursion-events", ExcursionEventViewSet, basename="excursion-event")


urlpatterns = [
    path("admin/", admin.site.urls),

    # DRF Router
    path("api/", include(router.urls)),

    # Auth
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/login/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/login/", LoginView.as_view(), name="login"),
    # Fiches - Agrégations
    path("api/calendar/missions", CalendarMissionsAPIView.as_view()),
    path("api/calendar/resources", CalendarResourcesAPIView.as_view()),
    # PDF OM
    path(
        "api/ordres-mission/<int:ordre_id>/pdf/",
        ordre_mission_pdf,
        name="ordre-mission-pdf",
    ),
    # Gestion suivi missions
    path("api/gestion/suivi/missions/", GestionSuiviMissionsView.as_view()),
    path("api/gestion/suivi/missions/<int:mission_id>/oms/", GestionSuiviMissionOMsView.as_view()),
    # Import
    path(
        "api/importer-dossier/",
        ImporterDossierAPIView.as_view(),
        name="importer-dossier",
    ),
    path(
        "api/importer-fiches/",
        ImporterFicheMouvementAPIView.as_view(),
        name="importer-fiches",
    ),

    # Dossiers -> Fiche (GET liste / POST création)
    path(
        "api/dossiers/to-fiche/",
        DossiersToFicheAPIView.as_view(),
        name="dossiers_to_fiche",
    ),
    path(
        "api/fiches-mouvement/<int:fiche_id>/horaires/",
        UpdateHorairesRamassageAPIView.as_view(),
        name="fiche-horaires",
    ),

    # Demandes inscription / Agency applications
    path(
        "api/public/demandes-inscription/",
        DemandeInscriptionAgencePublicCreateAPIView.as_view(),
        name="demande-inscription-public",
    ),
    path(
        "api/agency-applications/",
        AgencyApplicationCreateAPIView.as_view(),
        name="agency-application-create",
    ),
    path(
        "api/agency-applications/resend-otp/",
        AgencyApplicationResendOtpAPIView.as_view(),
        name="agency-application-resend-otp",
    ),

    # Public OTP
    path(
        "public/demandes-inscription/send-otp/",
        SendAgencyOtpAPIView.as_view(),
        name="send-agency-otp",
    ),
    path(
        "public/demandes-inscription/",
        DemandeInscriptionAgencePublicCreateAPIView.as_view(),
        name="demande-inscription-agence",
    ),
    path(
        "api/public/demandes-inscription/send-otp/",
        SendAgencyOtpAPIView.as_view(),
        name="public-agency-send-otp",
    ),
    path(
        "api/public/demandes-inscription/",
        DemandeInscriptionAgencePublicCreateAPIView.as_view(),
        name="public-agency-finalize",
    ),

    # Import véhicules / chauffeurs
    path(
        "api/importer-vehicules/",
        ImporterVehiculesAPIView.as_view(),
        name="importer-vehicules",
    ),
    path(
        "api/importer-chauffeurs/",
        ImporterChauffeursAPIView.as_view(),
        name="importer-chauffeurs",
    ),

    # Fiche mouvement manuelle
    path(
        "api/fiches-mouvement/create/",
        FicheMouvementManualCreateAPIView.as_view(),
        name="fiche-mouvement-create",
    ),

    # Fournisseur
    path("api/fournisseur/config/", fournisseur_config),
    path(
        "api/fournisseur/vehicule-tarifs/",
        fournisseur_vehicule_tarifs,
        name="fournisseur_vehicule_tarifs",
    ),

    # 🔹 RENTOÛT — ici on met bien le préfixe "api/"
    path(
        "api/rentout/available-vehicles/",
        RentoutAvailableVehiclesAPIView.as_view(),
        name="rentout-available-vehicles",
    ),

]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
