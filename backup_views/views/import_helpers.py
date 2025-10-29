# b2b/views/import_helpers.py
from django.utils import timezone
from b2b.models import ImportBatch, ImportBatchItem


def register_import_batch(user, agence, dossiers, label=None):
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
