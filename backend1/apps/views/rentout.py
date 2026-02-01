# apps/views/rentout.py
from datetime import datetime, timedelta

from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import Vehicule, VehiculeTarifZone, Zone


# ================= ETAT REEL VEHICULE =================
def get_vehicle_real_state(vehicule, ref_time=None):
    """
    ref_time = datetime de référence (heure de la mission)
    Si non renseigné → on prend maintenant.

    Logique :
      - On cherche la dernière mission terminée avant ref_time.
        → position = lieu_arrivee ou, à défaut, lieu_depart
        → available_from = date_heure_fin de cette mission
      - S'il n'y a pas de mission avant ref_time :
        → position = adresse du véhicule (parc)
        → available_from = ref_time
      - On cherche ensuite la prochaine mission après ref_time
        → available_until = date_heure_debut de cette mission (ou None si aucune)
    """
    if ref_time is None:
        ref_time = timezone.now()

    # LAST MISSION (terminée avant ref_time)
    last_mission = (
        vehicule.affectations
        .filter(date_heure_fin__lte=ref_time)
        .order_by("-date_heure_fin")
        .first()
    )

    if last_mission:
        location = last_mission.lieu_arrivee or last_mission.lieu_depart
        available_from = last_mission.date_heure_fin
    else:
        # pas de mission avant ref_time → on considère qu’il est au parc
        location = vehicule.adresse
        available_from = ref_time

    # NEXT MISSION (après ref_time)
    next_mission = (
        vehicule.affectations
        .filter(date_heure_debut__gte=ref_time)
        .order_by("date_heure_debut")
        .first()
    )

    available_until = next_mission.date_heure_debut if next_mission else None

    return {
        "location": location,
        "available_from": available_from,
        "available_until": available_until,
    }


class RentoutAvailableVehiclesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        GET /api/rentout/available-vehicles/
          ?aeroport=TUN
          &zone=TUNIS            (optionnel, chaîne libre)
          &pax=40
          &hotel=LAICO+TUNIS+SPA
          &heure=2025-12-06T23:33
        """

        aeroport = (request.GET.get("aeroport") or "").strip()
        zone_name = (request.GET.get("zone") or "").strip()
        hotel_client = (request.GET.get("hotel") or "").strip()

        # PAX
        try:
            pax_demande = int(request.GET.get("pax") or 0)
        except ValueError:
            pax_demande = 0

        # Datetime de la demande (optionnel)
        heure_str = (request.GET.get("heure") or "").strip()
        heure_demande = None
        if heure_str:
            try:
                naive = datetime.fromisoformat(heure_str)
                # on le rend aware dans le timezone projet
                heure_demande = timezone.make_aware(naive)
            except Exception:
                heure_demande = None

        profile = getattr(request.user, "profile", None)
        user_agence = getattr(profile, "agence", None)

        # Zone pour calculer/approximer la distance (optionnel)
        zone_obj = None
        if zone_name:
            zone_obj = Zone.objects.filter(nom__iexact=zone_name).first()

        # Véhicules mis en RENTOÛT et avec statut "dispo"
        qs = (
            Vehicule.objects.filter(
                louer_autres_agences=True,
                statut="dispo",
            )
            .select_related("agence")
        )

        # On ne propose pas les véhicules de la même agence que l'utilisateur
        if user_agence:
            qs = qs.exclude(agence=user_agence)

        results = []

        for v in qs:
            # ===== 1. CAPACITÉ =====
            if pax_demande and v.capacite is not None and v.capacite < pax_demande:
                continue

            # ===== 2. TARIF =====
            #   - tarif spécifique au véhicule (le moins cher)
            #   - ou tarif par type de véhicule pour l'agence (le moins cher)
            tarif = (
                VehiculeTarifZone.objects.filter(
                    vehicule=v,
                    aeroport=aeroport,
                )
                .order_by("prix")
                .first()
            )

            if not tarif:
                tarif = (
                    VehiculeTarifZone.objects.filter(
                        agence=v.agence,
                        aeroport=aeroport,
                        type_code__iexact=v.type,
                    )
                    .order_by("prix")
                    .first()
                )

            if not tarif:
                # véhicule non tarifé sur cet aéroport → on ne le propose pas
                continue

            # ===== 3. ETAT REEL (fenêtre de dispo) =====
            state = get_vehicle_real_state(v, ref_time=heure_demande)
            dispo_de = state["available_from"]
            dispo_jusqua = state["available_until"]
            position_actuelle = state["location"] or v.adresse

            # Fenêtre incohérente
            if dispo_jusqua and dispo_de and dispo_de >= dispo_jusqua:
                continue

            # ===== 4. CONTRAINTE SUR L'HEURE DEMANDEE (optionnelle) =====
            if heure_demande:
                # on veut que l'heure de prise soit dans la fenêtre de dispo
                if dispo_de and heure_demande < dispo_de:
                    continue
                if dispo_jusqua and heure_demande > dispo_jusqua:
                    continue

            # ===== 5. DISTANCE (approximation texte + éventuellement GPS) =====
            distance_km = None
            if zone_name:
                adr_txt = (position_actuelle or v.adresse or "").lower()
                z = zone_name.lower()

                # 5.1 : le véhicule est déjà dans la zone → 0 km
                if z in adr_txt:
                    distance_km = 0.0

                # 5.2 : si tu as une zone + lat/lng, calcul réel
                elif (
                    zone_obj
                    and v.last_lat is not None
                    and v.last_lng is not None
                    and zone_obj.center_lat is not None
                    and zone_obj.center_lng is not None
                ):
                    distance_km = Vehicule._distance_km(
                        v.last_lat,
                        v.last_lng,
                        zone_obj.center_lat,
                        zone_obj.center_lng,
                    )
                # 5.3 : sinon, "loin"
                else:
                    distance_km = 9999.0

            # ===== 6. AJOUT AU RESULTAT =====
            results.append(
                {
                    "id": v.id,
                    "marque": v.marque,
                    "modele": v.modele,
                    "type": v.type,
                    "capacite": v.capacite,
                    "annee": v.annee_mise_en_circulation,
                    "position_actuelle": position_actuelle,
                    "adresse": position_actuelle,
                    "hotel_client": hotel_client,
                    "zone_client": zone_name,
                    "agence": v.agence.nom,
                    "tarif": float(tarif.prix),
                    "devise": tarif.devise,
                    "dispo_de": dispo_de,
                    "dispo_jusqua": dispo_jusqua,
                    "distance_km": distance_km,
                }
            )

        # ===== 7. TRI PAR DÉFAUT : distance puis tarif puis dispo =====
        now = timezone.now()

        def sort_key(x):
            d = x.get("distance_km")
            d_key = d if d is not None else 999999.0
            return (
                d_key,
                x["tarif"],
                x["dispo_de"] or now,
                x["dispo_jusqua"] or (now + timedelta(days=30)),
            )

        results.sort(key=sort_key)

        return Response(results)
