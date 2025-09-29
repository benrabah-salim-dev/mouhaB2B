# b2b/views/dossiers_import.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime
from typing import Optional

from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from b2b.models import Dossier
from b2b.serializers import DossierSerializer
from b2b.views.helpers import _user_role, _user_agence


def _parse_date(s: Optional[str]):
    if not s:
        return None
    try:
        # accept YYYY-MM-DD
        return parse_date(s) or datetime.fromisoformat(s).date()
    except Exception:
        return None


class DossiersImportablesAPIView(APIView):
    """
    GET /api/dossiers-importables/
    Renvoie les Dossiers qui NE SONT PAS déjà attachés à une FicheMouvement (via FicheMouvementItem).

    Filtres (optionnels):
      - agence: id (superadmin uniquement)
      - aeroport: code exact (matche arrivée ou départ)
      - type: 'A' | 'D'   (arrivée vs départ → filtre heure_arrivee/heure_depart non null)
      - date_from, date_to: YYYY-MM-DD (appliqué sur la date de l'heure correspondante)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = _user_role(request.user)
        if role not in ("superadmin", "adminagence"):
            return Response([], status=200)

        qs = Dossier.objects.select_related("agence", "hotel")

        # Portée agence
        agence_param = request.query_params.get("agence")
        if role == "superadmin" and agence_param:
            qs = qs.filter(agence_id=agence_param)
        elif role == "adminagence":
            qs = qs.filter(agence=_user_agence(request.user))

        # Exclure ceux déjà utilisés dans une fiche
        qs = qs.exclude(fiche_items__isnull=False)

        # Filtres simples
        aeroport = (request.query_params.get("aeroport") or "").strip()
        if aeroport:
            qs = qs.filter(Q(aeroport_arrivee__iexact=aeroport) | Q(aeroport_depart__iexact=aeroport))

        t = (request.query_params.get("type") or "").strip().upper()
        if t == "A":
            qs = qs.filter(heure_arrivee__isnull=False)
        elif t == "D":
            qs = qs.filter(heure_depart__isnull=False)

        dfrom = _parse_date(request.query_params.get("date_from"))
        dto = _parse_date(request.query_params.get("date_to"))
        if dfrom or dto:
            # On applique le range sur le champ d'heure "pertinent"
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
                # si type non précisé, on accepte si l'une des deux heures est dans la fenêtre
                conds = Q()
                if dfrom:
                    conds |= Q(heure_arrivee__date__gte=dfrom) | Q(heure_depart__date__gte=dfrom)
                if dto:
                    conds &= Q(heure_arrivee__date__lte=dto) | Q(heure_depart__date__lte=dto)
                qs = qs.filter(conds)

        # Tri récent d'abord (heure la plus proche), fallback par id
        qs = qs.order_by("-heure_arrivee", "-heure_depart", "-id")

        data = DossierSerializer(qs, many=True).data
        return Response(data, status=200)
