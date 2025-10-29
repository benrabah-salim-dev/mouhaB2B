# b2b/models.py
from __future__ import annotations

import uuid
from django.db import models, transaction
from django.contrib.auth.models import User
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.conf import settings


# =========================
# Tiers
# =========================

class TourOperateur(models.Model):
    nom = models.CharField(max_length=100)
    adresse = models.TextField(blank=True)
    email = models.EmailField(blank=True, null=True)
    telephone = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return self.nom


class AgenceVoyage(models.Model):
    tour_operateur = models.ForeignKey(
        'b2b.TourOperateur',
        on_delete=models.CASCADE,
        related_name='agences',
        null=True, blank=True,
    )
    nom = models.CharField(max_length=50)
    adresse = models.TextField(blank=True, default="")
    email = models.EmailField()
    telephone = models.CharField(max_length=15)

    # Bitmask d’accès : 1=agence, 2=client, 4=fournisseur, 8=succursale
    ROLE_ESPACE_AGENCE      = 1
    ROLE_ESPACE_CLIENT      = 2
    ROLE_ESPACE_FOURNISSEUR = 4
    ROLE_SUCCURSALE         = 8

    roles_mask = models.PositiveSmallIntegerField(
        default=ROLE_ESPACE_AGENCE,
        help_text="Flags: 1=agence, 2=client, 4=fournisseur, 8=succursale (somme possible)."
    )

    users = models.ManyToManyField(
        User,
        through='Profile',
        through_fields=('agence', 'user'),
        related_name='agences_membre_de',
        blank=True,
    )

    class Meta:
        indexes = [models.Index(fields=["nom"])]
        verbose_name = "Agence de voyage"
        verbose_name_plural = "Agences de voyage"

    def has_role(self, role_flag: int) -> bool:
        return bool(self.roles_mask & role_flag)

    def add_user(self, user: User, role: str = "adminagence"):
        from .models import Profile
        prof, _ = Profile.objects.update_or_create(
            user=user,
            defaults={"agence": self, "role": role},
        )
        return prof

    def __str__(self):
        return self.nom


class Profile(models.Model):
    ROLE_CHOICES = (
        ("superadmin", "Super Admin"),
        ("adminagence", "Admin Agence"),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    agence = models.ForeignKey(
        AgenceVoyage, null=True, blank=True, on_delete=models.SET_NULL, related_name="profiles"
    )

    def clean(self):
        if self.role == "adminagence" and self.agence is None:
            raise ValidationError({"agence": "L’agence est requise pour le rôle Admin Agence."})

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class Succursale(models.Model):
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="succursales"
    )
    nom = models.CharField(max_length=100)
    adresse = models.TextField(blank=True, default="")
    email = models.EmailField(blank=True, null=True)
    telephone = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["agence", "nom"], name="uniq_succursale_nom_par_agence"
            )
        ]
        indexes = [
            models.Index(fields=["agence", "nom"]),
        ]

    def __str__(self):
        return f"{self.nom} ({self.agence.nom})"


class Hotel(models.Model):
    nom = models.CharField(max_length=100)
    adresse = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.nom


# =========================
# Zone (référentiel)
# =========================

class Zone(models.Model):
    nom = models.CharField(max_length=120, unique=True)

    def __str__(self):
        return self.nom


# =========================
# Ressources
# =========================

class Vehicule(models.Model):
    TYPE_CHOICES = [
        ("bus", "Bus"),
        ("minibus", "Minibus"),
        ("MICROBUS", "Microbus"),
        ("4x4", "4X4"),
    ]

    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    marque = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    capacite = models.PositiveIntegerField()
    annee = models.PositiveIntegerField()
    immatriculation = models.CharField(max_length=15, unique=True)
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="vehicules"
    )

    def __str__(self):
        return f"{self.type} {self.marque} {self.model} - {self.immatriculation}"


