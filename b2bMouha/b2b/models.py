from django.db import models
from django.contrib.auth.models import User
from .utils import generate_unique_reference
from django.db.models.signals import post_save
from django.dispatch import receiver

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
        blank=True
    )
    nom = models.CharField(max_length=50)
    adresse = models.TextField()
    email = models.EmailField()
    telephone = models.CharField(max_length=15)

    def __str__(self):
        return self.nom


class Profile(models.Model):
    ROLE_CHOICES = (
        ('superadmin', 'Super Admin'),
        ('adminagence', 'Admin Agence'),
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
    adresse = models.TextField(blank=True)

    def __str__(self):
        return self.nom

class Touriste(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    vol_arrivee = models.CharField(max_length=50)
    hotel = models.CharField(max_length=100)

    def __str__(self):
        return f"{self.prenom} {self.nom}"

class Dossier(models.Model):
    reference = models.CharField("Numéro de dossier", max_length=100, unique=True)
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.SET_NULL, null=True, related_name="dossiers")
    ville = models.CharField(max_length=100, null=True, blank=True)  # <-- Nouveau champ ville ajouté
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

    def __str__(self):
        return f"Dossier {self.reference} - {self.nom_reservation}"



class Vehicule(models.Model):
    TYPE_CHOICES = [
        ('bus', 'Bus'),
        ('minibus', 'Minibus'),
        ('MICROBUS', 'Microbus'),
        ('4x4', '4X4'),
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

class PreMission(models.Model):
    reference = models.CharField(max_length=100, unique=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    agence = models.ForeignKey(AgenceVoyage, on_delete=models.CASCADE, related_name="pre_missions")
    dossier = models.ForeignKey(Dossier, on_delete=models.CASCADE, related_name="pre_missions")
    trajet_prevu = models.CharField(max_length=255)
    remarques = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"PreMission {self.reference}"

    def creer_mission(self, date_debut, date_fin, details=None):
        from .models import Mission  # import local pour éviter boucle circulaire
        mission = Mission.objects.create(
            reference=generate_unique_reference(prefix="MIS-"),
            premission=self,
            date_debut=date_debut,
            date_fin=date_fin,
            details=details or '',
        )
        return mission


class Mission(models.Model):
    reference = models.CharField(max_length=100, unique=True)
    premission = models.ForeignKey(PreMission, on_delete=models.CASCADE, related_name="missions")
    date_debut = models.DateTimeField()
    date_fin = models.DateTimeField()
    details = models.TextField(blank=True)

    def __str__(self):
        return f"Mission {self.reference}"

    def creer_ordre_mission(self, vehicule, chauffeur, date_depart, date_retour, trajet=None):
        from .models import OrdreMission
        reference = generate_unique_reference(prefix="ORD-")
        trajet_final = trajet if trajet else self.premission.trajet_prevu

        ordre = OrdreMission.objects.create(
            reference=reference,
            mission=self,
            date_depart=date_depart,
            date_retour=date_retour,
            vehicule=vehicule,
            chauffeur=chauffeur,
            trajet=trajet_final
        )
        return ordre


class OrdreMission(models.Model):
    reference = models.CharField(max_length=100, unique=True)
    mission = models.ForeignKey(Mission, on_delete=models.CASCADE, related_name="ordres_mission")
    date_depart = models.DateTimeField()
    date_retour = models.DateTimeField()
    vehicule = models.ForeignKey(Vehicule, on_delete=models.CASCADE, null=True, blank=True)
    chauffeur = models.ForeignKey(Chauffeur, on_delete=models.CASCADE)
    trajet = models.CharField(max_length=255)

    def __str__(self):
        return f"Ordre de mission {self.reference} - {self.trajet}"
    
    