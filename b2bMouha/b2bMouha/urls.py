from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from b2b import views
from b2b.views import CreerFicheMouvementAPIView

from django.urls import path
from b2b.views import LoginView,TokenRefresh

router = DefaultRouter()
router.register(r'agences', views.AgenceVoyageViewSet, basename='agence')
router.register(r'vehicules', views.VehiculeViewSet, basename='vehicule')
router.register(r'chauffeurs', views.ChauffeurViewSet, basename='chauffeur')
router.register(r'premissions', views.PreMissionViewSet, basename='premission')
router.register(r'missions', views.MissionViewSet, basename='mission')
router.register(r'ordres_mission', views.OrdreMissionViewSet, basename='ordremission')
router.register(r'dossiers', views.DossierViewSet, basename='dossier')
router.register(r'hotels', views.HotelViewSet, basename='hotel')

urlpatterns = [
    
    
    path('admin/', admin.site.urls),

    # API endpoints via ViewSets
    path('api/', include(router.urls)),

    # Authentification JWT
    path('api/login/', LoginView.as_view(), name='login'),
   # path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
   # path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Endpoints personnalisés
    path('api/ordre-mission/<int:ordre_id>/pdf/', views.ordre_mission_pdf, name='ordre_mission_pdf'),
    path('api/importer-dossier/', views.ImporterDossierAPIView.as_view(), name='importer_dossier'),
    path('api/creer-fiche-mouvement/', CreerFicheMouvementAPIView.as_view(), name='creer_fiche_mouvement'),
]
