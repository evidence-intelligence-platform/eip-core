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
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

# ─────────────────────────────────────────────────────────────────────────────
# Environment Setup (must happen before any app module is imported)
# ─────────────────────────────────────────────────────────────────────────────

TEST_API_KEY = "eif-test-internal-api-key"

os.environ.setdefault("GEMINI_API_KEY", "test-placeholder-key-not-used-in-unit-tests")
os.environ["INTERNAL_API_KEY"] = TEST_API_KEY
os.environ["DEBUG"] = "false"
# Point the *production* engine at the same in-memory database as the tests.
# Otherwise app startup opens the developer's local database.db, and a stale
# schema there makes tests fail with "no such column" — a failure that never
# reproduces in CI, where the file does not exist.
os.environ["DATABASE_URL"] = "sqlite:///file:eif_test_memory?mode=memory&cache=shared&uri=true"

# ─────────────────────────────────────────────────────────────────────────────
# Import App (after env vars are set)
# ─────────────────────────────────────────────────────────────────────────────

# Must import all models before create_all() so SQLModel registers them
from src.db import models  # noqa: E402, F401
from src.db.database import get_session  # noqa: E402
from src.main import app  # noqa: E402

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

def _token_for(role: str, user_id: int, email: str) -> str:
    """Signs a JWT the same way /auth/login does."""
    from src.security.jwt import create_access_token

    return create_access_token({"sub": email, "user_id": user_id, "role": role})


@pytest.fixture(scope="module")
def client():
    """
    TestClient carrying the internal key *and* an employer JWT.

    The routers now authenticate the user, not just the proxy, so the internal
    key alone is no longer enough for most endpoints.
    """
    headers = {
        "X-Internal-API-Key": TEST_API_KEY,
        "Authorization": f"Bearer {_token_for('employer', 900, 'employer@test.local')}",
    }
    with TestClient(app, headers=headers) as c:
        yield c


@pytest.fixture(scope="module")
def candidate_client():
    """TestClient authenticated as a candidate — used for role-boundary tests."""
    headers = {
        "X-Internal-API-Key": TEST_API_KEY,
        "Authorization": f"Bearer {_token_for('candidate', 901, 'candidate@test.local')}",
    }
    with TestClient(app, headers=headers) as c:
        yield c


@pytest.fixture(scope="module")
def keyed_client():
    """
    TestClient with the internal key but NO user token — what an unauthenticated
    browser request looks like once it has passed through the proxy.
    """
    with TestClient(app, headers={"X-Internal-API-Key": TEST_API_KEY}) as c:
        yield c


@pytest.fixture(scope="module")
def unauthenticated_client():
    """TestClient WITHOUT authentication — used to test auth enforcement."""
    with TestClient(app) as c:
        yield c
