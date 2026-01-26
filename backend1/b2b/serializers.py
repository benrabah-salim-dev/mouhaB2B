# b2b/serializers.py en monolith
from __future__ import annotations

from datetime import datetime, time as dtime
from typing import Any, Optional

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import serializers

from .models import (
    AgenceVoyage,
    AgencyApplication,
    Chauffeur,
    Dossier,
    ExcursionEvent,
    ExcursionStep,
    ExcursionTemplate,
    FicheMouvement,
    Hotel,
    LanguageMapping,
    Mission,
    MissionRessource,
    OrdreMission,
    Profile,
    Vehicule,
    Zone,
)

# ============================================================
# Profile / User
# ============================================================

class ProfileSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)

    class Meta:
        model = Profile
        fields = ["role", "agence", "agence_nom"]


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)
    agence_nom = serializers.CharField(source="profile.agence_nom", read_only=True)
    role = serializers.CharField(source="profile.role", read_only=True)
    agence_id = serializers.IntegerField(source="profile.agence_id", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "profile",
            "agence_nom",
            "agence_id",
            "role",
        ]


# ============================================================
# AgencyApplication (public / admin)
# ============================================================

class AgencyApplicationPublicSerializer(serializers.ModelSerializer):
    rep_date_naissance = serializers.DateField(
        required=False,
        allow_null=True,
        input_formats=["%Y-%m-%d"],
    )

    class Meta:
        model = AgencyApplication
        fields = [
            "id",
            "legal_name",
            "rne",
            "code_fiscal",
            "code_categorie",
            "etab_secondaire",
            "logo_file",
            "rne_doc_file",
            "patente_doc_file",
            "company_country",
            "company_address",
            "company_email",
            "company_phone",
            "rep_prenom",
            "rep_nom",
            "rep_cin",
            "rep_date_naissance",
            "rep_photo_file",
            "rep_email",
            "rep_phone",
            "otp_delivery",
        ]
        extra_kwargs = {
            "rne_doc_file": {"required": False, "allow_null": True},
            "patente_doc_file": {"required": False, "allow_null": True},
            "rep_date_naissance": {"required": False, "allow_null": True},
        }

    def create(self, validated_data):
        # place-holder OTP
        otp_code = validated_data.get("otp_code")
        if otp_code:
            validated_data["otp_verified"] = True
        return super().create(validated_data)


class AgencyApplicationAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgencyApplication
        fields = [
            "id",
            "created_at",
            "statut",
            "legal_name",
            "rne",
            "code_fiscal",
            "code_categorie",
            "etab_secondaire",
            "logo_file",
            "rne_doc_file",
            "patente_doc_file",
            "company_country",
            "company_address",
            "company_email",
            "company_phone",
            "rep_prenom",
            "rep_nom",
            "rep_cin",
            "rep_date_naissance",
            "rep_photo_file",
            "rep_email",
            "rep_phone",
            "otp_delivery",
            "otp_verified",
            "agence",
            "decided_at",
            "decided_by",
        ]


# ============================================================
# Agence / Véhicule / Chauffeur / Hotel
# ============================================================

class AgenceVoyageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgenceVoyage
        fields = "__all__"


def _parse_time(val: Any) -> Optional[dtime]:
    """
    horaires peut être "11:35" ou "11:35:00" ou null
    """
    if not val:
        return None
    s = str(val).strip()
    try:
        if len(s) == 5:
            return datetime.strptime(s, "%H:%M").time()
        if len(s) == 8:
            return datetime.strptime(s, "%H:%M:%S").time()
    except Exception:
        return None
    return None


def _mission_dt(m: Mission) -> Optional[datetime]:
    """
    Construit un datetime aware à partir de Mission.date + Mission.horaires
    """
    if not m or not getattr(m, "date", None):
        return None
    t = _parse_time(getattr(m, "horaires", None)) or dtime(0, 0)
    dt_naive = datetime.combine(m.date, t)
    if timezone.is_naive(dt_naive):
        return timezone.make_aware(dt_naive, timezone.get_current_timezone())
    return dt_naive


