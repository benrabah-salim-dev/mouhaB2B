from rest_framework.exceptions import PermissionDenied

def _ensure_same_agence_or_superadmin(request, agence):
    """
    Vérifie que l'utilisateur a le droit d'accéder à cette agence :
    - Soit il est superadmin
    - Soit il appartient à la même agence
    """
    user = request.user

    # Si pas authentifié → interdit
    if not user.is_authenticated:
        raise PermissionDenied("Authentification requise.")

    # Si superadmin → OK
    if hasattr(user, "role") and user.role.lower() == "superadmin":
        return True

    # Si l'utilisateur appartient à la même agence → OK
    if hasattr(user, "agence_id") and str(user.agence_id) == str(agence.id):
        return True

    # Sinon → interdit
    raise PermissionDenied("Accès refusé : vous n'avez pas les droits nécessaires.")
