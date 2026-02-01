from django.db import migrations

def _column_exists(schema_editor, table: str, column: str) -> bool:
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s
              AND COLUMN_NAME = %s
            """,
            [table, column],
        )
        return cursor.fetchone()[0] > 0

def forwards(apps, schema_editor):
    table = "b2b_historiquetransformation"

    # 1) mission_id
    if not _column_exists(schema_editor, table, "mission_id"):
        schema_editor.execute(f"ALTER TABLE `{table}` ADD COLUMN `mission_id` bigint NULL")

    # (optionnel mais recommandÃ©) index
    # si tu veux Ã©viter lâ€™erreur si lâ€™index existe dÃ©jÃ , on le fait en try
    try:
        schema_editor.execute(f"CREATE INDEX `b2b_historiquetransformation_mission_id_idx` ON `{table}` (`mission_id`)")
    except Exception:
        pass

class Migration(migrations.Migration):
    dependencies = [
        ('apps', "0045_remove_historiquetransformation_fiche_de_mouvement_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]

