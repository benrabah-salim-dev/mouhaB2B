# b2b/migrations/0025_rentoutrequest_and_more.py
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('apps', "0024_alter_vehiculetarifzone_unique_together_and_more"),
    ]

    operations = [
        # ---- Ajout des champs sur Vehicule ----
        migrations.AddField(
            model_name="vehicule",
            name="annee_mise_en_circulation",
            field=models.PositiveIntegerField(
                null=True,
                blank=True,
                help_text="AnnÃ©e de premiÃ¨re mise en circulation",
            ),
        ),
        migrations.AddField(
            model_name="vehicule",
            name="louer_autres_agences",
            field=models.BooleanField(
                default=False,
                help_text="Si cochÃ©, ce vÃ©hicule peut Ãªtre proposÃ© en RENTOÃ›T aux autres agences",
            ),
        ),

        # ---- CrÃ©ation de RentoutRequest ----
        migrations.CreateModel(
            name="RentoutRequest",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("date_debut", models.DateField()),
                ("date_fin", models.DateField()),
                ("heure_prise", models.TimeField(null=True, blank=True)),
                (
                    "adresse_prise_en_charge",
                    models.CharField(
                        max_length=255,
                        help_text="Adresse oÃ¹ le vÃ©hicule doit se prÃ©senter (client final)",
                    ),
                ),
                (
                    "commentaire",
                    models.TextField(
                        blank=True,
                        null=True,
                        help_text="PrÃ©cisions sur la mission (type de service, consignes, etc.)",
                    ),
                ),
                (
                    "prix_propose",
                    models.DecimalField(
                        max_digits=10,
                        decimal_places=2,
                        null=True,
                        blank=True,
                        help_text="Montant estimÃ© d'aprÃ¨s les tarifs (modulable si besoin)",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        max_length=20,
                        choices=[
                            ("PENDING", "En attente"),
                            ("ACCEPTED", "AcceptÃ©e"),
                            ("REJECTED", "RefusÃ©e"),
                            ("CANCELLED", "AnnulÃ©e"),
                        ],
                        default="PENDING",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "agence_demandeuse",
                    models.ForeignKey(
                        to="b2b.agencevoyage",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rentout_demandes",
                    ),
                ),
                (
                    "agence_fournisseuse",
                    models.ForeignKey(
                        to="b2b.agencevoyage",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rentout_offres",
                    ),
                ),
                (
                    "mission",
                    models.ForeignKey(
                        to="b2b.mission",
                        null=True,
                        blank=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="rentout_requests",
                    ),
                ),
                (
                    "vehicule",
                    models.ForeignKey(
                        to="b2b.vehicule",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rentout_requests",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]

