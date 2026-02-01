# apps/views_excursions.py

from rest_framework import viewsets, permissions

from apps.models import (
    ExcursionTemplate,
    ExcursionStep,
    ExcursionEvent,
)
from apps.serializers import (
    ExcursionTemplateSerializer,
    ExcursionStepSerializer,
    ExcursionEventSerializer,
)


class BaseAgenceMixin:
    """
    Mixin pour filtrer par l'agence du user connecté (user.profile.agence).
    """

    def get_user_agence(self):
        user = self.request.user
        profile = getattr(user, "profile", None)
        return getattr(profile, "agence", None)

    def filter_queryset_by_agence(self, qs, field_name="agence"):
        """
        Filtre un queryset sur le champ `field_name` = agence de l'utilisateur,
        sauf pour les superusers qui voient tout.
        """
        agence = self.get_user_agence()
        user = self.request.user
        if agence and not user.is_superuser:
            return qs.filter(**{field_name: agence})
        return qs

from rest_framework import viewsets, permissions
from apps.models import ExcursionTemplate
from apps.serializers import ExcursionTemplateSerializer

class ExcursionTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = ExcursionTemplateSerializer
    queryset = ExcursionTemplate.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # superadmin voit tout, admin agence voit seulement ses modèles
        profile = getattr(user, "profile", None)
        if profile and profile.role == "adminagence" and profile.agence_id:
            return qs.filter(agence=profile.agence)

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        profile = getattr(user, "profile", None)
        agence = getattr(profile, "agence", None)
        serializer.save(agence=agence)

    def perform_update(self, serializer):
        # on ne change pas d’agence en update
        serializer.save()


class ExcursionStepViewSet(viewsets.ModelViewSet):
    """
    CRUD sur les étapes d'excursions.

    - GET /excursion-steps/?template=<id> pour les étapes d’un modèle
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExcursionStepSerializer

    def get_queryset(self):
        qs = (
            ExcursionStep.objects
            .select_related("template", "template__agence")
        )

        # filtre par agence du user
        user = self.request.user
        profile = getattr(user, "profile", None)
        agence = getattr(profile, "agence", None)
        if agence and not user.is_superuser:
            qs = qs.filter(template__agence=agence)

        # filtre optionnel par template
        template_id = self.request.query_params.get("template")
        if template_id:
            qs = qs.filter(template_id=template_id)

        return qs

    def perform_create(self, serializer):
        """
        Le front DOIT envoyer template=<id>. On ne touche pas à l'agence ici,
        c'est celle du template.
        """
        serializer.save()


class ExcursionEventViewSet(BaseAgenceMixin, viewsets.ModelViewSet):
    """
    Événements réels d’excursions (date, véhicule, chauffeur, repas...).
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExcursionEventSerializer

    def get_queryset(self):
        qs = (
            ExcursionEvent.objects
            .select_related(
                "template",
                "template__agence",
                "agence",
                "vehicule_interne",
                "vehicule_rentout",
                "chauffeur",
            )
        )
        return self.filter_queryset_by_agence(qs, field_name="agence")

    def perform_create(self, serializer):
        """
        À la création :
        - agence = agence du user si connue
        - sinon agence = agence du template (si renseignée)
        """
        agence_user = self.get_user_agence()
        template = serializer.validated_data.get("template")
        agence_template = getattr(template, "agence", None)

        agence = agence_user or agence_template
        serializer.save(agence=agence)

    def perform_update(self, serializer):
        """
        Si pour une raison quelconque l'agence est vide, on essaie de la
        récupérer via le template.
        """
        instance = serializer.save()
        if not instance.agence and instance.template and instance.template.agence:
            instance.agence = instance.template.agence
            instance.save(update_fields=["agence"])
