# Generated by Django 5.2 on 2025-05-23 14:45

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('b2b', '0006_remove_dossier_pays'),
    ]

    operations = [
        migrations.AddField(
            model_name='dossier',
            name='ville',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
