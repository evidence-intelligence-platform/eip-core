"""
EIF: pytest Configuration and Shared Test Fixtures
---
Version: 1.1.0
Owner: EIF Architecture Team
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III — Test-Driven AI Integration
---
TECHNICAL NOTE on in-memory SQLite:
  "sqlite://" creates a NEW empty database for EACH connection.
  FastAPI dependency injection creates a new Session per request,
  which means each request gets a brand-new empty database — tables don't persist.

  Solution: Use a named shared-cache memory database:
    "file::memory:?cache=shared&uri=true"
  This makes all connections share the same in-memory database within the process.
  Tables created via create_all() persist across sessions for the test run lifetime.
"""

import os
import pytest
from sqlmodel import SQLModel, Session, create_engine
from fastapi.testclient import TestClient

# ─────────────────────────────────────────────────────────────────────────────
# Environment Setup (must happen before any app module is imported)
# ─────────────────────────────────────────────────────────────────────────────

TEST_API_KEY = "eif-test-internal-api-key"

os.environ.setdefault("GEMINI_API_KEY", "test-placeholder-key-not-used-in-unit-tests")
os.environ["INTERNAL_API_KEY"] = TEST_API_KEY
os.environ["DEBUG"] = "false"

# ─────────────────────────────────────────────────────────────────────────────
# Import App (after env vars are set)
# ─────────────────────────────────────────────────────────────────────────────

from src.main import app  # noqa: E402
from src.db.database import get_session  # noqa: E402
# Must import all models before create_all() so SQLModel registers them
from src.db import models  # noqa: E402, F401

# ─────────────────────────────────────────────────────────────────────────────
# Shared Named In-Memory SQLite Engine
# ─────────────────────────────────────────────────────────────────────────────
# Use shared-cache named memory URL so all sessions see the same database.
# Without shared cache, each new connection sees an empty database.

TEST_ENGINE = create_engine(
    "sqlite:///file:eif_test_memory?mode=memory&cache=shared&uri=true",
    connect_args={"check_same_thread": False},
)

# Create all registered tables once
SQLModel.metadata.create_all(TEST_ENGINE)


def get_test_session():
    """Test database session dependency — replaces production get_session."""
    with Session(TEST_ENGINE) as session:
        yield session


# Override FastAPI dependency at application level for all tests
app.dependency_overrides[get_session] = get_test_session


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """Pre-authenticated TestClient shared across a test module."""
    with TestClient(app, headers={"X-Internal-API-Key": TEST_API_KEY}) as c:
        yield c


@pytest.fixture(scope="module")
def unauthenticated_client():
    """TestClient WITHOUT authentication — used to test auth enforcement."""
    with TestClient(app) as c:
        yield c
