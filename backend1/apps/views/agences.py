# apps/views/agences.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from django.utils import timezone
from django.utils.crypto import get_random_string
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.core.mail import send_mail
from django.conf import settings
from django.core.cache import cache
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError

from rest_framework import generics, permissions, viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import AgencyApplication, AgenceVoyage
from apps.serializers import (
    AgencyApplicationAdminSerializer,
    AgencyApplicationPublicSerializer,
    AgenceVoyageSerializer,
)

User = get_user_model()


# =========================
# Helpers généraux
# =========================

def _clean_email(raw: str) -> str:
    """
    Nettoie un email reçu du front :
    - trim espaces
    - retire quotes simples/doubles si le front envoie "'mail@gmail.com'" ou '"mail@gmail.com"'
    - lower
    """
    v = (raw or "").strip()

    # retire quotes externes si présentes
    if len(v) >= 2 and ((v[0] == v[-1] == "'") or (v[0] == v[-1] == '"')):
        v = v[1:-1].strip()

    # certains payloads peuvent encore contenir des quotes parasites
    v = v.replace("\u2019", "'").strip()  # apostrophe typographique
    return v.lower()


def generate_random_password(length: int = 12) -> str:
    """
    Génère un mot de passe aléatoire compatible avec Django 5.
    """
    allowed_chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return get_random_string(length, allowed_chars)


def send_agency_credentials_email(instance: AgencyApplication, username: str, password: str) -> None:
    """
    Envoie un email au représentant de l'agence avec ses identifiants
    après validation de la demande.
    """
    to_email = _clean_email(instance.rep_email) or _clean_email(instance.company_email)
    if not to_email:
        return

    subject = "Vos accès SMEKS – Espace Agence"
    message = (
        f"Bonjour {instance.rep_prenom} {instance.rep_nom},\n\n"
        f"Votre inscription a été validée.\n\n"
        f"Voici vos identifiants :\n"
        f"- Nom d'utilisateur : {username}\n"
        f"- Mot de passe : {password}\n\n"
        f"Merci de changer votre mot de passe lors de votre première connexion.\n\n"
        f"Cordialement,\n"
        f"L'équipe SMEKS"
    )

    # IMPORTANT: DEFAULT_FROM_EMAIL doit être une vraie adresse email
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "") or ""
    from_email = from_email.strip()

    send_mail(
        subject,
        message,
        from_email,
        [to_email],
        fail_silently=False,
    )


def is_superadmin(user) -> bool:
    """
    Considère comme superadmin :
    - superuser Django
    - ou user.profile.role == "superadmin"
    """
    try:
        if user.is_superuser:
            return True
        profile = getattr(user, "profile", None)
        if profile and getattr(profile, "role", None) == "superadmin":
            return True
    except Exception:
        pass
    return False


