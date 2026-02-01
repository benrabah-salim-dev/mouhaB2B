# b2b/views/auth_safe.py
from rest_framework import serializers
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

User = get_user_model()

class SafeTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        try:
            return super().validate(attrs)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                {"detail": "Utilisateur introuvable (token expiré ou compte supprimé)."},
                code="user_not_found",
            )

class SafeTokenRefreshView(TokenRefreshView):
    serializer_class = SafeTokenRefreshSerializer



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    p = getattr(user, "profile", None)
    ag = getattr(p, "agence", None) if p else None
    return Response({
        "id": user.id,
        "username": user.get_username(),
        "email": user.email,
        "role": getattr(p, "role", "lecteur"),
        "agence_id": getattr(ag, "id", None),
        "agence_nom": getattr(ag, "nom", None),
    })