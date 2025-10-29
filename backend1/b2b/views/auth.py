# -*- coding: utf-8 -*-
from __future__ import annotations

from django.contrib.auth import authenticate
from django.utils.timezone import now
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from ..serializers import UserSerializer
from .helpers import _user_agence


def _get_user_role(user):
    # Ajuste si tu as un Profile.role (adminagence / superadmin / etc.)
    if user.is_superuser:
        return "superadmin"
    profile = getattr(user, "profile", None)
    return getattr(profile, "role", "adminagence")


class LoginView(APIView):
    """
    Endpoint de login sécurisé :
    POST {username, password} -> {access, refresh, user, role, agence_id}
    """
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        if not username or not password:
            return Response(
                {"detail": "Identifiants requis (username, password)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request=request, username=username, password=password)
        if not user:
            # Même message générique pour ne pas révéler si l'utilisateur existe
            return Response(
                {"detail": "Nom d'utilisateur ou mot de passe incorrect"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Génération des tokens JWT
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        # Payload enrichi (facultatif)
        role = _get_user_role(user)
        agence = _user_agence(user)
        agence_id = getattr(agence, "id", None)

        return Response(
            {
                "access": str(access),
                "refresh": str(refresh),
                "role": role,
                "agence_id": agence_id,
                "user": UserSerializer(user).data,
                "issued_at": now().isoformat(),
            },
            status=status.HTTP_200_OK,
        )


class TokenRefreshAPIView(APIView):
    """
    Option custom si tu préfères /api/login/refresh/ ; sinon garde SimpleJWT /api/token/refresh/
    POST {refresh} -> {access}
    """
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("refresh")
        if not token:
            return Response({"detail": "Refresh token is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            refresh = RefreshToken(token)
            return Response({"access": str(refresh.access_token)}, status=status.HTTP_200_OK)
        except TokenError as e:
            return Response({"detail": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class UserMeAPIView(APIView):
    """
    GET -> renvoie l'utilisateur courant (Authorization: Bearer <access>)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
