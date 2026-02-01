# -*- coding: utf-8 -*-
from __future__ import annotations

from django.db import migrations, models
import django.db.models.deletion


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


def _fk_exists(schema_editor, table: str, fk_name: str) -> bool:
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s
              AND CONSTRAINT_NAME = %s
              AND CONSTRAINT_TYPE = 'FOREIGN KEY'
            """,
            [table, fk_name],
        )
        return cursor.fetchone()[0] > 0


def _drop_column_if_exists(schema_editor, table: str, column: str):
    if _column_exists(schema_editor, table, column):
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(f"ALTER TABLE `{table}` DROP COLUMN `{column}`")


def _ensure_dossier_id_exists(schema_editor):
    table = "b2b_historiquetransformation"

    # 1) crÃ©er la colonne si absente
    if not _column_exists(schema_editor, table, "dossier_id"):
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                f"ALTER TABLE `{table}` ADD COLUMN `dossier_id` BIGINT NULL"
            )

    # 2) ajouter une FK si elle nâ€™existe pas (nom standard Django souvent: b2b_historiquetransformation_dossier_id_... mais on met un nom fixe)
    fk_name = "fk_historiquetransformation_dossier_id"
    if not _fk_exists(schema_editor, table, fk_name):
        # index dâ€™abord (MySQL aime bien)
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                f"CREATE INDEX `idx_historiquetransformation_dossier_id` ON `{table}` (`dossier_id`)"
            )
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                f"""
                ALTER TABLE `{table}`
                ADD CONSTRAINT `{fk_name}`
                FOREIGN KEY (`dossier_id`) REFERENCES `b2b_dossier` (`id`)
                ON DELETE SET NULL
                """
            )


def forwards(apps, schema_editor):
    # Si MySQL dit â€œCan't DROP COLUMN â€¦ check it existsâ€ => on drop seulement si prÃ©sent
    _drop_column_if_exists(schema_editor, "b2b_historiquetransformation", "fiche_de_mouvement_id")

    # Ton erreur actuelle: dossier_id absent => on le crÃ©e avant lâ€™AlterField logique
    _ensure_dossier_id_exists(schema_editor)


def backwards(apps, schema_editor):
    # rollback simple : on retire la FK/colonne si tu veux, mais on peut laisser vide
    # (pas obligatoire en dev)
    pass

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


class Migration(migrations.Migration):

    dependencies = [
    ('apps', "0044_alter_fichemouvement_options_and_more"),
]


    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(forwards, backwards),
            ],
            state_operations=[
                # ce que Django â€œcroitâ€ niveau modÃ¨les (state)
                migrations.RemoveField(
                    model_name="historiquetransformation",
                    name="fiche_de_mouvement",
                ),
                migrations.AlterField(
                    model_name="historiquetransformation",
                    name="dossier",
                    field=models.ForeignKey(
                        null=True,
                        blank=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="b2b.dossier",
                    ),
                ),
                migrations.RunPython(
    code=lambda apps, schema_editor: _add_bigint_column_if_missing(
        schema_editor, "b2b_historiquetransformation", "dossier_id"
    ),
    reverse_code=migrations.RunPython.noop,
),

            ],
        ),
    ]

