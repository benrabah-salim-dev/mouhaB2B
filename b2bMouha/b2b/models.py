# b2b/models.py
from django.db import models, transaction
from django.contrib.auth.models import User
from django.utils import timezone
from django.core.exceptions import ValidationError
from .utils import generate_unique_reference
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.conf import settings
from django.db.models import Q
import uuid

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
        null=True,
        blank=True,
    )
    nom = models.CharField(max_length=50)
    adresse = models.TextField()
    email = models.EmailField()
    telephone = models.CharField(max_length=15)

    def __str__(self):
        return self.nom


class Profile(models.Model):
    ROLE_CHOICES = (
        ("superadmin", "Super Admin"),
        ("adminagence", "Admin Agence"),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    agence = models.ForeignKey(
        AgenceVoyage, null=True, blank=True, on_delete=models.SET_NULL
    )

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class Succursale(models.Model):
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="succursales"
    )
    nom = models.CharField(max_length=100)
    adresse = models.TextField(blank=True)
    email = models.EmailField(blank=True, null=True)
    telephone = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return f"{self.nom} ({self.agence.nom})"


class Hotel(models.Model):
    nom = models.CharField(max_length=100)
    adresse = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.nom


class Touriste(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    vol_arrivee = models.CharField(max_length=50)
    hotel = models.CharField(max_length=100)

    def __str__(self):
        return f"{self.prenom} {self.nom}"


# =========================
# Zone (référentiel)
# =========================

class Zone(models.Model):
    nom = models.CharField(max_length=120, unique=True)

    def __str__(self):
        return self.nom


# =========================
# Dossier
# =========================

class Dossier(models.Model):
    reference = models.CharField("Numéro de dossier", max_length=100, unique=True)
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.SET_NULL, null=True, related_name="dossiers"
    )
    ville = models.CharField(max_length=100, null=True, blank=True)
    aeroport_arrivee = models.CharField(max_length=100, default="Aucun")
    num_vol_arrivee = models.CharField(max_length=50)
    heure_arrivee = models.DateTimeField(null=True, blank=True)
    heure_depart = models.DateTimeField(null=True, blank=True)
    hotel = models.ForeignKey(
        Hotel, on_delete=models.SET_NULL, null=True, related_name="dossiers"
    )
    nombre_personnes_arrivee = models.PositiveIntegerField()
    nom_reservation = models.CharField(max_length=255)
    touristes = models.ManyToManyField('b2b.Touriste', related_name="dossiers")
    aeroport_depart = models.CharField(max_length=100)
    num_vol_retour = models.CharField(max_length=50)
    nombre_personnes_retour = models.PositiveIntegerField()
    tour_operateur = models.CharField(max_length=255, blank=True, null=True)
    observation = models.TextField(null=True, blank=True)  # persistance import

    def __str__(self):
        return f"Dossier {self.reference} - {self.nom_reservation}"


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


class ImportBatchItem(models.Model):
    batch = models.ForeignKey(
        ImportBatch, on_delete=models.CASCADE, related_name="items"
    )
    dossier = models.ForeignKey(
        "b2b.Dossier", on_delete=models.CASCADE, related_name="import_items"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("batch", "dossier"),
                name="uniq_import_batch_dossier",
            )
        ]


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
    immatriculation = models.CharField(max_length=15, unique=True)  # noqa: F821 (max_length)
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
# PreMission / Mission / Ordre
# =========================

def _base_ref_for_date(date_debut):
    try:
        return f"M_{date_debut.date().isoformat()}"
    except Exception:
        return f"M_{timezone.now().date().isoformat()}"


class PreMission(models.Model):
    reference = models.CharField(max_length=100, unique=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="pre_missions"
    )
    dossier = models.ForeignKey(
        Dossier, on_delete=models.CASCADE, related_name="pre_missions"
    )
    trajet_prevu = models.CharField(max_length=255)
    remarques = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"PreMission {self.reference}"

    def creer_mission(self, date_debut, date_fin, details=None, reference=None):
        mission = Mission(
            premission=self,
            date_debut=date_debut,
            date_fin=date_fin,
            details=details or "",
        )
        if reference:
            mission.reference = Mission.next_unique_ref(reference)
        mission.save()
        return mission


