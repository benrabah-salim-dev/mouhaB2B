# b2bMouha/urls.py
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenObtainPairView

# ⬇️ Import unique : le paquet 'b2b.views' (qui ré-exporte ce qu’il faut)
from b2b import views

router = DefaultRouter()
router.register(r"agences", views.AgenceVoyageViewSet, basename="agence")
router.register(r"vehicules", views.VehiculeViewSet, basename="vehicule")
router.register(r"chauffeurs", views.ChauffeurViewSet, basename="chauffeur")
router.register(r"premissions", views.PreMissionViewSet, basename="premission")
router.register(r"missions", views.MissionViewSet, basename="mission")
router.register(r"ordres-mission", views.OrdreMissionViewSet, basename="ordremission")
router.register(r"dossiers", views.DossierViewSet, basename="dossier")
router.register(r"hotels", views.HotelViewSet, basename="hotel")
router.register(r"fiches-mouvement", views.FicheMouvementViewSet, basename="fichemouvement")
router.register(r"fiches-mouvement-items", views.FicheMouvementItemViewSet, basename="fichemouvementitem")

urlpatterns = [
    path("admin/", admin.site.urls),

    # API via ViewSets
    path("api/", include(router.urls)),

    # Authentification
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair")
,
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/login/", views.LoginView.as_view(), name="login"),

    # Endpoints custom
    path("api/ordres-mission/<int:ordre_id>/pdf/", views.ordre_mission_pdf, name="ordre-mission-pdf"),

    path("api/importer-dossier/", views.ImporterDossierAPIView.as_view(), name="importer_dossier"),
    path("api/importer-vehicules/", views.ImporterVehiculesAPIView.as_view(), name="importer_vehicules"),
    path("api/importer-chauffeurs/", views.ImporterChauffeursAPIView.as_view(), name="importer_chauffeurs"),

    path("api/creer-fiche-mouvement/", views.CreerFicheMouvementAPIView.as_view(), name="creer_fiche_mouvement"),
    path("api/fiches-mouvement-list/", views.FichesMouvementListAPIView.as_view(), name="fiches-mouvement-list"),
    path("api/languages/", views.LanguageMappingListView.as_view(), name="languages"),
    path("api/public/resources/search/", views.PublicResourceSearchAPIView.as_view(), name="public-resources-search"),

    # alias public sans /api
    path("public/resources/search/", views.PublicResourceSearchAPIView.as_view(), name="public-resources-search-noapi"),
]
