# backend1/b2b/views/ressources.py
from __future__ import annotations

from django.db.models import Q, OuterRef, Subquery, DateTimeField, CharField
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from b2b.models import Vehicule, Chauffeur, MissionRessource, Zone
from b2b.serializers import VehiculeSerializer, ChauffeurSerializer
from b2b.views.helpers import _user_role, _user_agence


# =========================
# Utils
# =========================
def _parse_dt(s: str | None):
    """
    Attend un ISO datetime : "2025-12-22T01:10" (ou avec secondes)
    """
    if not s:
        return None
    dt = parse_datetime(s)
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _overlap_q(debut, fin):
    # overlap: start < other_end AND end > other_start
    return Q(date_heure_debut__lt=fin) & Q(date_heure_fin__gt=debut)


def _safe_int(v):
    try:
        return int(v)
    except Exception:
        return None


# =========================
# ViewSets
# =========================
class VehiculeViewSet(viewsets.ModelViewSet):
    """
    GET /api/vehicules/?agence=<id>&debut=<iso>&fin=<iso>
    -> renvoie véhicules dispo sur le créneau + enrichissements.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = VehiculeSerializer

    def _scoped_queryset(self):
        """
        Scope agence:
        - superadmin : peut filtrer ?agence=... sinon voit tout
        - admin agence : voit uniquement son agence (ignore ?agence=...)
        """
        qs = Vehicule.objects.all()

        role = _user_role(self.request.user)
        agence_param = self.request.query_params.get("agence")

        if role == "superadmin":
            if agence_param:
                qs = qs.filter(agence_id=agence_param)
            return qs

        agence_user = _user_agence(self.request.user)
        if not agence_user:
            return qs.none()

        # ignore ?agence= (anti fuite)
        return qs.filter(agence=agence_user)

    def get_queryset(self):
        qs = self._scoped_queryset()

        # ✅ annotations dernière mission (fin + adresse arrivée)
        last_mr = (
            MissionRessource.objects
            .filter(is_deleted=False, vehicule_id=OuterRef("pk"))
            .order_by("-date_heure_fin", "-id")
        )
        qs = qs.annotate(
            last_mission_end=Subquery(last_mr.values("date_heure_fin")[:1], output_field=DateTimeField()),
            last_mission_address=Subquery(last_mr.values("lieu_arrivee")[:1], output_field=CharField()),
        )

        # ✅ annotations prochaine mission (début + adresse départ) (basé sur "now")
        now = timezone.now()
        next_mr = (
            MissionRessource.objects
            .filter(is_deleted=False, vehicule_id=OuterRef("pk"), date_heure_debut__gte=now)
            .order_by("date_heure_debut", "id")
        )
        qs = qs.annotate(
            next_mission_start=Subquery(next_mr.values("date_heure_debut")[:1], output_field=DateTimeField()),
            next_mission_address=Subquery(next_mr.values("lieu_depart")[:1], output_field=CharField()),
        )

        # filtre disponibilité sur créneau
        debut = _parse_dt(self.request.query_params.get("debut"))
        fin = _parse_dt(self.request.query_params.get("fin"))
        if debut and fin:
            overlap = _overlap_q(debut, fin)
            busy_ids = (
                MissionRessource.objects
                .filter(is_deleted=False, vehicule__isnull=False)
                .filter(overlap)
                .values_list("vehicule_id", flat=True)
            )
            qs = qs.exclude(id__in=busy_ids)

        # filtre optionnel statut
        statut = self.request.query_params.get("statut")
        if statut:
            qs = qs.filter(statut=statut)

        return qs.order_by("immatriculation")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())

        debut = _parse_dt(self.request.query_params.get("debut"))
        ref_time = debut or timezone.now()

        zone_id = _safe_int(self.request.query_params.get("zone_id"))
        zone = Zone.objects.filter(id=zone_id).first() if zone_id else None

        data = []
        for v in qs:
            # état réel (si ton model a get_real_state)
            try:
                state = v.get_real_state(ref_time=ref_time)
                location = state.get("location") or getattr(v, "adresse", None)
                available_from = state.get("available_from") or ref_time
                available_until = state.get("available_until")
            except Exception:
                location = getattr(v, "adresse", None)
                available_from = ref_time
                available_until = None

            # dernier chauffeur connu via dernière affectation du véhicule
            last_aff = (
                MissionRessource.objects
                .filter(is_deleted=False, vehicule_id=v.id, chauffeur__isnull=False)
                .order_by("-date_heure_fin", "-id")
                .first()
            )
            last_driver = last_aff.chauffeur if last_aff else None
            last_driver_obj = (
                {"id": last_driver.id, "nom": last_driver.nom, "prenom": last_driver.prenom}
                if last_driver else None
            )
            last_driver_name = (
                f"{(last_driver.prenom or '').strip()} {(last_driver.nom or '').strip()}".strip()
                if last_driver else None
            )

            row = self.get_serializer(v).data

            # ✅ expose les annotations (sinon elles restent invisibles)
            row["last_mission_end"] = getattr(v, "last_mission_end", None)
            row["last_mission_address"] = (getattr(v, "last_mission_address", None) or None)
            row["next_mission_start"] = getattr(v, "next_mission_start", None)
            row["next_mission_address"] = (getattr(v, "next_mission_address", None) or None)

            # ✅ état réel
            row["real_state"] = {
                "location": location,
                "available_from": available_from,
                "available_until": available_until,
            }

            # ✅ aliases "adresse actuelle" (ton front lit adresse_actuelle / position_actuelle / current_address)
            row["adresse_actuelle"] = location
            row["position_actuelle"] = location
            row["current_address"] = location

            # ✅ dernier chauffeur : alias pour matcher ton front (getLastDriverLabel)
            row["dernier_chauffeur"] = last_driver_obj  # garde ton champ existant
            row["last_driver"] = last_driver_obj
            row["last_driver_obj"] = last_driver_obj
            row["last_chauffeur"] = last_driver_obj
            row["last_chauffeur_obj"] = last_driver_obj
            row["last_driver_name"] = last_driver_name
            row["last_chauffeur_name"] = last_driver_name

            # tri zone optionnel
            if zone:
                try:
                    row["_is_near_zone"] = bool(v.is_near_zone(zone, max_km=10.0))
                    row["_distance_km"] = v.distance_to_zone(zone)
                except Exception:
                    row["_is_near_zone"] = False
                    row["_distance_km"] = None

            data.append(row)

        if zone:
            def _key(x):
                near = 0 if x.get("_is_near_zone") else 1
                dist = x.get("_distance_km")
                dist = dist if dist is not None else 10**9
                imm = x.get("immatriculation") or ""
                return (near, dist, imm)

            data.sort(key=_key)
            for x in data:
                x.pop("_is_near_zone", None)
                x.pop("_distance_km", None)

        return Response(data)

    def perform_create(self, serializer):
        role = _user_role(self.request.user)
        if role == "superadmin":
            serializer.save()
            return

        agence_user = _user_agence(self.request.user)
        if agence_user is None:
            raise PermissionDenied("Aucune agence associée à l'utilisateur.")

        serializer.save(agence=agence_user)


class ChauffeurViewSet(viewsets.ModelViewSet):
    """
    GET /api/chauffeurs/?agence=<id>&debut=<iso>&fin=<iso>
    -> renvoie chauffeurs dispo sur le créneau + real_state.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ChauffeurSerializer

    def _scoped_queryset(self):
        qs = Chauffeur.objects.all()

        role = _user_role(self.request.user)
        agence_param = self.request.query_params.get("agence")

        if role == "superadmin":
            if agence_param:
                qs = qs.filter(agence_id=agence_param)
            return qs

        agence_user = _user_agence(self.request.user)
        if not agence_user:
            return qs.none()

        return qs.filter(agence=agence_user)

    def get_queryset(self):
        qs = self._scoped_queryset()

        debut = _parse_dt(self.request.query_params.get("debut"))
        fin = _parse_dt(self.request.query_params.get("fin"))
        if debut and fin:
            overlap = _overlap_q(debut, fin)
            busy_ids = (
                MissionRessource.objects
                .filter(is_deleted=False, chauffeur__isnull=False)
                .filter(overlap)
                .values_list("chauffeur_id", flat=True)
            )
            qs = qs.exclude(id__in=busy_ids)

        statut = self.request.query_params.get("statut")
        if statut:
            qs = qs.filter(statut=statut)

        return qs.order_by("nom", "prenom")

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())

        debut = _parse_dt(self.request.query_params.get("debut"))
        ref_time = debut or timezone.now()

        data = []
        for c in qs:
            row = self.get_serializer(c).data

            last_aff = (
                MissionRessource.objects
                .filter(is_deleted=False, chauffeur_id=c.id, date_heure_fin__lte=ref_time)
                .order_by("-date_heure_fin", "-id")
                .first()
            )
            if last_aff:
                location = last_aff.lieu_arrivee or last_aff.lieu_depart or getattr(c, "adresse", None)
                available_from = last_aff.date_heure_fin
            else:
                location = getattr(c, "adresse", None)
                available_from = ref_time

            next_aff = (
                MissionRessource.objects
                .filter(is_deleted=False, chauffeur_id=c.id, date_heure_debut__gte=ref_time)
                .order_by("date_heure_debut", "id")
                .first()
            )
            available_until = next_aff.date_heure_debut if next_aff else None

            row["real_state"] = {
                "location": location,
                "available_from": available_from,
                "available_until": available_until,
            }

            data.append(row)

        return Response(data)

    def perform_create(self, serializer):
        role = _user_role(self.request.user)
        if role == "superadmin":
            serializer.save()
            return

        agence_user = _user_agence(self.request.user)
        if agence_user is None:
            raise PermissionDenied("Aucune agence associée à l'utilisateur.")

        serializer.save(agence=agence_user)