class Mission(models.Model):
    reference = models.CharField(max_length=100, unique=True, blank=True)
    premission = models.ForeignKey(
        PreMission, on_delete=models.CASCADE, related_name="missions"
    )
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField()
    details = models.TextField(blank=True)
    ordre_mission_genere = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["premission", "date_debut", "date_fin"],
                name="uniq_mission_premission_date_range",
            ),
        ]

    def __str__(self):
        return f"Mission {self.reference}"

    @classmethod
    def next_unique_ref(cls, base):
        base = base or f"M_{timezone.now().date().isoformat()}"
        candidate = base
        i = 2
        while cls.objects.filter(reference=candidate).exists():
            candidate = f"{base}-{i}"
            i += 1
        return candidate

    def save(self, *args, **kwargs):
        if not self.reference:
            base = _base_ref_for_date(self.date_debut)
            self.reference = Mission.next_unique_ref(base)
        super().save(*args, **kwargs)

    def creer_ordre_mission(
        self, vehicule, chauffeur, date_depart, date_retour, trajet=None
    ):
        trajet_final = trajet if trajet else self.premission.trajet_prevu
        reference = generate_unique_reference("OM", OrdreMission)
        ordre = OrdreMission.objects.create(
            reference=reference,
            mission=self,
            date_depart=date_depart,
            date_retour=date_retour,
            vehicule=vehicule,
            chauffeur=chauffeur,
            trajet=trajet_final,
        )
        return ordre


class OrdreMission(models.Model):
    reference = models.CharField(max_length=50, unique=True, db_index=True)
    mission = models.ForeignKey(
        Mission, on_delete=models.CASCADE, related_name="ordres_mission"
    )
    fiche = models.ForeignKey(
        "b2b.FicheMouvement",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ordres_mission",
    )
    date_depart = models.DateTimeField()
    date_retour = models.DateTimeField()
    vehicule = models.ForeignKey(
        Vehicule, on_delete=models.CASCADE, null=True, blank=True
    )
    chauffeur = models.ForeignKey('b2b.Chauffeur', on_delete=models.CASCADE)
    trajet = models.CharField(max_length=255)

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = generate_unique_reference("OM", OrdreMission)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Ordre de mission {self.reference} - {self.trajet}"


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
# Fiches Mouvement (UI/Reporting)
# =========================

class FicheMouvement(models.Model):
    TYPE_CHOICES = (("A", "Arrivée"), ("D", "Départ"))
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="fiches_mouvement"
    )
    name = models.CharField(max_length=255, blank=True, default="")
    type = models.CharField(max_length=1, choices=TYPE_CHOICES)
    date = models.DateField()
    aeroport = models.CharField(max_length=100, blank=True, default="")
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    hotel_schedule = models.JSONField(
        default=list, blank=True, null=True
    )  # [{hotel:"...", time:"HH:MM"}]

    def __str__(self):
        base = f"[{self.get_type_display()}] {self.aeroport or '-'} {self.date}"
        return f"{self.name or base}"


class FicheMouvementItem(models.Model):
    fiche = models.ForeignKey(
        FicheMouvement, on_delete=models.CASCADE, related_name="items"
    )
    # ⬇⬇⬇ Tolérant: si un Dossier est supprimé, l'item reste et n'explose pas
    dossier = models.ForeignKey(
        Dossier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fiche_items",
    )

    class Meta:
        indexes = [models.Index(fields=["dossier"])]
        constraints = [
            # Unicité (fiche, dossier) seulement quand dossier != NULL
            models.UniqueConstraint(
                fields=["fiche", "dossier"],
                name="uniq_item_fiche_dossier",
                condition=Q(dossier__isnull=False),
            ),
        ]

    def __str__(self):
        ref = getattr(getattr(self, "dossier", None), "reference", "—")
        return f"Item fiche #{self.fiche_id} – dossier {ref}"


@receiver(post_delete, sender=FicheMouvementItem)
def _delete_fiche_if_empty(sender, instance, using, **kwargs):
    """
    Si un item est supprimé et que la fiche n’a plus ni items ni OM liés,
    on supprime la fiche devenue inutile.

    IMPORTANT: ne pas toucher à instance.fiche (risque DoesNotExist en cascade).
    """
    fiche_id = getattr(instance, "fiche_id", None)
    if not fiche_id:
        return

    # Import tardif pour éviter les cycles
    from b2b.models import FicheMouvement, FicheMouvementItem

    # si la fiche est déjà supprimée dans la cascade
    if not FicheMouvement.objects.using(using).filter(pk=fiche_id).exists():
        return

    has_items = FicheMouvementItem.objects.using(using).filter(fiche_id=fiche_id).exists()
    has_oms = models.Exists(
        OrdreMission.objects.using(using).filter(fiche_id=fiche_id)
    )

    if not has_items:
        # On doit re-vérifier les OM avec une requête réelle (pas models.Exists seul)
        if not OrdreMission.objects.using(using).filter(fiche_id=fiche_id).exists():
            def _delete_parent():
                FicheMouvement.objects.using(using).filter(pk=fiche_id).delete()
            transaction.on_commit(_delete_parent)


# =========================
# Produits (Excursions / Navettes)
# =========================

