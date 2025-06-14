# Generated by Django 5.2 on 2025-05-15 09:15

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Hotel',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom', models.CharField(max_length=100)),
                ('adresse', models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='Touriste',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom', models.CharField(max_length=100)),
                ('prenom', models.CharField(max_length=100)),
                ('vol_arrivee', models.CharField(max_length=50)),
                ('hotel', models.CharField(max_length=100)),
            ],
        ),
        migrations.CreateModel(
            name='AgenceVoyage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom', models.CharField(max_length=50)),
                ('adresse', models.TextField()),
                ('email', models.EmailField(max_length=254)),
                ('telephone', models.CharField(max_length=15)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='agence', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Bus',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('immatriculation', models.CharField(max_length=15, unique=True)),
                ('marque', models.CharField(max_length=100)),
                ('capacite', models.PositiveIntegerField()),
                ('agence', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='buses', to='b2b.agencevoyage')),
            ],
        ),
        migrations.CreateModel(
            name='Chauffeur',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom', models.CharField(max_length=100)),
                ('prenom', models.CharField(max_length=100)),
                ('cin', models.CharField(max_length=20, unique=True)),
                ('agence', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='chauffeurs', to='b2b.agencevoyage')),
            ],
        ),
        migrations.CreateModel(
            name='Dossier',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference', models.CharField(max_length=100, unique=True, verbose_name='Numéro de dossier')),
                ('pays', models.CharField(max_length=100)),
                ('aeroport_arrivee', models.CharField(default='Aucun', max_length=100)),
                ('num_vol_arrivee', models.CharField(max_length=50)),
                ('heure_arrivee', models.DateTimeField()),
                ('nombre_personnes_arrivee', models.PositiveIntegerField()),
                ('nom_reservation', models.CharField(max_length=255)),
                ('aeroport_depart', models.CharField(max_length=100)),
                ('heure_depart', models.DateTimeField()),
                ('num_vol_retour', models.CharField(max_length=50)),
                ('nombre_personnes_retour', models.PositiveIntegerField()),
                ('agence', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='dossiers', to='b2b.agencevoyage')),
                ('hotel', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='dossiers', to='b2b.hotel')),
                ('touristes', models.ManyToManyField(related_name='dossiers', to='b2b.touriste')),
            ],
        ),
        migrations.CreateModel(
            name='PreMission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference', models.CharField(max_length=100, unique=True)),
                ('date_creation', models.DateTimeField(auto_now_add=True)),
                ('trajet_prevu', models.CharField(max_length=255)),
                ('remarques', models.TextField(blank=True, null=True)),
                ('agence', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pre_missions', to='b2b.agencevoyage')),
                ('dossier', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pre_missions', to='b2b.dossier')),
            ],
        ),
        migrations.CreateModel(
            name='OrdreMission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reference', models.CharField(max_length=100, unique=True)),
                ('date_depart', models.DateTimeField()),
                ('date_retour', models.DateTimeField()),
                ('trajet', models.CharField(max_length=255)),
                ('bus', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='b2b.bus')),
                ('chauffeur', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='b2b.chauffeur')),
                ('mission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ordres_mission', to='b2b.premission')),
            ],
        ),
    ]