class VehiculeSerializer(serializers.ModelSerializer):
    last_mission_zone = serializers.SerializerMethodField()
    next_mission_zone = serializers.SerializerMethodField()

    class Meta:
        model = Vehicule
        fields = [
            "id",
            "type",
            "marque",
            "modele",
            "capacite",
            "immatriculation",
            "agence",
            "statut",
            "adresse",
            "last_lat",
            "last_lng",
            "annee_mise_en_circulation",
            "louer_autres_agences",
            "last_mission_zone",
            "next_mission_zone",
        ]

    def _zone_label(self, m: Mission) -> Optional[str]:
        if not m:
            return None
        zfk = getattr(m, "zone_fk", None)
        if zfk:
            return (getattr(zfk, "nom", None) or getattr(zfk, "name", None) or "").strip() or None
        z = getattr(m, "zone", None)
        return str(z).strip() if z else None

    def get_last_mission_zone(self, obj: Vehicule):
        now = timezone.now()
        qs = Mission.objects.filter(vehicule=obj).order_by("-date", "-horaires")
        for m in qs[:50]:
            dt = _mission_dt(m)
            if dt and dt <= now:
                return self._zone_label(m)
        return None

    def get_next_mission_zone(self, obj: Vehicule):
        now = timezone.now()
        qs = Mission.objects.filter(vehicule=obj).order_by("date", "horaires")
        for m in qs[:50]:
            dt = _mission_dt(m)
            if dt and dt >= now:
                return self._zone_label(m)
        return None


class ChauffeurSerializer(serializers.ModelSerializer):
    agence_nom = serializers.CharField(source="agence.nom", read_only=True)

    class Meta:
        model = Chauffeur
        fields = "__all__"


class HotelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hotel
        fields = "__all__"


# ============================================================
# Fiche Mouvement
# ============================================================

