# b2b/services/mission_planning.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from typing import Any, Dict, List, Optional, Tuple

from django.db.models import Q
from django.utils import timezone


ACTIVE_STATUSES = ("PLANNED", "IN_PROGRESS", "CONFIRMED")  # adapte si besoin
INACTIVE_STATUSES = ("DONE", "CANCELLED")


# -------------------------
# Helpers datetime
# -------------------------
def _parse_hhmm(value: Any) -> Optional[time]:
    """
    Accepte "HH:MM", "HH:MM:SS", "16h50", datetime, time, etc.
    Retourne datetime.time ou None.
    """
    if value is None or value == "":
        return None

    if isinstance(value, time):
        return value

    if isinstance(value, datetime):
        return value.time().replace(second=0, microsecond=0)

    s = str(value).strip()
    if not s:
        return None

    # "16:50:00" -> "16:50"
    if len(s) >= 5 and s[2] == ":":
        try:
            hh = int(s[0:2])
            mm = int(s[3:5])
            return time(hh, mm)
        except Exception:
            pass

    # "16h50"
    if "h" in s.lower():
        try:
            parts = s.lower().replace(" ", "").split("h")
            hh = int(parts[0])
            mm = int(parts[1]) if len(parts) > 1 and parts[1] else 0
            return time(hh, mm)
        except Exception:
            pass

    return None


def _aware_dt(d, t: Optional[time], tz=None) -> Optional[datetime]:
    if not d or not t:
        return None
    tz = tz or timezone.get_current_timezone()
    naive = datetime.combine(d, t)
    return timezone.make_aware(naive, tz)


def _pick_time_from_schedule_item(item: Dict[str, Any], keys: List[str]) -> Optional[time]:
    for k in keys:
        if k in item and item.get(k):
            t = _parse_hhmm(item.get(k))
            if t:
                return t
    return None


# -------------------------
# 1) Fenêtre d'occupation depuis hotel_schedule
# -------------------------
def compute_window_from_fiches(fiches: List[Any], kind: str) -> Tuple[Optional[datetime], Optional[datetime], Optional[str], Optional[str]]:
    """
    kind = "DEPART" ou "ARRIVEE" (ou tu le déduis via fiche.type)
    On lit les schedules des fiches et on essaie de sortir:
      start_dt, end_dt, lieu_depart, lieu_arrivee
    """
    tz = timezone.get_current_timezone()

    # collect times per fiche schedule
    all_pickups: List[Tuple[Any, time, str]] = []   # (fiche, t, hotel)
    all_depots: List[Tuple[Any, time, str]] = []
    all_aero: List[Tuple[Any, time]] = []

    for f in fiches:
        hs = getattr(f, "hotel_schedule", None) or []
        fdate = getattr(f, "date", None)
        if not fdate:
            continue

        if isinstance(hs, list):
            for it in hs:
                if not isinstance(it, dict):
                    continue
                hotel = (it.get("hotel") or it.get("nom") or "").strip() or "—"

                # priorité: override_time si tu veux, sinon pickup/depot/aeroport
                t_pick = _pick_time_from_schedule_item(it, ["override_time", "heure_pickup"])
                t_dep = _pick_time_from_schedule_item(it, ["override_time", "heure_depot"])
                t_aero = _pick_time_from_schedule_item(it, ["heure_aeroport", "heure_vol"])

                if t_pick:
                    all_pickups.append((f, t_pick, hotel))
                if t_dep:
                    all_depots.append((f, t_dep, hotel))
                if t_aero:
                    all_aero.append((f, t_aero))

        # fallback si aucun schedule: prendre fiche.horaires comme "heure vol"
        if not all_aero:
            ht = _parse_hhmm(getattr(f, "horaires", None))
            if ht:
                all_aero.append((f, ht))

    # choix start/end selon kind
    start_dt = end_dt = None
    lieu_depart = lieu_arrivee = None

    if kind.upper() == "DEPART":
        # début = min pickup (si existe) sinon heure vol - 3h (fallback)
        # fin = heure_aeroport (si existe) sinon heure vol - 2h/0
        if all_pickups:
            f0, t0, hotel0 = sorted(all_pickups, key=lambda x: x[1])[0]
            start_dt = _aware_dt(f0.date, t0, tz)
            lieu_depart = hotel0

        # fin: si on a des heure_aeroport on prend la plus tardive
        if all_aero:
            f1, t1 = sorted(all_aero, key=lambda x: x[1])[-1]
            # si ton "heure_aeroport" est une présence, c'est OK comme fin
            end_dt = _aware_dt(f1.date, t1, tz)

        # fallback: si start existe mais pas end => +3h (ou ce que tu veux)
        if start_dt and not end_dt:
            end_dt = start_dt + timezone.timedelta(hours=3)

    else:
        # ARRIVEE:
        # début = heure_aeroport (si existe) sinon heure vol
        # fin = max depot (si existe) sinon +3h
        if all_aero:
            f0, t0 = sorted(all_aero, key=lambda x: x[1])[0]
            start_dt = _aware_dt(f0.date, t0, tz)
            lieu_depart = "AEROPORT"

        if all_depots:
            f1, t1, hotel1 = sorted(all_depots, key=lambda x: x[1])[-1]
            end_dt = _aware_dt(f1.date, t1, tz)
            lieu_arrivee = hotel1

        if start_dt and not end_dt:
            end_dt = start_dt + timezone.timedelta(hours=3)

    return start_dt, end_dt, lieu_depart, lieu_arrivee