def _ensure_user_and_agence_from_application(app: AgencyApplication):
    """
    À partir d'une AgencyApplication, garantit l'existence
    d'un User et d'une AgenceVoyage cohérents.

    Retourne (user, agence, raw_password)
    - raw_password est None si on réutilise un utilisateur existant
      (donc pas d'envoi de mot de passe)
    """
    from apps.models import Profile  # import local pour éviter cycles

    agence = app.agence
    raw_password = None
    user = None

    rep_email = _clean_email(app.rep_email)

    # 1) USER : réutiliser si possible, sinon créer
    if agence:
        user = agence.user
    else:
        user = User.objects.filter(email=rep_email).first()

    if not user:
        base_username = f"agence_{app.id}"
        username = base_username
        i = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}_{i}"
            i += 1

        raw_password = generate_random_password()
        user = User.objects.create_user(
            username=username,
            password=raw_password,
            first_name=app.rep_prenom,
            last_name=app.rep_nom,
            email=rep_email,
        )

    # 2) AGENCE : réutiliser ou get_or_create (idempotent)
    if not agence:
        defaults = {
            # Entreprise
            "nom": app.legal_name,
            "rne": app.rne,
            "code_fiscal": app.code_fiscal,
            "code_categorie": app.code_categorie,
            "etab_secondaire": app.etab_secondaire,
            "logo_file": app.logo_file,
            "pays": app.company_country,
            "adresse": app.company_address,
            "email": _clean_email(app.company_email),
            "telephone": app.company_phone,
            # Représentant
            "rep_prenom": app.rep_prenom,
            "rep_nom": app.rep_nom,
            "rep_cin": app.rep_cin,
            "rep_date_naissance": app.rep_date_naissance,
            "rep_email": rep_email,
            "rep_phone": app.rep_phone,
        }

        agence, created = AgenceVoyage.objects.get_or_create(
            user=user,
            defaults=defaults,
        )

        if not created:
            changed = False
            for field, value in defaults.items():
                if value and getattr(agence, field) in (None, ""):
                    setattr(agence, field, value)
                    changed = True
            if changed:
                agence.save()

    # 3) Lier le Profile au bon rôle + agence
    profile, _ = Profile.objects.get_or_create(
        user=user,
        defaults={"role": "adminagence"},
    )
    if profile.role != "adminagence":
        profile.role = "adminagence"
        profile.save(update_fields=["role"])
    if agence and profile.agence_id != agence.id:
        profile.agence = agence
        profile.save(update_fields=["agence"])

    # 4) Mise à jour du lien sur la demande
    app.agence = agence
    app.save(update_fields=["agence"])

    return user, agence, raw_password


# =========================
# Endpoint PUBLIC – envoi OTP (aucune création en base)
# =========================

class SendAgencyOtpAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        rep_email = _clean_email(request.data.get("rep_email"))
        company_email = _clean_email(request.data.get("company_email"))

        # Priorité : email représentant, sinon entreprise
        email = rep_email or company_email

        rep_prenom = (request.data.get("rep_prenom") or "").strip()
        rep_nom = (request.data.get("rep_nom") or "").strip()
        legal_name = (request.data.get("legal_name") or "").strip()

        # DEBUG terminal Django
        print("SEND-OTP payload:", {
            "rep_email": rep_email,
            "company_email": company_email,
            "chosen_email": email,
        })

        if not email:
            return Response(
                {"detail": "E-mail du représentant ou de l'entreprise requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Valide le format email
        try:
            validate_email(email)
        except DjangoValidationError:
            return Response(
                {"detail": "Adresse e-mail invalide.", "email": email},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp_code = get_random_string(6, allowed_chars="0123456789")

        cache_key = f"agency_otp:{email}"
        cache.set(cache_key, otp_code, timeout=15 * 60)

        subject = "Code de vérification de votre inscription – SMEKS"
        message = (
            f"Bonjour {rep_prenom} {rep_nom},\n\n"
            f"Merci pour votre demande d'inscription pour l'agence \"{legal_name}\".\n\n"
            f"Voici votre code de vérification : {otp_code}\n"
            f"Ce code est valable 15 minutes pour finaliser votre inscription.\n\n"
            f"Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message.\n\n"
            f"Cordialement,\n"
            f"L'équipe SMEKS"
        )

        from_email = (getattr(settings, "DEFAULT_FROM_EMAIL", "") or "").strip()

        # IMPORTANT: si from_email vide -> Gmail refuse / erreur "Invalid address"
        if not from_email:
            return Response(
                {"detail": "Erreur configuration email", "error": "DEFAULT_FROM_EMAIL manquant"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            sent = send_mail(subject, message, from_email, [email], fail_silently=False)
            print("SEND-OTP sent:", sent, "to:", email, "from:", from_email)
        except Exception as e:
            print("SEND-OTP ERROR:", repr(e))
            return Response(
                {"detail": "Erreur envoi email", "error": repr(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"detail": "Code de vérification envoyé."}, status=status.HTTP_200_OK)


# =========================
# Endpoint PUBLIC – finalisation après vérif OTP
# =========================

class DemandeInscriptionAgencePublicCreateAPIView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = AgencyApplicationPublicSerializer

    def create(self, request, *args, **kwargs):
        otp_code = (request.data.get("otp_code") or "").strip()

        rep_email = _clean_email(request.data.get("rep_email"))
        company_email = _clean_email(request.data.get("company_email"))
        email = rep_email or company_email

        if not otp_code or not email:
            return Response(
                {"detail": "Code de vérification et e-mail sont requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cache_key = f"agency_otp:{email}"
        expected_otp = cache.get(cache_key)

        if not expected_otp:
            return Response(
                {"detail": "Code de vérification expiré ou introuvable. Merci de redemander un code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp_code != expected_otp:
            return Response(
                {"detail": "Code de vérification invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cache.delete(cache_key)

        data = request.data.copy()

        # rep_date_naissance optionnel
        rep_dn = (data.get("rep_date_naissance") or "").strip()
        if not rep_dn:
            data.pop("rep_date_naissance", None)

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        app = AgencyApplication.objects.create(
            **validated,
            statut="en_attente",
            otp_verified=True,
            otp_code=otp_code,
        )

        ser = AgencyApplicationAdminSerializer(app)
        headers = self.get_success_headers(ser.data)
        return Response(
            {
                "detail": "Votre demande a été enregistrée. Elle sera examinée par un administrateur.",
                "demande": ser.data,
            },
            status=status.HTTP_201_CREATED,
            headers=headers,
        )


# =========================
# Back-office gestion demandes (superadmin)
# =========================

class DemandeInscriptionAgenceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AgencyApplication.objects.all().order_by("-created_at")
    serializer_class = AgencyApplicationAdminSerializer

    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]

    search_fields = [
        "legal_name",
        "rne",
        "code_fiscal",
        "company_country",
        "company_email",
        "company_phone",
        "rep_nom",
        "rep_prenom",
        "rep_cin",
    ]
    ordering_fields = ["created_at", "legal_name", "statut"]

    def get_queryset(self):
        if is_superadmin(self.request.user):
            return super().get_queryset()
        return AgencyApplication.objects.none()

    @action(detail=True, methods=["post"], url_path="decide")
    def decide(self, request, pk=None):
        if not is_superadmin(request.user):
            return Response(
                {"detail": "Accès réservé aux superadmins."},
                status=status.HTTP_403_FORBIDDEN,
            )

        instance: AgencyApplication = self.get_object()
        decision = (request.data.get("decision") or "").lower()

        if decision not in ("approve", "decline"):
            return Response(
                {"detail": "decision doit être 'approve' ou 'decline'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if decision == "decline":
            if instance.statut != "refusee":
                instance.statut = "refusee"
                instance.decided_at = timezone.now()
                instance.decided_by = request.user
                instance.save(update_fields=["statut", "decided_at", "decided_by"])
            ser = self.get_serializer(instance)
            return Response(ser.data)

        # approve
        if instance.statut == "validee":
            ser = self.get_serializer(instance)
            return Response(
                {"detail": "Cette demande est déjà validée.", "demande": ser.data},
                status=status.HTTP_200_OK,
            )

        try:
            agence, user, raw_password = instance.approve(decided_by=request.user)
        except IntegrityError as e:
            return Response(
                {
                    "detail": "Impossible de finaliser l'inscription (conflit d'intégrité).",
                    "error": repr(e),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if raw_password:
            try:
                send_agency_credentials_email(instance, user.username, raw_password)
            except Exception as e:
                print("Erreur envoi email credentials:", repr(e))

        ser = self.get_serializer(instance)
        return Response(
            {"detail": "Demande approuvée et compte agence créé.", "demande": ser.data},
            status=status.HTTP_200_OK,
        )


# =========================
# Gestion des agences
# =========================

class AgenceVoyageViewSet(viewsets.ModelViewSet):
    queryset = AgenceVoyage.objects.all().order_by("legal_name")

    serializer_class = AgenceVoyageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if is_superadmin(self.request.user):
            return super().get_queryset()
        return AgenceVoyage.objects.none()
