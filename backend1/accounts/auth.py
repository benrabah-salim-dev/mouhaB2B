# backend1/b2b/views/auth.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from django.conf import settings
from django.contrib.auth import authenticate
from django.utils.timezone import now

from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from apps.serializers import UserSerializer
from apps.views.helpers import _user_agence


def _get_user_role(user):
    if user.is_superuser:
        return "superadmin"
    profile = getattr(user, "profile", None)
    return getattr(profile, "role", "adminagence")


def _set_refresh_cookie(resp: Response, refresh_token: str) -> None:
    # Cookie HttpOnly => inaccessible au JS (meilleur contre XSS)
    resp.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,   # True en prod HTTPS
        samesite="Lax",
        path="/apps/auth/",
        max_age=14 * 24 * 3600,
    )


def _delete_refresh_cookie(resp: Response) -> None:
    resp.delete_cookie("refresh_token", path="/api/auth/")


class LoginView(APIView):
    """
    POST /api/auth/login/
    Body: {username, password}
    -> JSON: {access, user, role, agence_id}
    -> Cookie HttpOnly: refresh_token
    """
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        if not username or not password:
            return Response({"detail": "Identifiants requis."}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request=request, username=username, password=password)
        if not user:
            return Response({"detail": "Nom d'utilisateur ou mot de passe incorrect"}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        agence = _user_agence(user)
        resp = Response(
            {
                "access": str(access),
                "role": _get_user_role(user),
                "agence_id": getattr(agence, "id", None),
                "user": UserSerializer(user).data,
                "issued_at": now().isoformat(),
            },
            status=status.HTTP_200_OK,
        )

        _set_refresh_cookie(resp, str(refresh))
        return resp


class RefreshAccessView(APIView):
    """
    POST /api/auth/refresh/
    -> lit refresh_token dans cookie HttpOnly
    -> renvoie {access}
    """
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.COOKIES.get("refresh_token")
        if not token:
            return Response({"detail": "Refresh token manquant (cookie)."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(token)
            access = refresh.access_token
            resp = Response({"access": str(access)}, status=status.HTTP_200_OK)
            return resp
        except TokenError:
            resp = Response({"detail": "Refresh token invalide/expiré."}, status=status.HTTP_401_UNAUTHORIZED)
            _delete_refresh_cookie(resp)
            return resp


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    -> supprime cookie refresh_token
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        resp = Response({"detail": "Déconnecté."}, status=status.HTTP_200_OK)
        _delete_refresh_cookie(resp)
        return resp


class UserMeAPIView(APIView):
    """
    GET /api/auth/me/
    Header Authorization: Bearer <access>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
