# b2b/migrations/0046_hotfix_historiquetransformation_columns.py
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

def _add_bigint_column_if_missing(schema_editor, table: str, column: str):
    if _column_exists(schema_editor, table, column):
        return
    schema_editor.execute(f"ALTER TABLE `{table}` ADD COLUMN `{column}` bigint NULL")

def forwards(apps, schema_editor):
    _add_bigint_column_if_missing(schema_editor, "b2b_historiquetransformation", "mission_id")

class Migration(migrations.Migration):
    dependencies = [
        ('apps', "0045_remove_historiquetransformation_fiche_de_mouvement_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]

