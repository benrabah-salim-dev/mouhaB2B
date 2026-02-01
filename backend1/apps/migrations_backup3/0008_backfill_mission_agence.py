from django.db import migrations

def backfill_agence(apps, schema_editor):
    Mission = apps.get_model('apps', 'Mission')
    FicheMouvement = apps.get_model('apps', 'FicheMouvement')

    # Pour chaque mission sans agence, on rÃ©cupÃ¨re l'agence d'une fiche liÃ©e (s'il y en a)
    qs = Mission.objects.filter(agence__isnull=True)
    for m in qs.iterator():
        fm = (
            FicheMouvement.objects
            .filter(mission_id=m.id, agence__isnull=False)
            .order_by('id')
            .first()
        )
        if fm and fm.agence_id:
            m.agence_id = fm.agence_id
            m.save(update_fields=['agence'])

class Migration(migrations.Migration):

    dependencies = [

('apps', '0007_alter_mission_options_remove_mission_chauffeur_and_more'),     ]

    operations = [
        migrations.RunPython(backfill_agence, migrations.RunPython.noop),
    ]

