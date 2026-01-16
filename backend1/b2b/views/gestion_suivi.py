# b2b/views/gestion_suivi.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from b2b.models import Mission, OrdreMission, AuditLog


def is_superadmin(user):
    try:
        return user.is_authenticated and user.profile.role == "superadmin"
    except Exception:
        return False


def _actor_label(u):
    if not u:
        return "Système"
    full = f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip()
    return full or getattr(u, "username", None) or f"User#{u.id}"


def _iso(dt):
    try:
        return dt.isoformat() if dt else None
    except Exception:
        return None


class GestionSuiviMissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_superadmin(request.user):
            return Response({"detail": "Forbidden"}, status=403)

        agence_id = request.query_params.get("agence_id")
        q = (request.query_params.get("q") or "").strip()

        qs = Mission.objects.all().select_related("agence").order_by("-created_at")

        if agence_id:
            qs = qs.filter(agence_id=agence_id)

        if q:
            if q.isdigit():
                qs = qs.filter(id=int(q))
            else:
                qs = qs.filter(reference__icontains=q)

        qs = qs[:300]

        data = []
        for m in qs:
            data.append({
                "id": m.id,
                "reference": m.reference,
                "agence_id": m.agence_id,
                "agence_name": (m.agence.nom if m.agence_id else None),
                "date": str(m.date),
                "horaires": str(m.horaires) if m.horaires else None,
                "type": m.type,
                "numero_vol": m.numero_vol,
                "aeroport": m.aeroport,
                "client": m.client,
                "pax": m.pax,
                "created_at": _iso(m.created_at),
            })

        return Response({"results": data})


class GestionSuiviMissionOMsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, mission_id: int):
        if not is_superadmin(request.user):
            return Response({"detail": "Forbidden"}, status=403)

        if not Mission.objects.filter(id=mission_id).exists():
            return Response({"detail": "Mission not found"}, status=404)

        qs = (
            OrdreMission.objects
            .filter(mission_id=mission_id)
            .select_related("created_by")
            .order_by("-created_at")
        )

        data = []
        for om in qs:
            pdf = None
            if om.fichier_pdf:
                try:
                    pdf = om.fichier_pdf.url
                except Exception:
                    pdf = None

            data.append({
                "id": om.id,
                "reference": om.reference,
                "base_reference": om.base_reference,
                "version": om.version,
                "created_at": _iso(om.created_at),
                "created_by": (om.created_by.username if om.created_by_id else None),
                "pdf": pdf,
            })

        return Response({"results": data})


# =========================
# Historique (AuditLog)
# =========================

class GestionSuiviMissionHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, mission_id: int):
        if not is_superadmin(request.user):
            return Response({"detail": "Forbidden"}, status=403)

        if not Mission.objects.filter(id=mission_id).exists():
            return Response({"detail": "Mission not found"}, status=404)

        qs = (
            AuditLog.objects
            .filter(entity="Mission", entity_id=mission_id)
            .select_related("actor")
            .order_by("-created_at")[:300]
        )

        out = []
        for log in qs:
            out.append({
                "id": log.id,
                "entity": log.entity,
                "entity_id": log.entity_id,
                "action": log.action,
                "created_at": _iso(log.created_at),
                "actor": _actor_label(log.actor),
                "changes": log.changes,
                "meta": getattr(log, "meta", None),
            })

        return Response({"results": out})


class GestionSuiviOMHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, om_id: int):
        if not is_superadmin(request.user):
            return Response({"detail": "Forbidden"}, status=403)

        if not OrdreMission.objects.filter(id=om_id).exists():
            return Response({"detail": "OM not found"}, status=404)

        qs = (
            AuditLog.objects
            .filter(entity="OrdreMission", entity_id=om_id)
            .select_related("actor")
            .order_by("-created_at")[:300]
        )

        out = []
        for log in qs:
            out.append({
                "id": log.id,
                "entity": log.entity,
                "entity_id": log.entity_id,
                "action": log.action,
                "created_at": _iso(log.created_at),
                "actor": _actor_label(log.actor),
                "changes": log.changes,
                "meta": getattr(log, "meta", None),
            })

        return Response({"results": out})


class GestionSuiviMissionOMsHistoryView(APIView):
    """
    Historique de TOUS les OM d'une mission
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, mission_id: int):
        if not is_superadmin(request.user):
            return Response({"detail": "Forbidden"}, status=403)

        if not Mission.objects.filter(id=mission_id).exists():
            return Response({"detail": "Mission not found"}, status=404)

        om_ids = list(
            OrdreMission.objects.filter(mission_id=mission_id).values_list("id", flat=True)
        )
        if not om_ids:
            return Response({"results": []})

        qs = (
            AuditLog.objects
            .filter(entity="OrdreMission", entity_id__in=om_ids)
            .select_related("actor")
            .order_by("-created_at")[:500]
        )

        out = []
        for log in qs:
            out.append({
                "id": log.id,
                "entity": log.entity,
                "entity_id": log.entity_id,
                "action": log.action,
                "created_at": _iso(log.created_at),
                "actor": _actor_label(log.actor),
                "changes": log.changes,
                "meta": getattr(log, "meta", None),
            })

        return Response({"results": out})
