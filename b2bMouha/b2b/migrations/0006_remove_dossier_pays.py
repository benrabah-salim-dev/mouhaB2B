# Generated by Django 5.2 on 2025-05-23 11:37

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('b2b', '0005_alter_dossier_heure_arrivee_and_more'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='dossier',
            name='pays',
        ),
    ]
