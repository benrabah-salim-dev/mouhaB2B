# b2bMouha/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenObtainPairView
from b2b import views
from b2b.views import (
    CreerFicheMouvementAPIView,
    LoginView,
    FichesMouvementListAPIView,
    OrdreMissionViewSet,
    ordre_mission_pdf,
    PublicResourceSearchAPIView  
)

router = DefaultRouter()
router.register(r"agences", views.AgenceVoyageViewSet, basename="agence")
router.register(r"vehicules", views.VehiculeViewSet, basename="vehicule")
router.register(r"chauffeurs", views.ChauffeurViewSet, basename="chauffeur")
router.register(r"premissions", views.PreMissionViewSet, basename="premission")
router.register(r"missions", views.MissionViewSet, basename="mission")
router.register(r"ordres-mission", OrdreMissionViewSet, basename="ordremission")
router.register(r"dossiers", views.DossierViewSet, basename="dossier")
router.register(r"hotels", views.HotelViewSet, basename="hotel")
router.register(r"fiches-mouvement", views.FicheMouvementViewSet, basename="fichemouvement")
router.register(r"fiches-mouvement-items", views.FicheMouvementItemViewSet, basename="fichemouvementitem")

urlpatterns = [
    path("admin/", admin.site.urls),

    # API via ViewSets
    path("api/", include(router.urls)),

    # Authentification
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/login/", LoginView.as_view(), name="login"),

    # Endpoints custom
    path("api/ordres-mission/<int:ordre_id>/pdf/", ordre_mission_pdf, name="ordre-mission-pdf"),
    path("api/importer-dossier/", views.ImporterDossierAPIView.as_view(), name="importer_dossier"),
    path("api/importer-vehicules/", views.ImporterVehiculesAPIView.as_view(), name="importer_vehicules"),
    path("api/importer-chauffeurs/", views.ImporterChauffeursAPIView.as_view(), name="importer_chauffeurs"),
    path("api/creer-fiche-mouvement/", CreerFicheMouvementAPIView.as_view(), name="creer_fiche_mouvement"),
    path("api/fiches-mouvement-list/", FichesMouvementListAPIView.as_view(), name="fiches-mouvement-list"),
    path("api/languages/", views.LanguageMappingListView.as_view(), name="languages"),
    path("api/public/resources/search/", PublicResourceSearchAPIView.as_view(), name="public-resources-search"),
    path("public/resources/search/", PublicResourceSearchAPIView.as_view(), name="public-resources-search-noapi"),
]

