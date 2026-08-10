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
from sqlmodel import Session, SQLModel, create_engine, select

# ─────────────────────────────────────────────────────────────────────────────
# Environment Setup (must happen before any app module is imported)
# ─────────────────────────────────────────────────────────────────────────────

TEST_API_KEY = "eif-test-internal-api-key"

# setdefault is not enough: CI passes GEMINI_API_KEY through from a secret, so
# when the secret is unset the variable exists as an empty string and the
# placeholder is never applied — GeminiLLMService then refuses to start.
if not os.environ.get("GEMINI_API_KEY"):
    os.environ["GEMINI_API_KEY"] = "test-placeholder-key-not-used-in-unit-tests"
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


def _seed_fixture_accounts() -> None:
    """
    The client fixtures below sign their own JWTs instead of registering, but
    authentication re-checks that the account behind a token still exists
    (KVKK deletion must invalidate live tokens), so those identities need
    real UserAccount rows. They never log in — the hash is a placeholder.
    """
    accounts = [
        (900, "employer@test.local", "employer"),
        (901, "candidate@test.local", "candidate"),
        (902, "admin@test.local", "admin"),
    ]
    with Session(TEST_ENGINE) as session:
        for user_id, email, role in accounts:
            if session.get(models.UserAccount, user_id) is None:
                session.add(models.UserAccount(
                    id=user_id,
                    email=email,
                    hashed_password="test-fixture-account-no-login",
                    role=role,
                ))
        session.commit()


_seed_fixture_accounts()


def create_candidate_profile(external_id: str, user_id: int, name: str = "Test Aday") -> None:
    """
    Creates a Candidate profile owned by `user_id`.

    Extraction is bound to the caller's own profile — evidence filed under an
    id the caller does not own is refused — so a test that uploads evidence
    needs the profile to exist first, exactly as registration creates it in
    production.
    """
    with Session(TEST_ENGINE) as session:
        session.add(models.Candidate(external_id=external_id, user_id=user_id, name=name))
        session.commit()


def link_candidate_to_employer(candidate_external_id: str, employer_user_id: int = 900) -> None:
    """
    Wire the need-to-know relationship the roster and report access now
    require: a posting owned by `employer_user_id`, and an application from
    this candidate to it. Without an application, an employer has no business
    seeing the candidate — which is exactly the access rule under test, so any
    test where an employer legitimately views a candidate must establish the
    link the same way production does (the candidate applied).
    """
    with Session(TEST_ENGINE) as session:
        cand = session.exec(
            select(models.Candidate).where(
                models.Candidate.external_id == candidate_external_id
            )
        ).first()
        job = models.JobPosting(
            title="Erişim Testi İlanı",
            description="need-to-know bağlantısı için ilan",
            created_by_user_id=employer_user_id,
        )
        session.add(job)
        session.flush()
        session.add(models.JobApplication(candidate_id=cand.id, job_id=job.id))
        session.commit()


def get_test_session():
    """Test database session dependency — replaces production get_session."""
    with Session(TEST_ENGINE) as session:
        yield session


# Override FastAPI dependency at application level for all tests
app.dependency_overrides[get_session] = get_test_session


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """
    Every TestClient request arrives from the same host, so all tests share
    one rate-limit bucket per endpoint. The auth endpoints now cap at 5-10/min;
    without a reset, the cumulative register/login/forgot calls across the
    suite would trip 429 and fail unrelated tests. Clearing the counters
    before each test isolates them — the dedicated rate-limit tests hammer a
    single endpoint within one test, so they still reach their own limits.
    """
    from src.rate_limit import limiter

    limiter.reset()
    yield


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
def admin_client():
    """TestClient authenticated as an admin — used for moderation tests."""
    headers = {
        "X-Internal-API-Key": TEST_API_KEY,
        "Authorization": f"Bearer {_token_for('admin', 902, 'admin@test.local')}",
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
