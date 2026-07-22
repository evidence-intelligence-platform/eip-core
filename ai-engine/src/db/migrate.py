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
from alembic import command


def run_migrations():
    """Runs Alembic 'upgrade head' on the database."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ini_path = os.path.join(base_dir, "alembic.ini")

    if not os.path.exists(ini_path):
        print(f"❌ Error: alembic.ini not found at {ini_path}")
        sys.exit(1)

    print("[MIGRATE] Applying Alembic database migrations to latest revision ('head')...")
    alembic_cfg = Config(ini_path)
    command.upgrade(alembic_cfg, "head")
    print("[SUCCESS] Database migration completed successfully!")


if __name__ == "__main__":
    run_migrations()
