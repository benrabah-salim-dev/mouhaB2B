# backend1/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from b2b import views
from b2b.views import LoginView, ordre_mission_pdf
from b2b.views.fiches import (
    FichesMouvementListAPIView,
    FicheMouvementHotelScheduleAPIView,
    FicheMouvementAssignResourcesAPIView,
    CreerFicheMouvementAPIView,
    FicheMouvementViewSet,
    FicheMouvementItemViewSet,
)
from b2b.views.dossiers_import import DossiersImportablesAPIView
from b2b.views.import_batches import (
    ImportBatchListAPIView,
    ImportBatchRemainingDossiersAPIView,
    ActiveBatchItemsAPIView,
)

router = DefaultRouter()
router.register(r"agences", views.AgenceVoyageViewSet, basename="agence")
router.register(r"vehicules", views.VehiculeViewSet, basename="vehicule")
router.register(r"chauffeurs", views.ChauffeurViewSet, basename="chauffeur")
router.register(r"premissions", views.PreMissionViewSet, basename="premission")
router.register(r"missions", views.MissionViewSet, basename="mission")
router.register(r"ordres-mission", views.OrdreMissionViewSet, basename="ordremission")
router.register(r"dossiers", views.DossierViewSet, basename="dossier")
router.register(r"hotels", views.HotelViewSet, basename="hotel")

# ✅ une seule déclaration (depuis b2b.views.fiches)
router.register(r"fiches-mouvement", FicheMouvementViewSet, basename="fichemouvement")
router.register(r"fiches-mouvement-items", FicheMouvementItemViewSet, basename="fichemouvementitem")

urlpatterns = [
    path("admin/", admin.site.urls),

    # API via ViewSets
    path("api/", include(router.urls)),

    # Auth
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/login/", LoginView.as_view(), name="login"),

    # PDF Ordre de mission
    path("api/ordres-mission/<int:ordre_id>/pdf/", ordre_mission_pdf, name="ordre-mission-pdf"),

    # Imports
    path("api/importer-dossier/", views.ImporterDossierAPIView.as_view(), name="importer_dossier"),
    path("api/importer-vehicules/", views.ImporterVehiculesAPIView.as_view(), name="importer_vehicules"),
    path("api/importer-chauffeurs/", views.ImporterChauffeursAPIView.as_view(), name="importer_chauffeurs"),

    # Création d'une fiche (optionnel si tu utilises POST sur le ViewSet)
    path("api/creer-fiche-mouvement/", CreerFicheMouvementAPIView.as_view(), name="creer_fiche_mouvement"),

    # Liste “Mes départs / Mes arrivées”
    path("api/fiches-mouvement-list/", FichesMouvementListAPIView.as_view(), name="fiches-mouvement-list"),

    # Planning hôtel & assignation ressources
    path("api/fiches-mouvement/<int:pk>/hotel-schedule/", FicheMouvementHotelScheduleAPIView.as_view(), name="fiche-hotel-schedule"),
    path("api/fiches-mouvement/<int:pk>/assign-resources/", FicheMouvementAssignResourcesAPIView.as_view(), name="fiche-assign-resources"),

    # Dossiers importables + batches d'import (si utilisés)
    path("api/dossiers-importables/", DossiersImportablesAPIView.as_view(), name="dossiers-importables"),
    path("api/import-batches/", ImportBatchListAPIView.as_view(), name="import-batch-list"),
    path("api/import-batches/<uuid:batch_id>/dossiers/", ImportBatchRemainingDossiersAPIView.as_view(), name="import-batch-dossiers"),
    path("api/active-import-items/", ActiveBatchItemsAPIView.as_view(), name="active-import-items"),
]
