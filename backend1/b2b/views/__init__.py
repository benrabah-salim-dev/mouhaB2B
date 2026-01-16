"""
Expose uniquement des objets sûrs pour éviter les imports circulaires.
Ne rien importer depuis les serializers ou les models ici.
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

# =========================
# Fiches (tolérant aux noms)
# =========================
FicheMouvementViewSet = None
try:
    from .fiches_mouvement import FicheMouvementViewSet  # ✅ nom recommandé
except ModuleNotFoundError:
    try:
        from .fiches import FicheMouvementViewSet  # ✅ fallback ancien nom
    except ModuleNotFoundError:
        FicheMouvementViewSet = None

# Public
from .public import PublicResourceSearchAPIView

# Importers
from .importers import (
    ImporterVehiculesAPIView,
    ImporterChauffeursAPIView,
    ImporterFicheMouvementAPIView,
    EnrichHotelAddressesAPIView,
)
from .dossiers_import import ImporterDossierAPIView

# ⚠️ IMPORTANT : on N'IMPORTE PAS missions ici (sinon circular)
# ordre_mission_pdf doit être importé directement dans urls.py depuis b2b.views.missions

__all__ = [
    "_user_role",
    "_user_agence",
    "_ensure_same_agence_or_superadmin",
    "IsSuperAdminRole",
    "LoginView",
    "TokenRefreshAPIView",
    "UserMeAPIView",
    "FicheMouvementViewSet",
    "PublicResourceSearchAPIView",
    "ImporterDossierAPIView",
    "ImporterVehiculesAPIView",
    "ImporterChauffeursAPIView",
    "ImporterFicheMouvementAPIView",
    "EnrichHotelAddressesAPIView",
]
