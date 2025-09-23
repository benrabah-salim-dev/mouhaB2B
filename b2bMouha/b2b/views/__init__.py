# b2b/views/__init__.py

# Regroupe et ré-exporte les vues pour que `from b2b import views` fonctionne partout.

# Helpers / sécurité
from .helpers import (
    _user_role,
    _user_agence,
    _ensure_same_agence_or_superadmin,
    IsSuperAdminRole,
)

# Auth
from .auth import (
    LoginView,
    TokenRefresh,
    UserMeAPIView,
)

# ViewSets cœur (agences, véhicules, chauffeurs, hôtels, dossiers, pré-missions, missions, ordres)
from .core import (
    AgenceVoyageViewSet,
    VehiculeViewSet,
    ChauffeurViewSet,
    HotelViewSet,
    DossierViewSet,
    PreMissionViewSet,
    MissionViewSet,
    OrdreMissionViewSet,
)

# Import Excel
from .importers import (
    ImporterDossierAPIView,
    ImporterVehiculesAPIView,
    ImporterChauffeursAPIView,
)

# Fiches de mouvement / PDF OM
from .fiches import (
    FichesMouvementListAPIView,
    CreerFicheMouvementAPIView,
    FicheMouvementViewSet,
    FicheMouvementItemViewSet,
    ordre_mission_pdf,
)


# Public / inter-agences
from .public import (
    PublicResourceSearchAPIView,
)

# Languages
from .languages import (
    LanguageMappingListView,
)


__all__ = [
    # helpers
    "_user_role", "_user_agence", "_ensure_same_agence_or_superadmin", "IsSuperAdminRole",
    # auth
    "LoginView", "TokenRefresh", "UserMeAPIView",
    # core
    "AgenceVoyageViewSet", "VehiculeViewSet", "ChauffeurViewSet", "HotelViewSet",
    "DossierViewSet", "PreMissionViewSet", "MissionViewSet", "OrdreMissionViewSet",
    # importers
    "ImporterDossierAPIView", "ImporterVehiculesAPIView", "ImporterChauffeursAPIView",
    # fiches
    "CreerFicheMouvementAPIView", "FichesMouvementListAPIView",
    "FicheMouvementViewSet", "FicheMouvementItemViewSet", "ordre_mission_pdf",
    # public
    "PublicResourceSearchAPIView",
    # languages
    "LanguageMappingListView",
]