class Chauffeur(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    cin = models.CharField(max_length=20, unique=True)
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="chauffeurs"
    )

    def __str__(self):
        return f"{self.prenom} {self.nom}"


# =========================
# Mapping Langues
# =========================

class LanguageMapping(models.Model):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=50)
    ville = models.JSONField(default=list)
    pays = models.JSONField(default=list)
    reference = models.JSONField(default=list)
    type_da = models.JSONField(default=list)
    nom_reservation = models.JSONField(default=list)
    horaire = models.JSONField(default=list)

    def __str__(self):
        return self.name


# =========================
# Fiches Mouvement (unique objet opérationnel)
# =========================
# Les champs de l’ancien Dossier sont intégrés ici.

class FicheMouvement(models.Model):
    TYPE_CHOICES = (("A", "Arrivée"), ("D", "Départ"))

    # --- Contexte / méta ---
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="fiches_mouvement"
    )
    name = models.CharField(max_length=255, blank=True, default="")
    type = models.CharField(max_length=1, choices=TYPE_CHOICES)  # remplace l'ancien "sens"
    date = models.DateField()
    aeroport = models.CharField(max_length=100, blank=True, default="")
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    hotel_schedule = models.JSONField(
        default=list, blank=True, null=True
    )  # [{hotel:"...", time:"HH:MM"}]

    # --- Champs métier issus de Dossier ---
    horaires = models.CharField(max_length=20, blank=True, default="")
    provenance = models.CharField(max_length=100, blank=True, default="")
    destination = models.CharField(max_length=100, blank=True, default="")
    numero_vol = models.CharField(max_length=50, blank=True, default="")
    client_to = models.CharField(max_length=255, blank=True, default="")  # Client / TO
    hotel = models.CharField(max_length=255, blank=True, default="")
    ref = models.CharField(max_length=100, blank=True, default="")
    titulaire = models.CharField(max_length=255, blank=True, default="")
    pax = models.PositiveIntegerField(default=0)
    adulte = models.PositiveIntegerField(default=0)
    enfants = models.PositiveIntegerField(default=0)
    bb_gratuit = models.PositiveIntegerField(default=0)
    observation = models.TextField(blank=True, null=True)
    ville = models.CharField(max_length=100, blank=True, null=True)
    code_postal = models.CharField(max_length=20, blank=True, null=True)
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["agence", "date"]),
            models.Index(fields=["type"]),
            models.Index(fields=["ref"]),
        ]

    def __str__(self):
        base = f"[{self.get_type_display()}] {self.aeroport or '-'} {self.date}"
        return f"{self.name or base}"


# =========================
# Import Batches
# =========================

class ImportBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agence = models.ForeignKey(
        "b2b.AgenceVoyage", on_delete=models.CASCADE, related_name="import_batches"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    label = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.label or f"Import {self.created_at:%Y-%m-%d %H:%M}"


class ImportBatchItem(models.Model):
    batch = models.ForeignKey(
        ImportBatch, on_delete=models.CASCADE, related_name="items"
    )
    # ⚠️ On pointe désormais vers la FicheMouvement (ex-‘dossier’ devenu ‘fiche’)
    fiche = models.ForeignKey(
        "b2b.FicheMouvement", on_delete=models.CASCADE, related_name="import_items"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("batch", "fiche"),
                name="uniq_import_batch_fiche",
            )
        ]

    def __str__(self):
        return f"{self.batch_id} -> fiche {self.fiche_id}"


class ImportValidationError(models.Model):
    batch = models.ForeignKey(
        ImportBatch, on_delete=models.CASCADE, related_name="errors"
    )
    excel_row = models.IntegerField()  # Numéro de ligne Excel (1-based)
    field = models.CharField(max_length=100, blank=True, default="")
    message = models.TextField()
    raw_value = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["excel_row"]

    def __str__(self):
        return f"Row {self.excel_row}: {self.field} -> {self.message[:40]}..."
