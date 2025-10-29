# b2b/views/import_batches.py
from __future__ import annotations

from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import Dossier
from b2b.serializers import DossierSerializer
from b2b.models import ImportBatch, ImportBatchItem
from b2b.views.helpers import _user_role, _user_agence




class ImportBatchRemainingDossiersAPIView(APIView):
    """
    GET /api/import-batches/<batch_id>/dossiers/
    -> Renvoie *uniquement* les dossiers de ce batch qui ne sont pas encore
       utilisés dans une fiche de mouvement (fiche_items isnull).
    Filtres optionnels: ?type=A|D & ?aeroport=XXX & ?date_from=YYYY-MM-DD & ?date_to=YYYY-MM-DD
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        role = _user_role(request.user)
        try:
            batch = ImportBatch.objects.get(id=batch_id)
        except ImportBatch.DoesNotExist:
            return Response([], status=200)

        if role == "adminagence" and batch.agence != _user_agence(request.user):
            return Response([], status=200)
        if role not in ("adminagence", "superadmin"):
            return Response([], status=200)

        dossier_ids = ImportBatchItem.objects.filter(batch=batch).values_list(
            "dossier_id", flat=True
        )

        qs = Dossier.objects.filter(id__in=dossier_ids).exclude(
            fiche_items__isnull=False
        )

        # Filtres
        t = (request.query_params.get("type") or "").strip().upper()
        aeroport = (request.query_params.get("aeroport") or "").strip()
        dfrom = parse_date(request.query_params.get("date_from") or "")
        dto = parse_date(request.query_params.get("date_to") or "")

        if t == "A":
            qs = qs.filter(heure_arrivee__isnull=False)
        elif t == "D":
            qs = qs.filter(heure_depart__isnull=False)

        if aeroport:
            qs = qs.filter(
                Q(aeroport_arrivee__iexact=aeroport)
                | Q(aeroport_depart__iexact=aeroport)
            )

        if dfrom or dto:
            if t == "A":
                if dfrom:
                    qs = qs.filter(heure_arrivee__date__gte=dfrom)
                if dto:
                    qs = qs.filter(heure_arrivee__date__lte=dto)
            elif t == "D":
                if dfrom:
                    qs = qs.filter(heure_depart__date__gte=dfrom)
                if dto:
                    qs = qs.filter(heure_depart__date__lte=dto)

        qs = qs.order_by("-heure_arrivee", "-heure_depart", "-id")
        return Response(DossierSerializer(qs, many=True).data, status=200)


# b2b/views/import_batches.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from b2b.serializers import DossierSerializer


from django.db.models import Exists, OuterRef
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from b2b.models import ImportBatch, ImportBatchItem, FicheMouvementItem
from b2b.serializers import DossierSerializer
from b2b.models import ImportBatch, ImportBatchItem



# -*- coding: utf-8 -*-

from django.db.models import Exists, OuterRef
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import ImportBatch, ImportBatchItem, FicheMouvementItem, Dossier
from b2b.serializers import DossierSerializer
from b2b.views.helpers import _user_role, _user_agence


class ImportBatchListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = _user_role(request.user)
        qs = ImportBatch.objects.all()
        if role == "adminagence":
            qs = qs.filter(agence=_user_agence(request.user))
        elif role != "superadmin":
            return Response([], status=200)

        data = []
        for b in qs:
            total = b.items.count()
            used = (
                ImportBatchItem.objects.filter(
                    batch=b, dossier__fiche_items__isnull=False
                )
                .values("dossier_id")
                .distinct()
                .count()
            )
            remaining = total - used
            data.append(
                {
                    "id": str(b.id),
                    "created_at": b.created_at,
                    "label": b.label,
                    "total": total,
                    "used": used,
                    "remaining": remaining,
                }
            )
        return Response(data, status=200)


class ActiveBatchItemsAPIView(APIView):
    """
    GET /api/import-batches/active-items/?agence=<id>[&batch=<uuid>]
    → Renvoie les dossiers RESTANTS du batch actif (ou d’un batch précis),
      i.e. non utilisés dans une fiche ET traite=False.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        agence_id = request.query_params.get("agence")
        batch_id = request.query_params.get("batch")

        if not agence_id and not batch_id:
            return Response([], status=200)

        def _remaining_items_qs(batch):
            return (
                ImportBatchItem.objects.select_related("dossier")
                .filter(batch=batch, dossier__isnull=False)
                .annotate(
                    used=Exists(
                        FicheMouvementItem.objects.filter(
                            dossier_id=OuterRef("dossier_id")
                        )
                    )
                )
                .filter(used=False, dossier__traite=False)
                .order_by("id")
            )

        active_batch = None
        remaining_qs = None

        if batch_id:
            try:
                b = ImportBatch.objects.get(id=batch_id)
            except ImportBatch.DoesNotExist:
                return Response([], status=200)

            if agence_id and str(b.agence_id) != str(agence_id):
                return Response([], status=200)

            items_qs = _remaining_items_qs(b)
            if items_qs.exists():
                active_batch = b
                remaining_qs = items_qs
            else:
                return Response([], status=200)
        else:
            if not agence_id:
                return Response([], status=200)
            for b in ImportBatch.objects.filter(agence_id=agence_id).order_by("-created_at", "-id"):
                items_qs = _remaining_items_qs(b)
                if items_qs.exists():
                    active_batch = b
                    remaining_qs = items_qs
                    break

        if not active_batch or not remaining_qs:
            return Response([], status=200)

        seen = set()
        dossiers = []
        for it in remaining_qs:
            if it.dossier_id and it.dossier_id not in seen:
                seen.add(it.dossier_id)
                dossiers.append(it.dossier)

        return Response(DossierSerializer(dossiers, many=True).data, status=200)
