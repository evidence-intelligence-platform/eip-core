"""
EIF: Database Migration Helper Script
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md
---
Programmatically executes Alembic migrations to upgrade the target database
to the latest revision ('head').

Usage:
  python -m src.db.migrate
"""

import os
import sys

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, inspect, text
from sqlmodel import SQLModel

from alembic import command

from src.db import models  # noqa: F401 — registers every table on SQLModel.metadata
from src.db.database import engine


def _schema_exists_without_stamp() -> bool:
    """
    True when the app schema was created outside Alembic (SQLModel's
    create_all on startup) so tables exist but no revision is stamped.
    Running 'upgrade head' in that state crashes with 'table already
    exists'; the database must be stamped as current first.

    Note: a previously crashed upgrade can leave an EMPTY alembic_version
    table behind, so we must check the stamped row, not just the table.
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    app_tables = tables - {"alembic_version"}
    if not app_tables:
        return False
    if "alembic_version" not in tables:
        return True
    with engine.connect() as conn:
        stamped = conn.execute(text("SELECT version_num FROM alembic_version")).first()
    return stamped is None


def _repair_create_all_drift() -> None:
    """
    Adds the columns the current models define but the live schema lacks.

    A schema provisioned by SQLModel's create_all at an OLDER version of the
    models has every table but is missing the columns that later migrations
    add to existing tables — create_all only creates missing TABLES, never
    missing columns, so startup does not repair it either. Stamping such a
    database as 'head' without this pass silently skips those column-adding
    migrations FOREVER (the stamp says they already ran), and every query
    touching the new columns 500s ("no such column: evidence.review_status").

    Only plain columns are added: they are what the app's queries need.
    Non-nullable columns get the model's scalar default as a server default —
    the same backfill the real migrations use ("approved", "OTHER") — and
    fall back to nullable when no scalar default exists.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        ops = Operations(MigrationContext.configure(conn))
        for table in SQLModel.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # create_all at startup handles brand-new tables
            present = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                nullable = column.nullable
                server_default = None
                if not nullable:
                    scalar = getattr(column.default, "arg", None)
                    if scalar is not None and not callable(scalar):
                        server_default = str(scalar)
                    else:
                        nullable = True
                print(f"[MIGRATE]   adding missing column {table.name}.{column.name}")
                ops.add_column(
                    table.name,
                    Column(
                        column.name,
                        column.type,
                        nullable=nullable,
                        server_default=server_default,
                    ),
                )


def run_migrations():
    """Runs Alembic 'upgrade head' on the database (idempotent)."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ini_path = os.path.join(base_dir, "alembic.ini")

    if not os.path.exists(ini_path):
        print(f"❌ Error: alembic.ini not found at {ini_path}")
        sys.exit(1)

    alembic_cfg = Config(ini_path)

    if _schema_exists_without_stamp():
        # The schema came from create_all — but not necessarily TODAY's
        # create_all: an older provisioning is missing every column that
        # later migrations add to existing tables, and stamping it 'head'
        # as-is would skip those migrations permanently. Reconcile the
        # columns first, THEN stamp.
        print("[MIGRATE] Existing schema without Alembic stamp detected — reconciling with current models...")
        _repair_create_all_drift()
        command.stamp(alembic_cfg, "head")
        print("[SUCCESS] Database reconciled and stamped as 'head'.")
        return

    print("[MIGRATE] Applying Alembic database migrations to latest revision ('head')...")
    command.upgrade(alembic_cfg, "head")
    print("[SUCCESS] Database migration completed successfully!")


if __name__ == "__main__":
    run_migrations()
