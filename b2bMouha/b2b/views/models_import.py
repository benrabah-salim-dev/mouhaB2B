# b2b/models_import.py
import uuid
from django.conf import settings
from django.db import models


class ImportBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agence = models.ForeignKey(
        "b2b.AgenceVoyage", on_delete=models.CASCADE, related_name="import_batches"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    label = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.label or self.id} ({self.created_at:%Y-%m-%d %H:%M})"


class ImportBatchItem(models.Model):
    batch = models.ForeignKey(
        ImportBatch, on_delete=models.CASCADE, related_name="items"
    )
    dossier = models.ForeignKey(
        "b2b.Dossier", on_delete=models.CASCADE, related_name="import_items"
    )

    class Meta:
        unique_together = ("batch", "dossier")

    def __str__(self):
        return f"{self.batch_id} → dossier {self.dossier_id}"
