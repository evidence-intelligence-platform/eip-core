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
from sqlalchemy import inspect, text

from alembic import command

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


def run_migrations():
    """Runs Alembic 'upgrade head' on the database (idempotent)."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ini_path = os.path.join(base_dir, "alembic.ini")

    if not os.path.exists(ini_path):
        print(f"❌ Error: alembic.ini not found at {ini_path}")
        sys.exit(1)

    alembic_cfg = Config(ini_path)

    if _schema_exists_without_stamp():
        print("[MIGRATE] Existing schema without Alembic stamp detected — stamping as 'head'...")
        command.stamp(alembic_cfg, "head")
        print("[SUCCESS] Database stamped; schema already up to date.")
        return

    print("[MIGRATE] Applying Alembic database migrations to latest revision ('head')...")
    command.upgrade(alembic_cfg, "head")
    print("[SUCCESS] Database migration completed successfully!")


if __name__ == "__main__":
    run_migrations()
