# -*- coding: utf-8 -*-
from __future__ import annotations
from django.contrib.auth.models import User
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from ..serializers import UserSerializer
from .helpers import _user_agence

class TokenRefresh(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        token = request.data.get("refresh")
        if not token:
            return Response({"error": "Refresh token is required."}, status=400)
        try:
            refresh = RefreshToken(token)
            return Response({"access": str(refresh.access_token)}, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

class LoginView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = User.objects.filter(username=username).first()
        if not user or not user.check_password(password):
            return Response({"detail": "Nom d'utilisateur ou mot de passe incorrect"}, status=401)
        refresh = RefreshToken.for_user(user)
        role = "superadmin" if user.is_superuser else getattr(getattr(user, "profile", None), "role", "adminagence")
        agence_id = getattr(_user_agence(user), "id", None)
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "role": role,
            "agence_id": agence_id,
        }, status=200)

class UserMeAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response(UserSerializer(request.user).data)
