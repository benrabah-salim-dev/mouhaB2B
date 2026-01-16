# b2b/signals_audit.py
from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal

from django.core.files import File
from django.db.models import Model, QuerySet
from django.db.models.fields.files import FieldFile
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone

from b2b.middleware.current_user import get_current_user
from b2b.models import Mission, OrdreMission, AuditLog

IGNORE_FIELDS = {"created_at"}
IGNORE_FIELDS_OM = {"created_at"}  # tu peux ajouter "fichier_pdf" si tu veux ignorer


def _serialize_value(val):
    if val is None:
        return None

    # types simples
    if isinstance(val, (str, int, bool)):
        return val

    if isinstance(val, float):
        return None if val != val else val  # NaN -> None

    # dates
    if isinstance(val, datetime):
        if timezone.is_naive(val):
            val = timezone.make_aware(val, timezone.get_current_timezone())
        return val.isoformat()

    if isinstance(val, date):
        return val.isoformat()

    if isinstance(val, time):
        return val.strftime("%H:%M:%S")

    # Decimal
    if isinstance(val, Decimal):
        return float(val)

    # File / FieldFile
    if isinstance(val, (FieldFile, File)):
        try:
            if getattr(val, "url", None):
                return val.url
        except Exception:
            pass
        try:
            return val.name or None
        except Exception:
            return None

    # relations / modèles
    if isinstance(val, Model):
        return val.pk

    if isinstance(val, QuerySet):
        return [obj.pk for obj in val]

    # dict / list
    if isinstance(val, dict):
        return {str(k): _serialize_value(v) for k, v in val.items()}

    if isinstance(val, (list, tuple, set)):
        return [_serialize_value(x) for x in val]

    # fallback
    return str(val)


def model_to_dict_simple(instance, ignore_fields=None):
    ignore_fields = set(ignore_fields or set())
    data = {}
    for field in instance._meta.concrete_fields:
        name = field.name
        if name in ignore_fields:
            continue

        if field.is_relation:
            data[name] = _serialize_value(getattr(instance, f"{name}_id", None))
        else:
            v = getattr(instance, name, None)
            data[name] = _serialize_value(v)

    return data


def compute_changes(before: dict, after: dict, ignore_fields=None):
    ignore_fields = set(ignore_fields or set())
    changes = {}
    for k in set(before.keys()) | set(after.keys()):
        if k in ignore_fields:
            continue
        if before.get(k) != after.get(k):
            changes[k] = {"from": before.get(k), "to": after.get(k)}
    return changes


# ✅ IMPORTANT: plus de cache global -> on stocke sur l'instance (safe multi-thread)
def cache_before(instance, ignore_fields=None):
    instance._audit_before = model_to_dict_simple(instance, ignore_fields=ignore_fields)


def pop_before(instance):
    return getattr(instance, "_audit_before", {}) or {}


def get_actor():
    u = get_current_user()
    if u and getattr(u, "is_authenticated", False):
        return u
    return None


# =========================
# Mission
# =========================

@receiver(pre_save, sender=Mission)
def mission_pre_save(sender, instance: Mission, **kwargs):
    if instance.pk:
        try:
            old = Mission.objects.get(pk=instance.pk)
            cache_before(old, ignore_fields=IGNORE_FIELDS)
            # on recopie sur instance pour être sûr d'avoir le before dans post_save
            instance._audit_before = old._audit_before
        except Mission.DoesNotExist:
            pass


@receiver(post_save, sender=Mission)
def mission_post_save(sender, instance: Mission, created: bool, **kwargs):
    actor = get_actor()
    meta = {"agence_id": instance.agence_id}

    if created:
        AuditLog.objects.create(
            entity="Mission",
            entity_id=instance.pk,
            action=AuditLog.ACTION_CREATE,
            actor=actor or instance.created_by,
            changes=model_to_dict_simple(instance, ignore_fields=IGNORE_FIELDS),
            meta=meta,
        )
    else:
        before = pop_before(instance)
        after = model_to_dict_simple(instance, ignore_fields=IGNORE_FIELDS)
        changes = compute_changes(before, after, ignore_fields=IGNORE_FIELDS)
        if changes:
            AuditLog.objects.create(
                entity="Mission",
                entity_id=instance.pk,
                action=AuditLog.ACTION_UPDATE,
                actor=actor or instance.created_by,
                changes=changes,
                meta=meta,
            )


@receiver(post_delete, sender=Mission)
def mission_post_delete(sender, instance: Mission, **kwargs):
    actor = get_actor()
    meta = {"agence_id": instance.agence_id}

    AuditLog.objects.create(
        entity="Mission",
        entity_id=instance.pk,
        action=AuditLog.ACTION_DELETE,
        actor=actor or instance.created_by,
        changes=model_to_dict_simple(instance, ignore_fields=IGNORE_FIELDS),
        meta=meta,
    )


# =========================
# OrdreMission
# =========================

@receiver(pre_save, sender=OrdreMission)
def om_pre_save(sender, instance: OrdreMission, **kwargs):
    if instance.pk:
        try:
            old = OrdreMission.objects.get(pk=instance.pk)
            cache_before(old, ignore_fields=IGNORE_FIELDS_OM)
            instance._audit_before = old._audit_before
        except OrdreMission.DoesNotExist:
            pass


@receiver(post_save, sender=OrdreMission)
def om_post_save(sender, instance: OrdreMission, created: bool, **kwargs):
    actor = get_actor()

    # ✅ agence_id via mission (si mission non chargée, on fait un mini fetch)
    agence_id = None
    try:
        if getattr(instance, "mission_id", None):
            if getattr(instance, "mission", None) and getattr(instance.mission, "agence_id", None):
                agence_id = instance.mission.agence_id
            else:
                agence_id = Mission.objects.filter(id=instance.mission_id).values_list("agence_id", flat=True).first()
    except Exception:
        agence_id = None

    meta = {"mission_id": instance.mission_id, "agence_id": agence_id}

    if created:
        AuditLog.objects.create(
            entity="OrdreMission",
            entity_id=instance.pk,
            action=AuditLog.ACTION_CREATE,
            actor=actor or instance.created_by,
            changes=model_to_dict_simple(instance, ignore_fields=IGNORE_FIELDS_OM),
            meta=meta,
        )
    else:
        before = pop_before(instance)
        after = model_to_dict_simple(instance, ignore_fields=IGNORE_FIELDS_OM)
        changes = compute_changes(before, after, ignore_fields=IGNORE_FIELDS_OM)
        if changes:
            AuditLog.objects.create(
                entity="OrdreMission",
                entity_id=instance.pk,
                action=AuditLog.ACTION_UPDATE,
                actor=actor or instance.created_by,
                changes=changes,
                meta=meta,
            )


@receiver(post_delete, sender=OrdreMission)
def om_post_delete(sender, instance: OrdreMission, **kwargs):
    actor = get_actor()

    agence_id = None
    try:
        if getattr(instance, "mission_id", None):
            agence_id = Mission.objects.filter(id=instance.mission_id).values_list("agence_id", flat=True).first()
    except Exception:
        agence_id = None

    meta = {"mission_id": instance.mission_id, "agence_id": agence_id}

    AuditLog.objects.create(
        entity="OrdreMission",
        entity_id=instance.pk,
        action=AuditLog.ACTION_DELETE,
        actor=actor or instance.created_by,
        changes=model_to_dict_simple(instance, ignore_fields=IGNORE_FIELDS_OM),
        meta=meta,
    )
