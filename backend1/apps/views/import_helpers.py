# -*- coding: utf-8 -*-
from __future__ import annotations

from django.utils import timezone
from django.db import transaction
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated

from b2b.models import (
    ImportBatch,
    ImportBatchItem,
    FicheMouvementItem,
    Dossier,
)
from b2b.serializers import FicheMouvementItemSerializer
from b2b.views.helpers import (
    _user_role,
    _user_agence,
    _ensure_same_agence_or_superadmin,
)


def register_import_batch(user, agence, dossiers, label: str | None = None):
    """
    Crée un ImportBatch + ImportBatchItem pour chaque dossier importé.
    `dossiers` = iterable de Dossier (créés ou mis à jour).
    """
    if not dossiers:
        return None

    batch = ImportBatch.objects.create(
        user=user,
        agence=agence,
        label=label or f"Import {timezone.now():%Y-%m-%d %H:%M}",
    )
    items = [
        ImportBatchItem(batch=batch, dossier=d)
        for d in dossiers
        if getattr(d, "id", None)
    ]
    ImportBatchItem.objects.bulk_create(items, ignore_conflicts=True)
    return batch


def count_remaining_in_batch(batch: ImportBatch) -> int:
    """
    Nombre de dossiers de ce batch qui ne sont pas encore 'traités'
    (i.e. pas encore inclus dans une FicheMouvement via FicheMouvementItem).
    """
    if not batch:
        return 0
    return (
        Dossier.objects.filter(import_items__batch=batch, traite=False)
        .distinct()
        .count()
    )


class FicheMouvementItemViewSet(ModelViewSet):
    """
    CRUD pour les items de fiche.
    Règles :
      - Création / Update : marquer le (nouveau) dossier .traite = True
      - Suppression : si le dossier n’a plus aucun item, remettre .traite = False
    """
    serializer_class = FicheMouvementItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FicheMouvementItem.objects.select_related(
            "fiche", "fiche__agence", "dossier"
        )
        role = _user_role(self.request.user)
        if role == "superadmin":
            return qs.all()
        if role == "adminagence":
            return qs.filter(fiche__agence=_user_agence(self.request.user))
        return FicheMouvementItem.objects.none()

    def perform_create(self, serializer):
        fiche = serializer.validated_data.get("fiche")
        _ensure_same_agence_or_superadmin(self.request, fiche.agence)
        with transaction.atomic():
            item = serializer.save()
            d = item.dossier
            if d and not d.traite:
                d.traite = True
                d.save(update_fields=["traite"])

    def perform_update(self, serializer):
        instance: FicheMouvementItem = serializer.instance
        fiche = instance.fiche
        _ensure_same_agence_or_superadmin(self.request, fiche.agence)

        old_dossier = instance.dossier  # avant mise à jour
        with transaction.atomic():
            item = serializer.save()
            new_dossier = item.dossier

            # Nouveau dossier → traité = True
            if new_dossier and not new_dossier.traite:
                new_dossier.traite = True
                new_dossier.save(update_fields=["traite"])

            # Ancien dossier : s'il n'a plus d'items, remettre à False
            if old_dossier:
                old_dossier_id = getattr(old_dossier, "id", None)
                if old_dossier_id:
                    still_has_items = (
                        FicheMouvementItem.objects
                        .filter(dossier_id=old_dossier_id)
                        .exclude(pk=item.pk)
                        .exists()
                    )
                    if not still_has_items and old_dossier.traite:
                        old_dossier.traite = False
                        old_dossier.save(update_fields=["traite"])

    def perform_destroy(self, instance: FicheMouvementItem):
        _ensure_same_agence_or_superadmin(self.request, instance.fiche.agence)
        with transaction.atomic():
            d = instance.dossier
            instance.delete()
            if d and d.traite:
                has_items = FicheMouvementItem.objects.filter(dossier_id=d.id).exists()
                if not has_items:
                    d.traite = False
                    d.save(update_fields=["traite"])
