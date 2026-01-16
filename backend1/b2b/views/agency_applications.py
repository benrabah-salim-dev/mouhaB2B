from django.contrib.auth.models import User
from rest_framework import generics, permissions, status, viewsets, filters
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.decorators import action

from b2b.models import AgencyApplication, AgenceVoyage
from b2b.serializers import (
    AgencyApplicationPublicSerializer,
    AgencyApplicationAdminSerializer,
)


class AgencyApplicationCreateAPIView(generics.CreateAPIView):
    """
    Endpoint public utilisé par InscriptionAgenceWizard.
    POST /api/agency-applications/
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = AgencyApplicationPublicSerializer
    parser_classes = [MultiPartParser, FormParser]

    def perform_create(self, serializer):
        # Si tu as un user connecté tu peux le mettre en created_by.
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user, statut="en_attente")


class AgencyApplicationResendOtpAPIView(generics.GenericAPIView):
    """
    Renvoyer le code OTP (stub pour l'instant).
    POST /api/agency-applications/resend-otp/
    body: { "email": "...", "phone": "...", "via": "email"|"sms" }
    """
    permission_classes = [permissions.AllowAny]
    parser_classes = [JSONParser]

    def post(self, request, *args, **kwargs):
        email = request.data.get("email")
        phone = request.data.get("phone")
        via = request.data.get("via")

        # TODO: ici tu peux générer un OTP et l'envoyer via ton provider.
        # Pour le moment on fait juste comme si tout s'était bien passé.
        return Response(
            {"detail": f"Code OTP renvoyé via {via}."},
            status=status.HTTP_200_OK,
        )


def is_superadmin(user):
    try:
        if user.is_superuser:
            return True
        if hasattr(user, "profile") and user.profile.role == "superadmin":
            return True
    except Exception:
        pass
    return False


class AgencyApplicationAdminViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Pour le gestionnaire / superadmin :
    - GET /api/admin/agency-applications/           -> liste
    - GET /api/admin/agency-applications/{id}/      -> détail
    - POST /api/admin/agency-applications/{id}/decide/ -> approve/decline
    """
    queryset = AgencyApplication.objects.all().order_by("-created_at")
    serializer_class = AgencyApplicationAdminSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "legal_name",
        "rne",
        "code_fiscal",
        "rep_nom",
        "rep_prenom",
        "rep_email",
        "company_email",
    ]
    ordering_fields = ["created_at", "legal_name", "statut"]

    def get_queryset(self):
        user = self.request.user
        if is_superadmin(user):
            return super().get_queryset()
        return AgencyApplication.objects.none()

    @action(detail=True, methods=["post"], url_path="decide")
    def decide(self, request, pk=None):
        """
        Body JSON: { "decision": "approve" } ou { "decision": "decline" }
        """
        user = request.user
        if not is_superadmin(user):
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
            instance.statut = "refusee"
            instance.save(update_fields=["statut"])
            ser = self.get_serializer(instance)
            return Response(ser.data)

        # decision == "approve"
        if instance.statut == "validee":
            return Response(
                {"detail": "Cette demande est déjà validée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1) créer un User pour l'agence (login)
        base_username = (instance.rep_email or "").split("@")[0] or f"agence_{instance.id}"
        username = base_username
        i = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}_{i}"
            i += 1

        password = User.objects.make_random_password()

        user_agence = User.objects.create_user(
            username=username,
            password=password,
            first_name=instance.rep_prenom,
            last_name=instance.rep_nom,
            email=instance.rep_email,
        )

        # 2) créer l'AgenceVoyage liée au user
        agence = AgenceVoyage.objects.create(
            user=user_agence,
            nom=instance.legal_name,
            adresse=instance.company_address or "",
            email=instance.company_email,
            telephone=instance.company_phone,
        )

        # 3) mettre à jour la demande
        instance.agence = agence
        instance.statut = "validee"
        instance.save(update_fields=["agence", "statut"])

        ser = self.get_serializer(instance)
        return Response(
            {
                "demande": ser.data,
                "credentials": {
                    "username": username,
                    "password": password,  # à transmettre par canal sécurisé
                },
            }
        )
