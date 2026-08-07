"""
EIF: Database Configuration
---
Version: 1.1.0
Owner: EIF Architecture Team
Compliance:
  - 02_FOUNDATION_MANIFEST.md Section 2: "Relational database for structured data (PostgreSQL)"
  - ENGINEERING_STANDARDS.md Section 3: Stateless Services
---
AUDIT FIXES (2026-07-22):
  - [FIXED] Database engine is now configurable via DATABASE_URL environment variable.
    SQLite is accepted for local development ONLY.
    PostgreSQL is required for staging and production.
    Example .env values:
      Local dev:   DATABASE_URL=sqlite:///database.db
      Production:  DATABASE_URL=postgresql://user:pass@host:5432/eip_db
  - [FIXED] echo=True (logging all SQL) is now gated behind DEBUG=true env var.
    In production, echo=False prevents SQL query leakage in logs (SEC-3).
"""

import os

from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine

load_dotenv()

# AUDIT FIX: Use DATABASE_URL from environment.
# Default to SQLite for local development convenience ONLY.
# PostgreSQL is required for any deployment beyond a developer's local machine.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///database.db")

# AUDIT FIX: echo=True only when DEBUG=true.
# Never log all SQL queries in production — potential data leakage.
DEBUG_MODE = os.getenv("DEBUG", "false").lower() == "true"

# SQLite refuses to share a connection across threads by default, and the
# TestClient (like any threaded server) hands requests to worker threads.
# Other drivers reject this argument, so it is SQLite-only.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=DEBUG_MODE, connect_args=_connect_args)


def create_db_and_tables() -> None:
    """
    Creates all SQLModel-registered tables in the database.
    Called once at application startup via the FastAPI lifespan event.
    For production, prefer Alembic migrations over auto-creation.
    """
    SQLModel.metadata.create_all(engine)


def get_session():
    """
    FastAPI dependency that provides a database session per request.
    The session is automatically closed when the request completes.
    """
    with Session(engine) as session:
        yield session