class Produit(models.Model):
    EXCURSION = "EXCURSION"
    NAVETTE = "NAVETTE"
    KIND_CHOICES = [(EXCURSION, "Excursion"), (NAVETTE, "Navette")]

    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="produits"
    )

    titre = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    heure_debut = models.TimeField()
    heure_fin = models.TimeField()
    capacite = models.PositiveIntegerField(default=0)  # 0 = illimité/non géré

    zone_depart = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="produits_depart",
    )
    avec_repas = models.BooleanField(default=False)
    DEMI_JOURNEE = "HALF"
    JOURNEE = "FULL"
    duree = models.CharField(
        max_length=8,
        choices=[(DEMI_JOURNEE, "Demi-journée"), (JOURNEE, "Journée entière")],
        blank=True,
        default="",
    )
    theme = models.CharField(max_length=160, blank=True, default="")

    zone_origine = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="produits_origine",
    )
    zone_destination = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="produits_destination",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        if self.kind == self.EXCURSION and not self.zone_depart:
            raise ValidationError("zone_depart est requise pour une Excursion.")
        if self.kind == self.NAVETTE and not (self.zone_origine and self.zone_destination):
            raise ValidationError("zone_origine et zone_destination sont requises pour une Navette.")

    def __str__(self):
        return f"[{self.kind}] {self.titre}"


class ProduitEtape(models.Model):
    produit = models.ForeignKey(
        Produit, on_delete=models.CASCADE, related_name="etapes"
    )
    ordre = models.PositiveIntegerField()
    titre = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["ordre"]

    def __str__(self):
        return f"{self.produit_id} - {self.ordre} - {self.titre}"


class ProduitTarif(models.Model):
    """Tarifs par zone ET par agence (chaque agence fixe ses tarifs)."""
    produit = models.ForeignKey(
        Produit, on_delete=models.CASCADE, related_name="tarifs"
    )
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="produit_tarifs"
    )
    zone = models.ForeignKey(
        Zone, on_delete=models.CASCADE, related_name="produit_tarifs"
    )
    prix_adulte = models.DecimalField(max_digits=10, decimal_places=2)
    prix_enfant = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("produit", "agence", "zone"),
                name="uniq_produit_tarif_agence_zone",
            )
        ]

    def __str__(self):
        return f"{self.produit.titre} [{self.agence.nom}] @ {self.zone.nom}"


class ReservationProduit(models.Model):
    """Réservation réelle (production)."""
    dossier = models.ForeignKey(
        Dossier, on_delete=models.CASCADE, related_name="reservations_produits"
    )
    produit = models.ForeignKey(
        Produit, on_delete=models.CASCADE, related_name="reservations"
    )
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="reservations_produits"
    )

    date_service = models.DateField()
    heure_debut = models.TimeField(null=True, blank=True)
    heure_fin = models.TimeField(null=True, blank=True)

    zone_pickup = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations_pickup",
    )

    nb_adultes = models.PositiveIntegerField(default=0)
    nb_enfants = models.PositiveIntegerField(default=0)

    # snapshot des prix
    prix_adulte_applique = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    prix_enfant_applique = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_ttc = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    mission = models.ForeignKey(
        Mission,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations_sources",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def compute_total(self):
        a = self.prix_adulte_applique or 0
        e = self.prix_enfant_applique or 0
        return (a * (self.nb_adultes or 0)) + (e * (self.nb_enfants or 0))

    def save(self, *args, **kwargs):
        if not self.total_ttc:
            self.total_ttc = self.compute_total()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Resa {self.produit.titre} / {self.dossier.reference} ({self.date_service})"


# =========================
# Offres inter-agences (Rentout / Rideshare)
# =========================

class VehicleOffer(models.Model):
    MODE_CHOICES = (
        ("rentout", "Rentout"),
        ("rideshare", "Rideshare"),
    )

    vehicule = models.ForeignKey(
        Vehicule, on_delete=models.CASCADE, related_name="offers"
    )
    agence = models.ForeignKey(
        AgenceVoyage, on_delete=models.CASCADE, related_name="vehicle_offers"
    )
    mode = models.CharField(max_length=20, choices=MODE_CHOICES)
    start = models.DateTimeField()
    end = models.DateTimeField()

    origin = models.CharField(max_length=100, blank=True, default="")
    destination = models.CharField(max_length=100, blank=True, default="")

    origin_zone = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="offers_origin",
    )
    destination_zone = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="offers_destination",
    )

    seats_total = models.PositiveIntegerField(null=True, blank=True)
    seats_reserved = models.PositiveIntegerField(default=0)

    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_per_adult = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_per_child = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=5, default="TND")

    notes = models.TextField(blank=True, default="")
    is_public = models.BooleanField(default=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["mode", "start", "end", "active", "is_public"]),
        ]

    def __str__(self):
        tag = "RS" if self.mode == "rideshare" else "RO"
        return f"{tag} {self.vehicule.immatriculation} {self.start:%Y-%m-%d %H:%M} → {self.end:%H:%M}"

    @property
    def seats_available(self) -> int:
        if self.mode != "rideshare":
            return 0
        base = self.seats_total if self.seats_total is not None else self.vehicule.capacite
        used = max(0, self.seats_reserved)
        return max(0, base - used)

    def overlaps(self, s: "datetime", e: "datetime") -> bool:
        return (self.start <= e) and (self.end >= s)
