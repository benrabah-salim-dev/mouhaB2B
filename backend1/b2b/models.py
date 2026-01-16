# b2b/models.py en monolith
from __future__ import annotations

from datetime import time as _time
from math import atan2, cos, radians, sqrt

from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone
from numpy import sin

from b2b.services.geocoding import lookup_hotel_address
from django.utils.crypto import get_random_string
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from math import radians, cos, sin, asin, sqrt
import logging


logger = logging.getLogger(__name__)

import logging
from math import radians, sin, cos, asin, sqrt

from django.db import models


# =========================
# Tiers
# =========================

class TourOperateur(models.Model):
    nom = models.CharField(max_length=100)
    adresse = models.TextField(blank=True)
    email = models.EmailField(blank=True, null=True)
    telephone = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        verbose_name = "Tour Opérateur"
        verbose_name_plural = "Tour Opérateurs"
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class AgenceVoyage(models.Model):
    """
    Agence "finale" créée après validation d'une demande d'inscription.
    On aligne les champs sur AgencyApplication pour pouvoir mapper facilement.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="agence",
    )
    tour_operateur = models.ForeignKey(
        "b2b.TourOperateur",
        on_delete=models.CASCADE,
        related_name="agences",
        null=True,
        blank=True,
    )

    # ===== Infos entreprise (alignées sur AgencyApplication) =====
    nom = models.CharField("Raison sociale", max_length=255)
    rne = models.CharField("RNE", max_length=100, blank=True, null=True)
    code_fiscal = models.CharField(max_length=100, blank=True, null=True)
    code_categorie = models.CharField(max_length=100, blank=True, null=True)
    etab_secondaire = models.CharField(max_length=100, blank=True, null=True)
    logo_file = models.ImageField(
        upload_to="agencies/logos/",
        blank=True,
        null=True,
    )

    pays = models.CharField(max_length=100, blank=True, null=True)
    adresse = models.TextField(blank=True, default="")
    email = models.EmailField(blank=True, null=True)
    telephone = models.CharField(max_length=50, blank=True, null=True)

    # Téléphone urgence client (pour ton tableau / gestion SAV)
    telephone_urgence_client = models.CharField(max_length=50, blank=True, null=True)

    # ===== Contact / représentant légal (mappé depuis la demande) =====
    rep_prenom = models.CharField(max_length=100, blank=True, null=True)
    rep_nom = models.CharField(max_length=100, blank=True, null=True)
    rep_cin = models.CharField(max_length=50, blank=True, null=True)
    rep_date_naissance = models.DateField(blank=True, null=True)
    rep_email = models.EmailField(blank=True, null=True)
    rep_phone = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom


# =========================
# Demande d'inscription (wizard public)
# =========================

class AgencyApplication(models.Model):
    STATUS_CHOICES = [
        ("en_attente", "En attente"),
        ("validee", "Validée"),
        ("refusee", "Refusée"),
    ]

    OTP_DELIVERY_CHOICES = [
        ("email", "E-mail"),
        ("sms", "SMS"),
    ]

    id = models.AutoField(primary_key=True)  # Demande N°

    # ===== Étape 1 — Entreprise =====
    legal_name = models.CharField(max_length=255)   # Raison sociale
    rne = models.CharField(max_length=100)          # N° RNE
    code_fiscal = models.CharField(max_length=100)
    code_categorie = models.CharField(max_length=100)
    etab_secondaire = models.CharField(max_length=100)
    logo_file = models.ImageField(
        upload_to="agencies/logos/",
        blank=True,
        null=True,
    )
    # Fichiers justificatifs
    rne_doc_file = models.FileField(
        upload_to="agences/rne_docs/",
        blank=True,
        null=True,
        verbose_name="Document RNE (PDF/image)",
    )
    patente_doc_file = models.FileField(
        upload_to="agences/patente_docs/",
        blank=True,
        null=True,
        verbose_name="Patente / Registre de commerce (PDF/image)",
    )

    company_country = models.CharField(max_length=100)
    company_address = models.TextField(blank=True, default="")
    company_email = models.EmailField()
    company_phone = models.CharField(max_length=50)

    # ===== Étape 2 — Représentant légal =====
    rep_prenom = models.CharField(max_length=100)
    rep_nom = models.CharField(max_length=100)
    rep_cin = models.CharField(maxlength=50) if False else models.CharField(max_length=50)  # sécurité au cas de typo
    rep_date_naissance = models.DateField()
    rep_photo_file = models.ImageField(
        upload_to="agencies/reps/",
        blank=True,
        null=True,
    )

    rep_email = models.EmailField()
    rep_phone = models.CharField(max_length=50)
    otp_delivery = models.CharField(
        max_length=10,
        choices=OTP_DELIVERY_CHOICES,
    )

    # ===== Étape 3 — OTP (simple stockage pour l’instant) =====
    otp_code = models.CharField(
        max_length=10,
        blank=True,
        null=True,
        help_text="Code saisi par le client (à valider côté plateforme / gestionnaire).",
    )
    otp_verified = models.BooleanField(default=False)

    # ===== Suivi / statut =====
    statut = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="en_attente",
        db_index=True,
    )
    agence = models.ForeignKey(
        "b2b.AgenceVoyage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="applications_origine",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agency_applications_created",
    )

    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agency_applications_decided",
    )

    # =========================
    # Logique métier : approbation
    # =========================
    def approve(self, decided_by: User | None = None):
        # Pas besoin d'importer b2b.models ici, on est déjà dedans
        if self.statut == "validee" and self.agence_id:
            user = self.agence.user
            return self.agence, user, None

        with transaction.atomic():
            raw_password = None

            # ---------- USER ----------
            email = self.rep_email or self.company_email
            user = None
            if email:
                user = User.objects.filter(email=email).first()

            if not user:
                if self.rep_email:
                    base_username = self.rep_email.split("@")[0]
                else:
                    base_username = f"agence{self.id}"

                username = base_username
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}_{get_random_string(4)}"

                raw_password = get_random_string(
                    12,
                    "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
                )

                user = User.objects.create_user(
                    username=username,
                    email=email,
                    first_name=self.rep_prenom,
                    last_name=self.rep_nom,
                    password=raw_password,
                )

            # ---------- PROFILE (créé ici uniquement) ----------
            profile, _ = Profile.objects.get_or_create(
                user=user,
                defaults={"role": "adminagence"},
            )
            if profile.role != "adminagence":
                profile.role = "adminagence"
                profile.save(update_fields=["role"])

            # ---------- AGENCE ----------
            defaults_agence = {
                "nom": self.legal_name,
                "rne": self.rne,
                "code_fiscal": self.code_fiscal,
                "code_categorie": self.code_categorie,
                "etab_secondaire": self.etab_secondaire,
                "logo_file": self.logo_file,
                "pays": self.company_country,
                "adresse": self.company_address,
                "email": self.company_email,
                "telephone": self.company_phone,
                "rep_prenom": self.rep_prenom,
                "rep_nom": self.rep_nom,
                "rep_cin": self.rep_cin,
                "rep_date_naissance": self.rep_date_naissance,
                "rep_email": self.rep_email,
                "rep_phone": self.rep_phone,
            }

            agence, created = AgenceVoyage.objects.get_or_create(
                user=user,
                defaults=defaults_agence,
            )

            if not created:
                changed = False
                for field, value in defaults_agence.items():
                    if value and getattr(agence, field) in (None, ""):
                        setattr(agence, field, value)
                        changed = True
                if changed:
                    agence.save()

            if profile.agence_id != agence.id:
                profile.agence = agence
                profile.save(update_fields=["agence"])

            self.statut = "validee"
            self.agence = agence
            self.decided_at = timezone.now()
            if decided_by is not None:
                self.decided_by = decided_by
            self.save(update_fields=["statut", "agence", "decided_at", "decided_by"])

        return agence, user, raw_password


# =========================
# Profils Utilisateurs
# =========================

class Profile(models.Model):
    ROLE_CHOICES = (
        ("superadmin", "Super Admin"),
        ("adminagence", "Admin Agence"),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    agence = models.ForeignKey("b2b.AgenceVoyage", on_delete=models.SET_NULL, null=True, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="adminagence")

    def __str__(self):
        return f"{self.user.username} ({self.role})"
    
    

# =========================
# Audit Log (historique modifications)
# =========================

from django.conf import settings
from django.db import models

class AuditLog(models.Model):
    ACTION_CREATE = "create"
    ACTION_UPDATE = "update"
    ACTION_DELETE = "delete"

    ACTION_CHOICES = [
        (ACTION_CREATE, "Create"),
        (ACTION_UPDATE, "Update"),
        (ACTION_DELETE, "Delete"),
    ]

    entity = models.CharField(max_length=80, db_index=True)         # ex: "Mission", "OrdreMission"
    entity_id = models.PositiveIntegerField(db_index=True)          # id de l'objet
    action = models.CharField(max_length=10, choices=ACTION_CHOICES, db_index=True)

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    # Pour UPDATE: {"field": {"from": X, "to": Y}, ...}
    # Pour CREATE/DELETE: snapshot simple
    changes = models.JSONField(default=dict, blank=True)

    # si tu veux stocker IP, user-agent, etc
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["entity", "entity_id", "created_at"]),
        ]

    def __str__(self):
        return f"{self.entity}#{self.entity_id} {self.action} @ {self.created_at}"



class Succursale(models.Model):
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.CASCADE, related_name="succursales")
    nom = models.CharField(max_length=100)
    adresse = models.TextField(blank=True)
    email = models.EmailField(blank=True, null=True)
    telephone = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        ordering = ["agence__nom", "nom"]

    def __str__(self):
        return f"{self.nom} ({self.agence.nom})"


# =========================
# Référentiels géographiques / hébergement
# =========================



class Zone(models.Model):
    TYPE_CHOICES = (
        ("circle", "Cercle"),
        ("rectangle", "Rectangle"),
        ("polygon", "Polygone"),
    )

    nom = models.CharField(max_length=150)
    # villes optionnelles (info humaine)
    ville = models.TextField(blank=True, null=True)

    type = models.CharField(max_length=20, null=True, blank=True, default="circle")

    # Cercle
    center_lat = models.FloatField(blank=True, null=True)
    center_lng = models.FloatField(blank=True, null=True)
    radius_m = models.IntegerField(blank=True, null=True)

    # Rectangle / bbox
    north = models.FloatField(blank=True, null=True)
    south = models.FloatField(blank=True, null=True)
    east = models.FloatField(blank=True, null=True)
    west = models.FloatField(blank=True, null=True)

    code_postal = models.CharField(max_length=20, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom

    # ---------- helpers ----------
    def _contains_circle(self, lat: float, lng: float) -> bool:
        if not all(v is not None for v in [self.center_lat, self.center_lng, self.radius_m]):
            return False

        # Haversine (mètres)
        R = 6371000
        lat1, lon1, lat2, lon2 = map(radians, [self.center_lat, self.center_lng, lat, lng])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        c = 2 * asin(sqrt(a))
        return (R * c) <= float(self.radius_m)

    def _contains_bbox(self, lat: float, lng: float) -> bool:
        if not all(v is not None for v in [self.north, self.south, self.east, self.west]):
            return False
        return float(self.south) <= float(lat) <= float(self.north) and float(self.west) <= float(lng) <= float(self.east)

    # ---------- public ----------
    def contains_point(self, lat: float, lng: float) -> bool:
        """
        Vérifie si le point (lat,lng) appartient à la zone.
        - circle: haversine
        - rectangle: bbox
        - polygon: fallback bbox si dispo, sinon cercle si dispo (car on n'a pas les sommets du polygone)
        """
        try:
            if lat is None or lng is None:
                return False

            t = (self.type or "").strip().lower()

            if t == "circle":
                return self._contains_circle(lat, lng)

            if t == "rectangle":
                return self._contains_bbox(lat, lng)

            if t == "polygon":
                # ✅ IMPORTANT : tu n'as pas de sommets => on fallback
                if self._contains_bbox(lat, lng):
                    return True
                if self._contains_circle(lat, lng):
                    return True
                return False

            # type inconnu => fallback sécurité
            if self._contains_bbox(lat, lng):
                return True
            if self._contains_circle(lat, lng):
                return True
            return False

        except Exception as e:
            logger.exception(f"Erreur calcul zone {self.nom}: {e}")
            return False

from django.db import models

class Hotel(models.Model):
    nom = models.CharField(max_length=100, unique=True)
    adresse = models.TextField(blank=True, null=True)

    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    place_id = models.CharField(max_length=128, null=True, blank=True)
    formatted_address = models.TextField(null=True, blank=True)

    zone = models.ForeignKey("b2b.Zone", on_delete=models.SET_NULL, null=True, blank=True, related_name="hotels")
    agence = models.ForeignKey("b2b.AgenceVoyage", on_delete=models.SET_NULL, null=True, blank=True, related_name="hotels")

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom



# =========================
# Dossier
# =========================

# b2b/models.py
from django.db import models
from django.utils import timezone
from django.conf import settings

class Dossier(models.Model):
    agence = models.ForeignKey("b2b.AgenceVoyage", on_delete=models.CASCADE)

    reference = models.CharField(max_length=100, blank=True, null=True)
    type_mouvement = models.CharField(
        max_length=1,
        choices=[("A","Arrivée"),("D","Départ"),("L","Arrivée locale"),("S","Sortie")]
    )

    date = models.DateField(null=True, blank=True)
    horaires = models.TimeField(null=True, blank=True)

    provenance = models.CharField(max_length=100, null=True, blank=True)
    destination = models.CharField(max_length=100, null=True, blank=True)
    numero_vol = models.CharField(max_length=100, null=True, blank=True)

    client = models.CharField(max_length=255, null=True, blank=True)
    titulaire = models.CharField(max_length=255, null=True, blank=True)

    pax = models.PositiveIntegerField(default=0)
    adulte = models.PositiveIntegerField(default=0)
    enfants = models.PositiveIntegerField(default=0)
    bb_gratuit = models.PositiveIntegerField(default=0)

    hotel = models.CharField(max_length=255, null=True, blank=True)
    hotel_fk = models.ForeignKey("b2b.Hotel", null=True, blank=True, on_delete=models.SET_NULL)
    zone_fk = models.ForeignKey("b2b.Zone", null=True, blank=True, on_delete=models.SET_NULL)

    # ✅ Lien vers la fiche créée à partir de ce dossier
    fiche_mouvement = models.ForeignKey(
        "b2b.FicheMouvement",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="dossiers",
    )

    is_transformed = models.BooleanField(default=False)
    dossiers_refs = models.TextField(blank=True, null=True)
    
    ville = models.CharField(max_length=255, null=True, blank=True)
    code_postal = models.CharField(max_length=20, null=True, blank=True)

    observation = models.TextField(null=True, blank=True)  # ✅ primordiale

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self):
        return f"{self.reference} ({self.pax} pax)"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"DOS-{self.agence_id or 'X'}-{timezone.now().strftime('%Y%m%d%H%M%S%f')}"
        super().save(*args, **kwargs)



from django.db import models, transaction
from django.utils import timezone


class ReferenceSequence(models.Model):
    """
    Compteur journalier par prefix: FM / M / OM
    0001 -> 9999, reset chaque jour
    """
    prefix = models.CharField(max_length=10)
    day = models.DateField()
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("prefix", "day")
        indexes = [models.Index(fields=["prefix", "day"])]

    def __str__(self):
        return f"{self.prefix}-{self.day} ({self.last_number})"


def generate_daily_reference(prefix: str, day=None) -> str:
    """
    PREFIX-YYYYMMDD-0001 ... 9999
    Safe concurrence (select_for_update)
    """
    prefix = (prefix or "").strip().upper()
    if not prefix:
        raise ValidationError("Prefix de référence invalide.")

    if day is None:
        day = timezone.localdate()

    ymd = day.strftime("%Y%m%d")

    with transaction.atomic():
        seq, _ = ReferenceSequence.objects.select_for_update().get_or_create(
            prefix=prefix,
            day=day,
            defaults={"last_number": 0},
        )
        nxt = int(seq.last_number or 0) + 1
        if nxt > 9999:
            raise ValidationError(f"Limite atteinte: {prefix}-{ymd}-9999 (trop d'objets ce jour).")

        seq.last_number = nxt
        seq.save(update_fields=["last_number"])

    return f"{prefix}-{ymd}-{nxt:04d}"

# =========================
# Fiche Mouvement
# =========================

from django.db import models
from django.utils import timezone
from django.conf import settings

class FicheMouvement(models.Model):
    ref = models.CharField(max_length=50, unique=True, editable=False)

    agence = models.ForeignKey(
        "b2b.AgenceVoyage",
        on_delete=models.CASCADE,
        related_name="fiches_mouvement",
    )

    # A = arrivée, D = départ (mets tes choix si tu veux)
    type = models.CharField(max_length=1)
    date = models.DateField()
    horaires = models.TimeField(null=True, blank=True)

    provenance = models.CharField(max_length=100, null=True, blank=True)
    destination = models.CharField(max_length=100, null=True, blank=True)
    numero_vol = models.CharField(max_length=100, null=True, blank=True)

    client_to = models.CharField(max_length=255, null=True, blank=True)

    pax = models.PositiveIntegerField(default=0)
    adulte = models.PositiveIntegerField(default=0)
    enfants = models.PositiveIntegerField(default=0)
    bebe = models.PositiveIntegerField(default=0)

    # Ex: [{"hotel": "...", "pax": 30, ...}, ...]
    hotel_schedule = models.JSONField(null=True, blank=True, default=list)

    # hotel principal (optionnel)
    hotel = models.ForeignKey(
        "b2b.Hotel",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fiches",
    )

    # ✅ Lien vers mission (ton front utilise mission__isnull)
    mission = models.ForeignKey(
        "b2b.Mission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fiches",
    )
    
    observation = models.TextField(null=True, blank=True)
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="fiches_creees",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # ✅ Soft delete
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.ref

    def save(self, *args, **kwargs):
        if not self.ref:
            # ref basée sur la date métier de la fiche
            day = self.date or timezone.localdate()
            self.ref = generate_daily_reference("FM", day=day)
        super().save(*args, **kwargs)


    def soft_delete(self):
        if self.is_deleted:
            return

        # ✅ rollback dossiers
        self.release_dossiers()

        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])

        

    def release_dossiers(self):
        """
        Remet les dossiers dans l'état 'disponible' (visible) :
        - fiche_mouvement = NULL
        - is_transformed = False
        """
        from b2b.models import Dossier
        Dossier.objects.filter(fiche_mouvement_id=self.id).update(
            fiche_mouvement=None,
            is_transformed=False,
        )



# =========================
# Ressources
# =========================


class Vehicule(models.Model):
    TYPE_CHOICES = [
        ("bus", "Bus"),
        ("minibus", "Minibus"),
        ("microbus", "Microbus"),
        ("4x4", "4x4"),
    ]

    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    marque = models.CharField(max_length=100)
    modele = models.CharField(max_length=100)
    capacite = models.PositiveIntegerField()
    immatriculation = models.CharField(max_length=15, unique=True)

    agence = models.ForeignKey(
        "b2b.AgenceVoyage",
        on_delete=models.CASCADE,
        related_name="vehicules",
    )

    STATUT_CHOICES = (
        ("dispo", "Disponible"),
        ("occupe", "Occupé"),
    )
    statut = models.CharField(
        max_length=10,
        choices=STATUT_CHOICES,
        default="dispo",
    )

    # Adresse actuelle du véhicule (parc, hôtel, aéroport...)
    adresse = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Adresse actuelle du véhicule (agence, hôtel, aéroport...)",
    )

    # Dernière position géo connue
    last_lat = models.FloatField(blank=True, null=True)
    last_lng = models.FloatField(blank=True, null=True)

    annee_mise_en_circulation = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Année de première mise en circulation",
    )

    # RENTOÛT : ce véhicule peut être loué par d'autres agences
    louer_autres_agences = models.BooleanField(
        default=False,
        help_text="Si coché, ce véhicule peut être proposé en RENTOÛT aux autres agences",
    )

    class Meta:
        ordering = ["agence__nom", "immatriculation"]

    def __str__(self):
        return f"{self.marque} {self.modele} ({self.immatriculation})"

    # -----------------------
    # Disponibilités simples
    # -----------------------
    @property
    def est_disponible(self):
        return self.statut == "dispo"

    @property
    def rentout_disponible(self):
        """
        Un véhicule exposable en rentout : case cochée + au moins un tarif.
        """
        if not self.louer_autres_agences:
            return False
        return self.tarifs_zones.exists()

    # =========================
    # ETAT REEL DU VEHICULE
    # =========================
    def get_real_state(self, ref_time=None):
        ref_time = ref_time or timezone.now()

        # dernière affectation terminée AVANT ref_time
        last_aff = (
            self.affectations
            .filter(is_deleted=False, date_heure_fin__lte=ref_time)
            .order_by("-date_heure_fin")
            .first()
        )

        if last_aff:
            location = last_aff.lieu_arrivee or last_aff.lieu_depart or self.adresse
            available_from = last_aff.date_heure_fin
        else:
            location = self.adresse
            available_from = ref_time

        # prochaine affectation
        next_aff = (
            self.affectations
            .filter(is_deleted=False, date_heure_debut__gte=ref_time)
            .order_by("date_heure_debut")
            .first()
        )

        available_until = next_aff.date_heure_debut if next_aff else None

        return {
            "location": location,              # ✅ TOUJOURS une adresse
            "available_from": available_from,  # datetime
            "available_until": available_until # datetime
        }


    # =========================
    # AFFECTATIONS / CHAUFFEUR
    # =========================
    def get_last_affectation(self):
        """
        Dernière affectation (mission) du véhicule, terminée ou en cours.
        Ignore les affectations soft-delete.
        """
        return (
            self.affectations
            .filter(is_deleted=False)
            .select_related("mission", "chauffeur")
            .order_by("-date_heure_fin", "-date_heure_debut")
            .first()
        )

    def get_next_affectation(self):
        """
        Prochaine affectation planifiée à partir de maintenant.
        Ignore les affectations soft-delete.
        """
        return (
            self.affectations
            .filter(is_deleted=False, date_heure_debut__gte=timezone.now())
            .select_related("mission", "chauffeur")
            .order_by("date_heure_debut")
            .first()
        )

    def get_current_location(self):
        """
        Localisation actuelle estimée du véhicule :
        - lieu_arrivee de la dernière affectation,
        - sinon lieu_depart,
        - sinon adresse du parc.
        """
        last = self.get_last_affectation()
        if last:
            return last.lieu_arrivee or last.lieu_depart or self.adresse
        return self.adresse

    def get_dernier_chauffeur(self):
        """
        Chauffeur de la dernière affectation du véhicule (ou None).
        """
        last = self.get_last_affectation()
        return last.chauffeur if last else None

    # =========================
    # GÉO / DISTANCE
    # =========================
    @staticmethod
    def _distance_km(lat1, lng1, lat2, lng2):
        """
        Distance entre 2 points en km (haversine).
        """
        if None in (lat1, lng1, lat2, lng2):
            return None

        R = 6371.0
        dlat = radians(lat2 - lat1)
        dlng = radians(lng2 - lng1)

        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c

    def distance_to_zone(self, zone: "Zone"):
        """
        Distance entre la dernière position connue du véhicule et le centre
        de la zone (si coords dispo).
        """
        if not zone:
            return None
        return Vehicule._distance_km(
            self.last_lat,
            self.last_lng,
            zone.center_lat,
            zone.center_lng,
        )

    def is_near_zone(self, zone: "Zone", max_km: float = 10.0) -> bool:
        dist = self.distance_to_zone(zone)
        if dist is None:
            return False
        return dist <= max_km

    def update_position(self, adresse: str, lat: float | None = None, lng: float | None = None):
        """
        Met à jour l'adresse + la dernière position géo du véhicule.
        Si lat/lng pas fournis, on géocode l'adresse (si service dispo).
        """
        adresse = (adresse or "").strip()
        if not adresse:
            return

        self.adresse = adresse

        if lat is None or lng is None:
            try:
                from b2b.services.geocoding import geocode_address
                lat, lng = geocode_address(adresse)
            except Exception:
                lat, lng = None, None

        self.last_lat = lat
        self.last_lng = lng
        self.save(update_fields=["adresse", "last_lat", "last_lng"])



class VehiculeTarifZone(models.Model):
    agence = models.ForeignKey(
        "b2b.AgenceVoyage",
        on_delete=models.CASCADE,
        related_name="tarifs_vehicules_par_zone",
    )

    aeroport = models.CharField(max_length=100)
    zone = models.ForeignKey("Zone", on_delete=models.CASCADE)

    type_code = models.CharField(
        max_length=32,
        choices=Vehicule.TYPE_CHOICES,
        null=True,
        blank=True,
    )

    vehicule = models.ForeignKey(
        "Vehicule",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="tarifs_zones",
    )

    prix = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    devise = models.CharField(max_length=3, default="TND")



class RentoutRequest(models.Model):
    """
    Demande de location (RENTOÛT) d'un véhicule entre agences.
    """

    STATUS_CHOICES = (
        ("PENDING", "En attente"),
        ("ACCEPTED", "Acceptée"),
        ("REJECTED", "Refusée"),
        ("CANCELLED", "Annulée"),
    )

    vehicule = models.ForeignKey(
        Vehicule,
        on_delete=models.CASCADE,
        related_name="rentout_requests",
    )

    agence_demandeuse = models.ForeignKey(
        AgenceVoyage,
        on_delete=models.CASCADE,
        related_name="rentout_demandes",
    )

    agence_fournisseuse = models.ForeignKey(
        AgenceVoyage,
        on_delete=models.CASCADE,
        related_name="rentout_offres",
    )

    date_debut = models.DateField()
    date_fin = models.DateField()
    heure_prise = models.TimeField(null=True, blank=True)

    adresse_prise_en_charge = models.CharField(
        max_length=255,
        help_text="Adresse où le véhicule doit se présenter (client final)",
    )

    commentaire = models.TextField(
        blank=True,
        null=True,
        help_text="Précisions sur la mission (type de service, consignes, etc.)",
    )

    prix_propose = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Montant estimé d'après les tarifs (modulable si besoin)",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
    )

    mission = models.ForeignKey(
        "b2b.Mission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rentout_requests",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Rentout #{self.id} - {self.vehicule} ({self.status})"


# =========================
# Chauffeurs
# =========================

class Chauffeur(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)

    adresse = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Adresse du chauffeur (localisation courante si pas d'affectation)",
    )

    cin = models.CharField(max_length=20, unique=True)

    agence = models.ForeignKey(
        "b2b.AgenceVoyage",
        on_delete=models.CASCADE,
        related_name="chauffeurs",
    )

    STATUT_CHOICES = (
        ("dispo", "Disponible"),
        ("occupe", "Occupé"),
    )
    statut = models.CharField(
        max_length=10,
        choices=STATUT_CHOICES,
        default="dispo",
    )

    class Meta:
        ordering = ["agence__nom", "nom", "prenom"]

    def __str__(self):
        return f"{self.prenom} {self.nom}"

    @property
    def est_disponible(self):
        return self.statut == "dispo"

    # =========================
    # AFFECTATIONS
    # =========================
    def get_last_affectation(self):
        """
        Dernière affectation du chauffeur, ignore soft-delete.
        """
        return (
            self.affectations
            .filter(is_deleted=False)
            .select_related("mission", "vehicule")
            .order_by("-date_heure_fin", "-date_heure_debut")
            .first()
        )

    def get_next_affectation(self):
        """
        Prochaine affectation planifiée à partir de maintenant, ignore soft-delete.
        """
        return (
            self.affectations
            .filter(is_deleted=False, date_heure_debut__gte=timezone.now())
            .select_related("mission", "vehicule")
            .order_by("date_heure_debut")
            .first()
        )

    def get_current_location(self):
        """
        Localisation actuelle estimée du chauffeur :
        - lieu_arrivee de la dernière affectation,
        - sinon lieu_depart,
        - sinon adresse du chauffeur.
        """
        last = self.get_last_affectation()
        if last:
            return last.lieu_arrivee or last.lieu_depart or self.adresse
        return self.adresse

    def recommend_best_vehicule(self):
        """
        Renvoie (vehicule_disponible_le_plus_proche, distance_km)
        basé sur :
          - localisation actuelle du chauffeur (géocodée)
          - coordonnées last_lat / last_lng des véhicules dispo
        """
        loc = self.get_current_location()
        if not loc or not self.agence:
            return None, None

        try:
            from b2b.services.geocoding import geocode_address
            lat_c, lng_c = geocode_address(loc)
        except Exception:
            lat_c, lng_c = None, None

        if lat_c is None or lng_c is None:
            return None, None

        from b2b.models import Vehicule  # import local pour éviter cycles
        vehicles = Vehicule.objects.filter(statut="dispo", agence=self.agence)

        best = None
        best_distance = None

        for v in vehicles:
            if v.last_lat is None or v.last_lng is None:
                continue

            dist = Vehicule._distance_km(lat_c, lng_c, v.last_lat, v.last_lng)
            if dist is None:
                continue

            if best_distance is None or dist < best_distance:
                best = v
                best_distance = dist

        return best, best_distance


# =========================
# Excursions
# =========================

class ExcursionTemplate(models.Model):
    TYPE_DUREE_CHOICES = [
        ("HALF", "1/2 journée"),
        ("FULL", "Journée complète"),
        ("MULTI", "Plusieurs jours"),
    ]

    # 🔹 Agence propriétaire du modèle
    agence = models.ForeignKey(
        AgenceVoyage,
        on_delete=models.CASCADE,
        related_name="excursion_templates",
        null=True,
        blank=True,
    )

    nom = models.CharField(max_length=150)
    description = models.TextField(blank=True)

    type_duree = models.CharField(
        max_length=10,
        choices=TYPE_DUREE_CHOICES,
        default="HALF",
    )
    nb_jours = models.PositiveIntegerField(
        default=1,
        help_text="Utilisé seulement si type = MULTI",
    )

    repas_inclus = models.BooleanField(
        default=False,
        help_text="Cocher si l'excursion inclut un ou plusieurs repas",
    )

    depart_label = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Point de départ (ex : Agence, hôtel, lieu de rendez-vous).",
    )
    depart_lat = models.FloatField(blank=True, null=True)
    depart_lng = models.FloatField(blank=True, null=True)
    depart_place_id = models.CharField(max_length=255, blank=True, null=True)

    retour_lat = models.FloatField(blank=True, null=True)
    retour_lng = models.FloatField(blank=True, null=True)
    retour_label = models.CharField(max_length=255, blank=True, null=True)
    retour_place_id = models.CharField(max_length=255, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nom"]



class ExcursionStep(models.Model):
    template = models.ForeignKey(
        ExcursionTemplate,
        on_delete=models.CASCADE,
        related_name="etapes",
    )

    ordre = models.PositiveIntegerField(default=1)
    nom = models.CharField(max_length=150)

    adresse = models.CharField(max_length=255, blank=True, null=True)
    lat = models.FloatField(blank=True, null=True)
    lng = models.FloatField(blank=True, null=True)

    is_meal_stop_matin = models.BooleanField(default=False)
    is_meal_stop_midi = models.BooleanField(default=False)
    is_meal_stop_soir = models.BooleanField(default=False)

    duree_arret_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Durée approximative de l'arrêt à cette étape.",
    )

    class Meta:
        ordering = ["template", "ordre"]

    def __str__(self):
        return f"{self.template.nom} - Étape {self.ordre}: {self.nom}"


class ExcursionEvent(models.Model):
    STATUT_CHOICES = [
        ("PLANNED", "Prévu"),
        ("CONFIRMED", "Confirmé"),
        ("IN_PROGRESS", "En cours"),
        ("DONE", "Terminé"),
        ("CANCELLED", "Annulé"),
    ]

    VEHICLE_SOURCE_CHOICES = [
        ("INTERNAL", "Ma flotte"),
        ("RENTOUT", "Rentout"),
    ]

    template = models.ForeignKey(
        ExcursionTemplate,
        on_delete=models.CASCADE,
        related_name="events",
    )

    agence = models.ForeignKey(
        AgenceVoyage,
        on_delete=models.CASCADE,
        related_name="excursions",
        null=True,
        blank=True,
    )

    date_debut = models.DateField()
    date_fin = models.DateField(blank=True, null=True)

    heure_depart = models.TimeField()
    heure_retour_estimee = models.TimeField(blank=True, null=True)

    repas_matin = models.BooleanField(default=False)
    repas_midi = models.BooleanField(default=False)
    repas_soir = models.BooleanField(default=False)

    vehicle_source = models.CharField(
        max_length=20,
        choices=VEHICLE_SOURCE_CHOICES,
        default="INTERNAL",
    )

    vehicule_interne = models.ForeignKey(
        Vehicule,
        on_delete=models.PROTECT,
        related_name="excursions_internes",
        blank=True,
        null=True,
    )

    vehicule_rentout = models.ForeignKey(
        Vehicule,
        on_delete=models.PROTECT,
        related_name="excursions_rentout",
        blank=True,
        null=True,
    )

    chauffeur = models.ForeignKey(
        Chauffeur,
        on_delete=models.PROTECT,
        related_name="excursions",
        blank=True,
        null=True,
    )

    nb_participants = models.PositiveIntegerField(default=0)

    statut = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default="PLANNED",
    )

    notes = models.TextField(blank=True)

    mission = models.ForeignKey(
        "b2b.Mission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="excursion_events",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        errors = {}

        if self.vehicle_source == "INTERNAL":
            if not self.vehicule_interne:
                errors["vehicule_interne"] = "Merci de sélectionner un véhicule de votre flotte."
            self.vehicule_rentout = None

        elif self.vehicle_source == "RENTOUT":
            if not self.vehicule_rentout:
                errors["vehicule_rentout"] = "Merci de sélectionner un véhicule Rentout."
            self.vehicule_interne = None

        if self.template_id:
            type_duree = self.template.type_duree

            if type_duree in ("HALF", "FULL"):
                if self.date_fin and self.date_fin != self.date_debut:
                    errors["date_fin"] = (
                        "Pour une excursion 1/2 journée ou journée, "
                        "la date de fin doit être égale à la date de début."
                    )
                self.date_fin = self.date_debut

            elif type_duree == "MULTI":
                if self.date_fin and self.date_fin < self.date_debut:
                    errors["date_fin"] = "La date de fin doit être postérieure ou égale à la date de début."
                if not self.date_fin:
                    self.date_fin = self.date_debut

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()

        if not self.agence and self.template and hasattr(self.template, "agence") and self.template.agence:
            self.agence = self.template.agence

        if (
            self._state.adding
            and self.template_id
            and self.template.repas_inclus
            and not any([self.repas_matin, self.repas_midi, self.repas_soir])
        ):
            self.repas_midi = True

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.template.nom} - {self.date_debut} ({self.agence or ''})"


# =========================
# Missions et Ordres
# =========================
from django.db import models
from django.conf import settings

class Mission(models.Model):
    TYPE_CHOICES = (("T", "Transfert"), ("E", "Excursion"), ("N", "Navette"))

    agence = models.ForeignKey(
        "b2b.AgenceVoyage",
        on_delete=models.CASCADE,
        related_name="missions",
        null=True,
        blank=True,
    )
    type = models.CharField(max_length=1, choices=TYPE_CHOICES, default="T")

    reference = models.CharField(max_length=50, unique=True, blank=True, null=True)

    date = models.DateField()
    horaires = models.TimeField(blank=True, null=True)

    provenance = models.CharField(max_length=100, blank=True, null=True)
    destination = models.CharField(max_length=100, blank=True, null=True)
    numero_vol = models.CharField(max_length=100, blank=True, null=True)

    client = models.CharField(max_length=255, blank=True, null=True)
    pax = models.PositiveIntegerField(default=0)

    ville = models.CharField(max_length=255, null=True, blank=True)
    code_postal = models.CharField(max_length=20, null=True, blank=True)
    observation = models.TextField(blank=True, null=True)
    aeroport = models.CharField(max_length=100, blank=True, null=True)

    chauffeur = models.ForeignKey(
        "b2b.Chauffeur",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="missions",
    )
    vehicule = models.ForeignKey(
        "b2b.Vehicule",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="missions",
    )

    is_converted_from_fiche = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
    
    def save(self, *args, **kwargs):
        if not self.reference:
            day = self.date or timezone.localdate()
            self.reference = generate_daily_reference("M", day=day)
        super().save(*args, **kwargs)


    def __str__(self):
        return f"Mission #{self.id} {self.get_type_display()}"

    @property
    def total_pax(self):
        return sum((f.pax or 0) for f in self.fiches.filter(is_deleted=False))

    @property
    def hotels_list(self):
        return [
            (f.hotel.nom if f.hotel else None)
            for f in self.fiches.filter(is_deleted=False).select_related("hotel")
            if f.hotel_id
        ]

    @property
    def main_kind(self):
        f = self.fiches.filter(is_deleted=False).first()
        return f.type if f else None





class MissionRessource(models.Model):
    mission = models.ForeignKey(
        "b2b.Mission",
        on_delete=models.CASCADE,
        related_name="affectations",
    )
    vehicule = models.ForeignKey(
        "b2b.Vehicule",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="affectations",
    )
    chauffeur = models.ForeignKey(
        "b2b.Chauffeur",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="affectations",
    )

    date_heure_debut = models.DateTimeField()
    date_heure_fin = models.DateTimeField()

    lieu_depart = models.CharField(max_length=255, blank=True, null=True)
    lieu_arrivee = models.CharField(max_length=255, blank=True, null=True)

    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["date_heure_debut"]
        constraints = [
            models.UniqueConstraint(
                fields=["mission", "vehicule"],
                name="uniq_mission_vehicule",
                condition=Q(vehicule__isnull=False, is_deleted=False),
            ),
            models.UniqueConstraint(
                fields=["mission", "chauffeur"],
                name="uniq_mission_chauffeur",
                condition=Q(chauffeur__isnull=False, is_deleted=False),
            ),
        ]
        indexes = [
            models.Index(fields=["is_deleted", "date_heure_debut"]),
            models.Index(fields=["is_deleted", "date_heure_fin"]),
            models.Index(fields=["vehicule", "is_deleted", "date_heure_debut"]),
            models.Index(fields=["chauffeur", "is_deleted", "date_heure_debut"]),
        ]

    def __str__(self):
        label_res = self.vehicule or self.chauffeur or "Ressource"
        return f"{label_res} pour {self.mission} du {self.date_heure_debut} au {self.date_heure_fin}"

    def clean(self):
        errors = {}

        if not self.vehicule_id and not self.chauffeur_id:
            errors["vehicule"] = "Sélectionne au moins un véhicule ou un chauffeur."
            errors["chauffeur"] = "Sélectionne au moins un véhicule ou un chauffeur."

        if self.date_heure_fin and self.date_heure_debut and self.date_heure_fin <= self.date_heure_debut:
            errors["date_heure_fin"] = "La fin doit être après le début."

        if errors:
            raise ValidationError(errors)

        overlap = Q(date_heure_debut__lt=self.date_heure_fin) & Q(date_heure_fin__gt=self.date_heure_debut)

        if self.vehicule_id:
            qs = MissionRessource.objects.filter(vehicule_id=self.vehicule_id, is_deleted=False).filter(overlap)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exclude(mission_id=self.mission_id).exists():
                errors["vehicule"] = "Véhicule déjà occupé sur ce créneau."

        if self.chauffeur_id:
            qs = MissionRessource.objects.filter(chauffeur_id=self.chauffeur_id, is_deleted=False).filter(overlap)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exclude(mission_id=self.mission_id).exists():
                errors["chauffeur"] = "Chauffeur déjà occupé sur ce créneau."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        res = super().save(*args, **kwargs)
        return res

    def soft_delete(self):
        if self.is_deleted:
            return
        self.is_deleted = True
        self.deleted_at = timezone.now()
        super().save(update_fields=["is_deleted", "deleted_at"])



class OrdreMission(models.Model):
    mission = models.ForeignKey(
        "b2b.Mission",
        on_delete=models.CASCADE,
        related_name="ordres",   # une mission peut avoir plusieurs ordres (versions)
    )

    base_reference = models.CharField(max_length=32, db_index=True)
    version = models.PositiveIntegerField(default=1)
    reference = models.CharField(max_length=64, unique=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True
    )

    fichier_pdf = models.FileField(upload_to="ordres_pdf/", blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["mission", "version"], name="uniq_om_mission_version"),
            models.UniqueConstraint(fields=["base_reference", "version"], name="uniq_om_base_version"),
        ]

    def __str__(self):
        return f"OM {self.reference} (v{self.version}) - mission {self.mission_id}"

    def compute_reference(self) -> str:
        # ✅ tu peux choisir ton format
        # V1 = base_reference, V2 = base_reference-V2, etc.
        if (self.version or 1) <= 1:
            return self.base_reference
        return f"{self.base_reference}-V{self.version}"

    def save(self, *args, **kwargs):
        if not self.base_reference:
            day = getattr(self.mission, "date", None) or timezone.localdate()
            self.base_reference = generate_daily_reference("OM", day=day)

        if not self.reference:
            self.reference = self.compute_reference()

        super().save(*args, **kwargs)

# =========================
# Mapping Langues
# =========================

class LanguageMapping(models.Model):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=50)
    mapping = models.JSONField(default=dict)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.name


# =========================
# Signals
# =========================

@receiver(post_save, sender=MissionRessource)
def update_vehicle_position_on_mission_save(sender, instance: MissionRessource, **kwargs):
    """
    À chaque fois qu'une affectation est sauvegardée, on met à jour la position
    du véhicule avec le lieu d'arrivée (ou à défaut le lieu de départ).
    """
    vehicule = instance.vehicule
    if not vehicule:
        return

    adresse = instance.lieu_arrivee or instance.lieu_depart
    if not adresse:
        return

    vehicule.update_position(adresse)


@receiver(post_save, sender=Hotel)
def enrich_hotel_address_on_create(sender, instance: Hotel, created: bool, **kwargs):
    """
    Dès qu'un Hotel est créé (ou sauvé) sans adresse, on tente un enrichissement.
    Fail-safe: aucune exception ne remonte.
    """
    try:
        if instance.adresse:
            return
        city = None
        postal = None
        if instance.zone_id:
            city = instance.zone.nom
            postal = instance.zone.code_postal or None
        addr = lookup_hotel_address(instance.nom, city, postal, country=None)
        if addr:
            Hotel.objects.filter(pk=instance.pk).update(adresse=addr)
    except Exception:
        pass



from django.db import models
from django.conf import settings

class HistoriqueTransformation(models.Model):
    dossier = models.ForeignKey("Dossier", on_delete=models.CASCADE, related_name="historiques", null=True, blank=True)
    fiche_de_mouvement = models.ForeignKey("b2b.FicheMouvement", on_delete=models.SET_NULL, null=True, blank=True)
    mission = models.ForeignKey(
    "Mission",
    null=True,
    blank=True,
    on_delete=models.SET_NULL,
    db_constraint=False,   # ⚠️ IMPORTANT
)
    date_transformation = models.DateTimeField(auto_now_add=True)
    transformed_by = models.ForeignKey(
    settings.AUTH_USER_MODEL,
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    db_constraint=False,  # ✅ OBLIGATOIRE
)

    type_transformation = models.CharField(
        max_length=255,
        help_text="Ex: DOSSIER->FICHE, FICHE->MISSION",
    )

    class Meta:
        ordering = ["-date_transformation"]

    def __str__(self):
        return f"{self.type_transformation} - {self.dossier.reference}"
