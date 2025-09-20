# b2b/models.py

from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from .utils import generate_unique_reference

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
        TourOperateur,
        on_delete=models.CASCADE,
        related_name="agences",
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
    agence = models.ForeignKey(AgenceVoyage, null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class Succursale(models.Model):
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.CASCADE, related_name="succursales")
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
# Dossier
# =========================

class Dossier(models.Model):
    reference = models.CharField("Numéro de dossier", max_length=100, unique=True)
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.SET_NULL, null=True, related_name="dossiers")
    ville = models.CharField(max_length=100, null=True, blank=True)
    aeroport_arrivee = models.CharField(max_length=100, default="Aucun")
    num_vol_arrivee = models.CharField(max_length=50)
    heure_arrivee = models.DateTimeField(null=True, blank=True)
    heure_depart = models.DateTimeField(null=True, blank=True)
    hotel = models.ForeignKey(Hotel, on_delete=models.SET_NULL, null=True, related_name="dossiers")
    nombre_personnes_arrivee = models.PositiveIntegerField()
    nom_reservation = models.CharField(max_length=255)
    touristes = models.ManyToManyField(Touriste, related_name="dossiers")
    aeroport_depart = models.CharField(max_length=100)
    num_vol_retour = models.CharField(max_length=50)
    nombre_personnes_retour = models.PositiveIntegerField()
    tour_operateur = models.CharField(max_length=255, blank=True, null=True)

    # ✅ NOUVEAU : on persiste ce qui vient de l'import
    observation = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Dossier {self.reference} - {self.nom_reservation}"


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
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.CASCADE, related_name="vehicules")

    def __str__(self):
        return f"{self.type} {self.marque} {self.model} - {self.immatriculation}"


class Chauffeur(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    cin = models.CharField(max_length=20, unique=True)
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.CASCADE, related_name="chauffeurs")

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
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.CASCADE, related_name="pre_missions")
    dossier = models.ForeignKey(Dossier, on_delete=models.CASCADE, related_name="pre_missions")
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
    premission = models.ForeignKey(PreMission, on_delete=models.CASCADE, related_name="missions")
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

    def creer_ordre_mission(self, vehicule, chauffeur, date_depart, date_retour, trajet=None):
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
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name="ordres_mission")
    date_depart = models.DateTimeField()
    date_retour = models.DateTimeField()
    vehicule = models.ForeignKey(Vehicule, on_delete=models.CASCADE, null=True, blank=True)
    chauffeur = models.ForeignKey(Chauffeur, on_delete=models.CASCADE)
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
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.CASCADE, related_name="fiches_mouvement")
    name = models.CharField(max_length=255, blank=True, default="")
    type = models.CharField(max_length=1, choices=TYPE_CHOICES)
    date = models.DateField()
    aeroport = models.CharField(max_length=100, blank=True, default="")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        base = f"[{self.get_type_display()}] {self.aeroport or '-'} {self.date}"
        return f"{self.name or base}"


class FicheMouvementItem(models.Model):
    fiche = models.ForeignKey(FicheMouvement, on_delete=models.CASCADE, related_name="items")
    dossier = models.ForeignKey(Dossier, on_delete=models.CASCADE, related_name="fiche_items")

    def __str__(self):
        return f"Item fiche #{self.fiche_id} – dossier {self.dossier.reference}"
    
    

# =========================
# Offres de véhicules (Rentout / Rideshare)
# =========================

class VehicleOffer(models.Model):
    MODE_CHOICES = (
        ("rentout", "Rentout"),     # location du véhicule complet
        ("rideshare", "Rideshare"), # partage par places sur trajet précis
    )

    vehicule = models.ForeignKey(Vehicule, on_delete=models.CASCADE, related_name="offers")
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.CASCADE, related_name="vehicle_offers")
    mode = models.CharField(max_length=20, choices=MODE_CHOICES)
    start = models.DateTimeField()
    end = models.DateTimeField()

    # Rideshare uniquement
    origin = models.CharField(max_length=100, blank=True, default="")
    destination = models.CharField(max_length=100, blank=True, default="")
    seats_total = models.PositiveIntegerField(null=True, blank=True)   # par défaut = vehicule.capacite
    seats_reserved = models.PositiveIntegerField(default=0)            # nb places déjà “prises” (réservées)

    # Rentout & Rideshare
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=5, default="TND")
    notes = models.TextField(blank=True, default="")
    is_public = models.BooleanField(default=True)   # visible sans login
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
        """
        Chevauchement de fenêtres temporelles : [start,end] ∩ [s,e] ≠ ∅
        """
        return (self.start <= e) and (self.end >= s)

