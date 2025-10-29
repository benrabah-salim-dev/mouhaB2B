# b2b/views/__init__.py
"""
Expose uniquement ce qui est sûr (pas d'import circulaire).
Ne PAS ré-exporter FichesMouvementListAPIView ici : on l'importe
directement depuis b2b.views.fiches dans urls.py.
"""

# Helpers / sécurité
from .helpers import (
    _user_role,
    _user_agence,
    _ensure_same_agence_or_superadmin,
    IsSuperAdminRole,
)

# Auth
from .auth import LoginView, TokenRefreshAPIView, UserMeAPIView

# ViewSets cœur
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
# ⚠️ On N'IMPORTE PAS FichesMouvementListAPIView ici pour éviter les cycles.
from .fiches import (
    CreerFicheMouvementAPIView,
    FicheMouvementViewSet,
    FicheMouvementItemViewSet,
    ordre_mission_pdf,
)

# Public / inter-agences
from .public import PublicResourceSearchAPIView

# Languages
from .languages import LanguageMappingListView


__all__ = [
    # helpers
    "_user_role",
    "_user_agence",
    "_ensure_same_agence_or_superadmin",
    "IsSuperAdminRole",
    # auth
    "LoginView",
    "TokenRefreshAPIView",
    "UserMeAPIView",
    # core
    "AgenceVoyageViewSet",
    "VehiculeViewSet",
    "ChauffeurViewSet",
    "HotelViewSet",
    "DossierViewSet",
    "PreMissionViewSet",
    "MissionViewSet",
    "OrdreMissionViewSet",
    # importers
    "ImporterDossierAPIView",
    "ImporterVehiculesAPIView",
    "ImporterChauffeursAPIView",
    # fiches
    "CreerFicheMouvementAPIView",
    "FicheMouvementViewSet",
    "FicheMouvementItemViewSet",
    "ordre_mission_pdf",
    # public
    "PublicResourceSearchAPIView",
    # languages
    "LanguageMappingListView",
]