class FicheMouvementSerializer(serializers.ModelSerializer):
    hotel_schedule = serializers.JSONField(required=False)
    ville = serializers.SerializerMethodField()
    code_postal = serializers.SerializerMethodField()
    hotels = serializers.SerializerMethodField()

    class Meta:
        model = FicheMouvement
        fields = [
            "id",
            "ref",
            "agence",
            "type",
            "date",
            "horaires",
            "provenance",
            "destination",
            "numero_vol",
            "client_to",
            "hotel",
            "hotels",
            "ville",
            "code_postal",
            "pax",
            "adulte",
            "enfants",
            "bebe",
            "hotel_schedule",
            "remarque",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["ref", "created_by", "created_at"]

    def _first_dossier(self, obj: FicheMouvement):
        rel = getattr(obj, "dossiers", None)
        if not rel:
            return None
        try:
            return rel.all().first()
        except Exception:
            return None

    def get_hotels(self, obj: FicheMouvement):
        # 1) Priorité : hotel_schedule
        hs = getattr(obj, "hotel_schedule", None)
        if isinstance(hs, list) and hs:
            names = []
            for item in hs:
                if isinstance(item, dict):
                    name = (item.get("hotel") or "").strip()
                    if name:
                        names.append(name)
            return list(dict.fromkeys(names))

        # 2) Fallback : dossiers -> hotel
        rel = getattr(obj, "dossiers", None)
        if not rel:
            return []
        names = []
        for d in rel.all():
            h = getattr(d, "hotel", None)
            if h:
                names.append(str(h).strip())
        return list(dict.fromkeys([n for n in names if n]))

    def get_ville(self, obj: FicheMouvement):
        d0 = self._first_dossier(obj)
        if d0 and getattr(d0, "zone_fk_id", None):
            return getattr(d0.zone_fk, "ville", None) or getattr(d0.zone_fk, "nom", None)
        return None

    def get_code_postal(self, obj: FicheMouvement):
        d0 = self._first_dossier(obj)
        if d0 and getattr(d0, "zone_fk_id", None):
            return getattr(d0.zone_fk, "code_postal", None) or getattr(d0.zone_fk, "cp", None)
        return None

    def validate(self, data):
        adulte = data.get("adulte", 0) or 0
        enfants = data.get("enfants", 0) or 0
        bebe = data.get("bebe", 0) or 0
        if not data.get("pax"):
            data["pax"] = adulte + enfants + bebe
        return data


# ============================================================
# Mission (✅ complet pour TransfertsList)
# ============================================================

class MissionSerializer(serializers.ModelSerializer):
    # compat front: heure_vol = horaires
    heure_vol = serializers.TimeField(source="horaires", required=False, allow_null=True)

    kind = serializers.SerializerMethodField()
    vehicule = serializers.SerializerMethodField()
    chauffeur = serializers.SerializerMethodField()

    # ✅ affichage: pax + fenêtre
    pax_total = serializers.SerializerMethodField()
    date_heure_debut = serializers.SerializerMethodField()
    date_heure_fin = serializers.SerializerMethodField()

    # ✅ détails passage
    passage = serializers.SerializerMethodField()

    class Meta:
        model = Mission
        fields = [
            "id",
            "type",
            "date",
            "aeroport",
            "numero_vol",
            "heure_vol",
            "kind",
            "vehicule",
            "chauffeur",
            "pax_total",
            "date_heure_debut",
            "date_heure_fin",
            "passage",
            "remarque",
        ]

    def _main_ressource(self, obj: Mission) -> Optional[MissionRessource]:
        try:
            return (
                MissionRessource.objects
                .filter(mission=obj, is_deleted=False)
                .order_by("-date_heure_fin", "-id")
                .first()
            )
        except Exception:
            return None

    def _combine_date_time(self, d, t):
        if not d:
            return None
        t = t or dtime(0, 0)
        dt_naive = datetime.combine(d, t)
        if timezone.is_naive(dt_naive):
            return timezone.make_aware(dt_naive, timezone.get_current_timezone())
        return dt_naive

    def get_kind(self, obj: Mission):
        # priorité : obj.main_kind si tu l’as
        mk = getattr(obj, "main_kind", None)
        if mk:
            return "arrivee" if str(mk).upper().startswith(("A", "L")) else "depart"

        # fallback : 1ere fiche
        try:
            f0 = obj.fiches.filter(is_deleted=False).first()
            if f0:
                t = (getattr(f0, "type", "") or "").upper().strip()
                return "arrivee" if t.startswith(("A", "L")) else "depart"
        except Exception:
            pass
        return None

    def get_vehicule(self, obj: Mission):
        v = getattr(obj, "vehicule", None)
        return str(v) if v else None

    def get_chauffeur(self, obj: Mission):
        c = getattr(obj, "chauffeur", None)
        return str(c) if c else None

    def get_pax_total(self, obj: Mission):
        total = 0
        try:
            for f in obj.fiches.filter(is_deleted=False).all():
                total += int(getattr(f, "pax", 0) or 0)
        except Exception:
            pass
        return total

    def get_date_heure_debut(self, obj: Mission):
        mr = self._main_ressource(obj)
        if mr and mr.date_heure_debut:
            return mr.date_heure_debut
        return self._combine_date_time(getattr(obj, "date", None), getattr(obj, "horaires", None))

    def get_date_heure_fin(self, obj: Mission):
        mr = self._main_ressource(obj)
        if mr and mr.date_heure_fin:
            return mr.date_heure_fin
        start = self.get_date_heure_debut(obj)
        return (start + timezone.timedelta(hours=3)) if start else None

    def get_passage(self, obj: Mission):
        out = []
        try:
            fiches = obj.fiches.filter(is_deleted=False).all()
        except Exception:
            fiches = []

        for f in fiches:
            hs = getattr(f, "hotel_schedule", None) or []
            if not isinstance(hs, list):
                continue

            for item in hs:
                if not isinstance(item, dict):
                    continue

                hotel = (item.get("hotel") or "").strip()
                if not hotel:
                    continue

                heure = (
                    item.get("heure_pickup")
                    or item.get("heure_depot")
                    or item.get("override_time")
                    or item.get("heure_aeroport")
                    or item.get("heure_vol")
                    or None
                )
                heure = str(heure)[:5] if heure else None

                out.append({
                    "hotel": hotel,
                    "heure": heure,
                    "pax": item.get("pax", None),
                })

        # dédoublonnage (hotel+heure) en gardant l’ordre
        seen = set()
        unique = []
        for x in out:
            k = (x.get("hotel"), x.get("heure"))
            if k in seen:
                continue
            seen.add(k)
            unique.append(x)

        return unique


class OrdreMissionSerializer(serializers.ModelSerializer):
    chauffeur_fullname = serializers.SerializerMethodField()

    class Meta:
        model = OrdreMission
        fields = "__all__"

    def get_chauffeur_fullname(self, obj: OrdreMission):
        chauffeur = getattr(obj, "chauffeur", None)
        if chauffeur:
            return f"{chauffeur.prenom} {chauffeur.nom}"
        return None


# ============================================================
# LanguageMapping
# ============================================================

class LanguageMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = LanguageMapping
        fields = "__all__"


# ============================================================
# Dossier
# ============================================================

class DossierSerializer(serializers.ModelSerializer):
    ref = serializers.CharField(source="reference", read_only=True)
    type = serializers.CharField(source="type_mouvement", read_only=True)
    client_to = serializers.CharField(source="client", read_only=True)
    dossier_id = serializers.IntegerField(source="id", read_only=True)

    hotel = serializers.SerializerMethodField()
    date = serializers.SerializerMethodField()
    horaires = serializers.TimeField(format="%H:%M", allow_null=True, required=False)

    zone = serializers.SerializerMethodField()

    class Meta:
        model = Dossier
        fields = [
            "id",
            "dossier_id",
            "ref",
            "reference",
            "agence",
            "type",
            "date",
            "horaires",
            "provenance",
            "destination",
            "numero_vol",
            "client",
            "client_to",
            "hotel",
            "hotel_fk",
            "ville",
            "code_postal",
            "zone",
            "zone_fk",
            "titulaire",
            "pax",
            "adulte",
            "enfants",
            "bb_gratuit",
            "observation",
            "created_at",
            "created_by",
        ]
        read_only_fields = ["id", "dossier_id", "ref", "created_at", "created_by"]

    def get_zone(self, obj: Dossier):
        if getattr(obj, "zone_fk_id", None):
            return getattr(obj.zone_fk, "nom", None)
        return None

    def get_date(self, obj: Dossier):
        if getattr(obj, "date", None):
            return obj.date.strftime("%Y-%m-%d")
        if getattr(obj, "created_at", None):
            return obj.created_at.date().strftime("%Y-%m-%d")
        return None

    def get_hotel(self, obj: Dossier):
        if getattr(obj, "hotel", None):
            return obj.hotel
        if getattr(obj, "hotel_fk_id", None):
            return getattr(obj.hotel_fk, "nom", None)
        return None


# ============================================================
# Zones / Excursions
# ============================================================

class ZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = "__all__"


class ExcursionStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExcursionStep
        fields = [
            "id",
            "ordre",
            "nom",
            "adresse",
            "lat",
            "lng",
            "is_meal_stop_matin",
            "is_meal_stop_midi",
            "is_meal_stop_soir",
            "duree_arret_minutes",
        ]


class ExcursionTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExcursionTemplate
        fields = [
            "id",
            "nom",
            "description",
            "type_duree",
            "nb_jours",
            "repas_inclus",
            "depart_label",
            "depart_lat",
            "depart_lng",
            "depart_place_id",
            "retour_lat",
            "retour_lng",
            "retour_label",
            "retour_place_id",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ExcursionEventSerializer(serializers.ModelSerializer):
    template_label = serializers.CharField(source="template.nom", read_only=True)
    agence_label = serializers.CharField(source="agence.nom", read_only=True)
    vehicule_label = serializers.SerializerMethodField()
    chauffeur_label = serializers.SerializerMethodField()

    class Meta:
        model = ExcursionEvent
        fields = [
            "id",
            "template",
            "template_label",
            "agence",
            "agence_label",
            "date_debut",
            "date_fin",
            "heure_depart",
            "heure_retour_estimee",
            "repas_matin",
            "repas_midi",
            "repas_soir",
            "vehicle_source",
            "vehicule_interne",
            "vehicule_rentout",
            "chauffeur",
            "vehicule_label",
            "chauffeur_label",
            "nb_participants",
            "statut",
            "notes",
            "mission",
            "created_at",
        ]
        read_only_fields = ("agence", "created_at")

    def get_vehicule_label(self, obj: ExcursionEvent):
        v = getattr(obj, "vehicule_interne", None) or getattr(obj, "vehicule_rentout", None)
        return str(v) if v else None

    def get_chauffeur_label(self, obj: ExcursionEvent):
        c = getattr(obj, "chauffeur", None)
        return str(c) if c else None

    def validate(self, attrs):
        vehicle_source = attrs.get("vehicle_source", getattr(self.instance, "vehicle_source", None))
        veh_int = attrs.get("vehicule_interne", getattr(self.instance, "vehicule_interne", None))
        veh_rent = attrs.get("vehicule_rentout", getattr(self.instance, "vehicule_rentout", None))

        if vehicle_source == "INTERNAL" and not veh_int:
            raise serializers.ValidationError({"vehicule_interne": "Merci de sélectionner un véhicule de votre flotte."})
        if vehicle_source == "RENTOUT" and not veh_rent:
            raise serializers.ValidationError({"vehicule_rentout": "Merci de sélectionner un véhicule Rentout."})
        return attrs
