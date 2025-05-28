from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from b2b import views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from b2b.views import CreerFicheMouvementAPIView


router = DefaultRouter()
router.register(r'agences', views.AgenceVoyageViewSet, basename='agence')
router.register(r'vehicules', views.VehiculeViewSet, basename='vehicule')  # pluriel cohérent
router.register(r'chauffeurs', views.ChauffeurViewSet, basename='chauffeur')
router.register(r'premissions', views.PreMissionViewSet, basename='premission')
router.register(r'missions', views.MissionViewSet, basename='mission')
router.register(r'ordres_mission', views.OrdreMissionViewSet, basename='ordremission')
router.register(r'dossiers', views.DossierViewSet, basename='dossier')



app_name = 'b2b'  # utile si tu utilises le namespacing

urlpatterns = [
    # Admin Django
    path('admin/', admin.site.urls),

    # API REST
    path('api/', include(router.urls)),

    # Auth JWT
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Endpoint spécifique pour PDF ordre de mission
    path('api/ordre-mission/<int:ordre_id>/pdf/', views.ordre_mission_pdf, name='ordre_mission_pdf'),

    # Importation des dossiers via fichier
    path('api/importer-dossier/', views.ImporterDossierAPIView.as_view(), name='importer_dossier'),

    path('api/creer-fiche-mouvement/', CreerFicheMouvementAPIView.as_view(), name='creer_fiche_mouvement'),
    
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
