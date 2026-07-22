"""
EIF: Alembic Environment Configuration
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 05_DATABASE_SCHEMA.md
"""

import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

# Ensure project root is in sys.path
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), "..")))

load_dotenv()

# Import SQLModel and all ORM models so SQLModel.metadata registers all tables
from sqlmodel import SQLModel  # noqa: E402
from src.db import models  # noqa: E402, F401

config = context.config

if config.config_file_name:
    fileConfig(config.config_file_name)

# Set target metadata for autogenerate
target_metadata = SQLModel.metadata

# Get database URL from environment or default SQLite
db_url = os.getenv("DATABASE_URL", "sqlite:///database.db")
config.set_main_option("sqlalchemy.url", db_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