def update_mission_window_from_fiches(mission, fiches_qs, kind: str) -> None:
    """
    Met à jour mission.date_heure_debut / mission.date_heure_fin / lieux
    à partir des fiches liées.
    """
    fiches = list(fiches_qs)
    start_dt, end_dt, dep, arr = compute_window_from_fiches(fiches, kind=kind)

    fields = []
    if hasattr(mission, "date_heure_debut"):
        mission.date_heure_debut = start_dt
        fields.append("date_heure_debut")
    if hasattr(mission, "date_heure_fin"):
        mission.date_heure_fin = end_dt
        fields.append("date_heure_fin")
    if hasattr(mission, "lieu_depart"):
        mission.lieu_depart = dep
        fields.append("lieu_depart")
    if hasattr(mission, "lieu_arrivee"):
        mission.lieu_arrivee = arr
        fields.append("lieu_arrivee")

    if fields:
        mission.save(update_fields=fields)


# -------------------------
# 2) Overlap (busy) sur Mission
# -------------------------
def overlaps(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> bool:
    return start_a < end_b and end_a > start_b


def _busy_missions_qs(agence_id: int, start_dt: datetime, end_dt: datetime):
    from b2b.models import Mission  # import local pour éviter cycles

    return (
        Mission.objects
        .filter(agence_id=agence_id)
        .exclude(statut__in=INACTIVE_STATUSES)
        .filter(date_heure_debut__lt=end_dt, date_heure_fin__gt=start_dt)
        .select_related("vehicule", "chauffeur")
    )


def get_vehicle_busy_reason(vehicule_id: int, agence_id: int, start_dt: datetime, end_dt: datetime):
    qs = _busy_missions_qs(agence_id, start_dt, end_dt).filter(vehicule_id=vehicule_id).order_by("date_heure_debut")
    m = qs.first()
    if not m:
        return None
    return {
        "mission_id": m.id,
        "reference": getattr(m, "reference", ""),
        "start": m.date_heure_debut,
        "end": m.date_heure_fin,
        "lieu_depart": getattr(m, "lieu_depart", None),
        "lieu_arrivee": getattr(m, "lieu_arrivee", None),
        "statut": getattr(m, "statut", None),
    }


def get_driver_busy_reason(chauffeur_id: int, agence_id: int, start_dt: datetime, end_dt: datetime):
    qs = _busy_missions_qs(agence_id, start_dt, end_dt).filter(chauffeur_id=chauffeur_id).order_by("date_heure_debut")
    m = qs.first()
    if not m:
        return None
    return {
        "mission_id": m.id,
        "reference": getattr(m, "reference", ""),
        "start": m.date_heure_debut,
        "end": m.date_heure_fin,
        "lieu_depart": getattr(m, "lieu_depart", None),
        "lieu_arrivee": getattr(m, "lieu_arrivee", None),
        "statut": getattr(m, "statut", None),
    }


def vehicles_available(agence_id: int, start_dt: datetime, end_dt: datetime):
    from b2b.models import Vehicule, Mission

    busy_ids = (
        Mission.objects
        .filter(agence_id=agence_id)
        .exclude(statut__in=INACTIVE_STATUSES)
        .filter(vehicule__isnull=False)
        .filter(date_heure_debut__lt=end_dt, date_heure_fin__gt=start_dt)
        .values_list("vehicule_id", flat=True)
        .distinct()
    )
    return Vehicule.objects.filter(agence_id=agence_id).exclude(id__in=busy_ids)


def drivers_available(agence_id: int, start_dt: datetime, end_dt: datetime):
    from b2b.models import Chauffeur, Mission

    busy_ids = (
        Mission.objects
        .filter(agence_id=agence_id)
        .exclude(statut__in=INACTIVE_STATUSES)
        .filter(chauffeur__isnull=False)
        .filter(date_heure_debut__lt=end_dt, date_heure_fin__gt=start_dt)
        .values_list("chauffeur_id", flat=True)
        .distinct()
    )
    return Chauffeur.objects.filter(agence_id=agence_id).exclude(id__in=busy_ids)


# -------------------------
# 3) Emplacement (last mission)
# -------------------------
def get_vehicle_last_location(v, ref_dt: Optional[datetime] = None) -> Optional[str]:
    from b2b.models import Mission
    ref_dt = ref_dt or timezone.now()

    last_m = (
        Mission.objects
        .filter(vehicule=v, date_heure_fin__isnull=False, date_heure_fin__lte=ref_dt)
        .exclude(statut="CANCELLED")
        .order_by("-date_heure_fin")
        .first()
    )

    if last_m:
        return getattr(last_m, "lieu_arrivee", None) or getattr(last_m, "lieu_depart", None) or getattr(v, "adresse", None)
    return getattr(v, "adresse", None)


def get_driver_last_location(c, ref_dt: Optional[datetime] = None) -> Optional[str]:
    from b2b.models import Mission
    ref_dt = ref_dt or timezone.now()

    last_m = (
        Mission.objects
        .filter(chauffeur=c, date_heure_fin__isnull=False, date_heure_fin__lte=ref_dt)
        .exclude(statut="CANCELLED")
        .order_by("-date_heure_fin")
        .first()
    )
    if last_m:
        return getattr(last_m, "lieu_arrivee", None) or getattr(last_m, "lieu_depart", None) or getattr(c, "adresse", None)
    return getattr(c, "adresse", None)
