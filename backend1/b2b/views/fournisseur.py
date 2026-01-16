# b2b/views/fournisseur.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from b2b.models import Vehicule, Zone, VehiculeTarifZone


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def fournisseur_config(request):
    profile = getattr(request.user, "profile", None)
    agence = getattr(profile, "agence", None)

    types_materiel = [
        {"id": idx, "label": label, "code": code}
        for idx, (code, label) in enumerate(Vehicule.TYPE_CHOICES, start=1)
    ]

    data = {
        "pays": agence.pays if agence else "",
        "devise_code": "TND",
        "devise_symbole": None,
        "types_materiel": types_materiel,
    }
    return Response(data)


VEHICLE_KEYS = [
    ("rideshare", "RIDESHARE"),
    ("bus", "BUS"),
    ("minibus", "MINIBUS"),
    ("microbus", "MICROBUS"),
    ("fourx4", "4x4"),
    ("autre", "AUTRE"),
]


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def fournisseur_vehicule_tarifs(request):
    profile = getattr(request.user, "profile", None)
    agence = getattr(profile, "agence", None)

    if not agence:
        return Response({"detail": "Aucune agence liée à cet utilisateur"}, status=403)

    # =========================
    # GET : lecture des tarifs
    # =========================
    if request.method == "GET":
        aeroport = (request.query_params.get("aeroport") or "").strip()

        all_zones = Zone.objects.all().order_by("nom")
        zones_data = [{"id": z.id, "name": z.nom} for z in all_zones]

        rows = []
        if aeroport:
            tarifs_qs = VehiculeTarifZone.objects.filter(
                agence=agence,           # ✅ FILTRAGE PAR AGENCE
                aeroport=aeroport
            ).select_related("zone")

            by_zone = {}
            for t in tarifs_qs:
                z = t.zone
                if z.id not in by_zone:
                    by_zone[z.id] = {
                        "zone_id": z.id,
                        "zone_name": z.nom,
                    }

                for key, code in VEHICLE_KEYS:
                    if t.type_code == code:
                        by_zone[z.id][key] = float(t.prix)
                        break

            rows = list(by_zone.values())

        return Response({"rows": rows, "zones": zones_data})

    # =========================
    # POST : écriture des tarifs
    # =========================
    aeroport = (request.data.get("aeroport") or "").strip()
    zone_id = request.data.get("zone_id")
    tarifs = request.data.get("tarifs", {})

    if not aeroport:
        return Response({"detail": "aeroport requis"}, status=400)
    if not zone_id:
        return Response({"detail": "zone_id requis"}, status=400)

    try:
        zone = Zone.objects.get(id=zone_id)
    except Zone.DoesNotExist:
        return Response({"detail": "Zone introuvable"}, status=404)

    for key, code in VEHICLE_KEYS:
        raw_val = tarifs.get(key)
        if raw_val in (None, "", "null"):
            continue

        try:
            prix = float(str(raw_val).replace(",", "."))
        except (TypeError, ValueError):
            continue

        obj, _ = VehiculeTarifZone.objects.get_or_create(
            agence=agence,          # ✅ LIAISON AGENCE
            aeroport=aeroport,
            zone=zone,
            type_code=code,
            defaults={"prix": prix, "devise": "TND"},
        )
        obj.prix = prix
        obj.devise = "TND"
        obj.save()

    return Response({"detail": "Tarifs mis à jour."}, status=200)
