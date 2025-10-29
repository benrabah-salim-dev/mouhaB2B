# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime
from typing import Optional

from django.db.models import Q
from django.utils.dateparse import parse_date

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes

from b2b.models import Dossier, ImportBatch
from b2b.serializers import DossierSerializer
from b2b.views.helpers import _user_role, _user_agence


def _parse_date(s: Optional[str]):
    """
    Accepte YYYY-MM-DD ou ISO 8601 et retourne un date object, sinon None.
    """
    if not s:
        return None
    try:
        return parse_date(s) or datetime.fromisoformat(s).date()
    except Exception:
        return None


class DossiersImportablesAPIView(APIView):
    """
    GET /api/dossiers-importables/
    Renvoie les Dossiers qui NE SONT PAS déjà attachés à une FicheMouvement
    (via FicheMouvementItem -> related_name='fiche_items').

    Filtres (optionnels, au moins un requis pour éviter un dump global):
      - agence: id (superadmin uniquement, sinon agence de l’utilisateur)
      - aeroport: code exact (matche arrivée OU départ)
      - type: 'A' | 'D' (arrivée vs départ → filtre sur heure_arrivee/heure_depart non null)
      - date_from, date_to: YYYY-MM-DD (appliqué sur la date correspondant au type)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = _user_role(request.user)
        if role not in ("superadmin", "adminagence"):
            return Response([], status=200)

        aeroport = (request.query_params.get("aeroport") or "").strip()
        t = (request.query_params.get("type") or "").strip().upper()
        date_from = (request.query_params.get("date_from") or "").strip()
        date_to = (request.query_params.get("date_to") or "").strip()

        # ⚠️ Ne renvoyer des données que si au moins un filtre est fourni
        if not any([aeroport, t, date_from, date_to]):
            return Response([], status=200)

        qs = Dossier.objects.select_related("agence", "hotel")

        # Portée agence
        agence_param = request.query_params.get("agence")
        if role == "superadmin" and agence_param:
            qs = qs.filter(agence_id=agence_param)
        elif role == "adminagence":
            qs = qs.filter(agence=_user_agence(request.user))

        # Exclure ceux déjà utilisés dans une fiche
        # (FicheMouvementItem a related_name='fiche_items' → exclude si existe)
        qs = qs.exclude(fiche_items__isnull=False)

        # Filtre aéroport
        if aeroport:
            qs = qs.filter(
                Q(aeroport_arrivee__iexact=aeroport)
                | Q(aeroport_depart__iexact=aeroport)
            )

        # Filtre type
        if t == "A":
            qs = qs.filter(heure_arrivee__isnull=False)
        elif t == "D":
            qs = qs.filter(heure_depart__isnull=False)

        # Filtre dates
        dfrom = _parse_date(date_from)
        dto = _parse_date(date_to)
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
            else:
                # Si type non précisé, accepter si l’une des deux heures est dans la fenêtre
                conds = Q()
                if dfrom:
                    conds |= Q(heure_arrivee__date__gte=dfrom) | Q(
                        heure_depart__date__gte=dfrom
                    )
                if dto:
                    conds &= Q(heure_arrivee__date__lte=dto) | Q(
                        heure_depart__date__lte=dto
                    )
                qs = qs.filter(conds)

        # Tri: plus récent d'abord, fallback id
        qs = qs.order_by("-heure_arrivee", "-heure_depart", "-id")

        data = DossierSerializer(qs, many=True).data
        return Response(data, status=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def active_import_items(request):
    """
    GET /api/active-import-items/?agence=<id>[&batch=<uuid>]
    Retourne les dossiers du DERNIER lot d’import de l’agence (ou du batch fourni)
    qui ne sont pas encore traités (Dossier.traite=False).

    Réponse: liste d’objets mini pour l’UI.
    """
    agence_id = request.query_params.get("agence") or request.query_params.get("agence_id")
    batch_id = request.query_params.get("batch") or request.query_params.get("batch_id")

    if not agence_id:
        return Response([], status=200)

    # Choisir le batch: si batch_id fourni → le prendre, sinon dernier de l’agence
    batch: Optional[ImportBatch] = None
    if batch_id:
        try:
            batch = ImportBatch.objects.filter(agence_id=agence_id, id=batch_id).first()
        except Exception:
            batch = None
    if not batch:
        batch = ImportBatch.objects.filter(agence_id=agence_id).order_by("-created_at").first()

    if not batch:
        return Response([], status=200)

    # Dossiers de ce batch non traités
    dossiers = (
        Dossier.objects.filter(import_items__batch=batch, traite=False)
        .select_related("hotel")
        .distinct()
        .order_by("-heure_arrivee", "-heure_depart", "-id")
    )

    data = [
        {
            "id": d.id,
            "reference": d.reference,
            "traite": d.traite,
            "hotel": d.hotel.nom if d.hotel_id else "",
            "ville": d.ville or "",
            # champs utiles pour l’UI FicheMouvement
            "aeroport_arrivee": d.aeroport_arrivee,
            "aeroport_depart": d.aeroport_depart,
            "heure_arrivee": d.heure_arrivee.isoformat() if d.heure_arrivee else None,
            "heure_depart": d.heure_depart.isoformat() if d.heure_depart else None,
            "num_vol_arrivee": d.num_vol_arrivee,
            "num_vol_retour": d.num_vol_retour,
            "nombre_personnes_arrivee": d.nombre_personnes_arrivee or 0,
            "nombre_personnes_retour": d.nombre_personnes_retour or 0,
            "tour_operateur": d.tour_operateur or "",
            "observation": d.observation or "",
        }
        for d in dossiers
    ]

    return Response(data, status=200)
