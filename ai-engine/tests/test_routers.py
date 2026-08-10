"""
EIF: Router Integration Tests
---
Version: 1.2.0
Owner: EIF Architecture Team
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III — Test-Driven AI Integration
---
Tests CRUD routes for Candidates and Requirements.
Uses the shared test engine and authenticated client from conftest.py.
No external API keys required.
To run: python -m pytest tests/test_routers.py -v
"""

import uuid

import pytest


def test_create_and_list_candidates(client):
    """Verify that creating a candidate persists it and the list endpoint returns it."""
    from tests.conftest import link_candidate_to_employer

    ext_id = f"cand_router_test_{uuid.uuid4()}"
    resp = client.post("/api/v1/candidates/", json={
        "external_id": ext_id,
        "name": "Jane Doe"
    })
    assert resp.status_code == 200, f"Create failed: {resp.json()}"
    data = resp.json()
    assert data["name"] == "Jane Doe"
    assert data["external_id"] == ext_id

    # The roster is need-to-know now: an employer sees a candidate only once
    # that candidate has applied to one of the employer's postings.
    link_candidate_to_employer(ext_id, employer_user_id=900)

    resp = client.get("/api/v1/candidates/")
    assert resp.status_code == 200
    assert any(c["external_id"] == ext_id for c in resp.json())
    print("✅ TEST PASSED: Candidate create and list.")


def test_create_candidate_cannot_choose_the_owning_account(client):
    """
    The request body used to be the table model itself, so a caller could set
    user_id — the column the moderation gate reads to decide who may see
    pending evidence, and the one KVKK deletion follows. Ownership comes from
    the token, exactly as job postings record their creator.
    """
    ext_id = f"cand_planted_{uuid.uuid4()}"
    resp = client.post("/api/v1/candidates/", json={
        "external_id": ext_id,
        "name": "Planted",
        "user_id": 950,
        "id": 4242,
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["user_id"] == 900, "the profile belongs to the authenticated caller"
    assert data["id"] != 4242, "the primary key is the database's to hand out"


def test_create_candidate_refuses_another_accounts_reserved_id(candidate_client):
    """
    "cand_<n>" is the namespace registration mints server-issued identities
    from, and account ids are sequential — so a signed-in caller could
    pre-claim future users' ids ("cand_904", "cand_905", ...) before those
    people register and permanently lock them out of every candidate flow.
    Only the account an id belongs to may create it.
    """
    resp = candidate_client.post("/api/v1/candidates/", json={
        "external_id": "cand_902",  # the admin fixture account's id, not 901's
        "name": "Sahte Kimlik",
    })
    assert resp.status_code == 403, resp.text


def test_create_candidate_allows_the_callers_own_reserved_id(candidate_client):
    """The apply flow legitimately creates the caller's own "cand_<id>"."""
    from sqlmodel import Session, select

    from src.db.models import Candidate
    from tests.conftest import TEST_ENGINE

    resp = candidate_client.post("/api/v1/candidates/", json={
        "external_id": "cand_901",  # the candidate fixture's own account id
        "name": "Kendi Kimliği",
    })
    try:
        assert resp.status_code == 200, resp.text
        assert resp.json()["user_id"] == 901
    finally:
        # Keep the shared database as the other tests expect it.
        with Session(TEST_ENGINE) as session:
            row = session.exec(
                select(Candidate).where(Candidate.external_id == "cand_901")
            ).first()
            if row:
                session.delete(row)
                session.commit()


def test_create_and_list_requirements(client):
    """Verify that creating a requirement persists it and the list endpoint returns it."""
    ext_id = f"req_router_test_{uuid.uuid4()}"
    resp = client.post("/api/v1/requirements/", json={
        "external_id": ext_id,
        "description": "Python Expert"
    })
    assert resp.status_code == 200, f"Create failed: {resp.json()}"
    data = resp.json()
    assert data["description"] == "Python Expert"
    assert data["external_id"] == ext_id

    resp = client.get("/api/v1/requirements/")
    assert resp.status_code == 200
    assert any(r["external_id"] == ext_id for r in resp.json())
    print("✅ TEST PASSED: Requirement create and list.")


def test_requirement_id_is_not_client_settable(client):
    """
    The request body used to bind the Requirement table model, so a caller
    could choose the primary key — colliding with (or squatting) the id the
    database would hand out next — and forge created_at. The DTO must drop
    both; only the database assigns them.
    """
    from sqlmodel import Session, select

    from src.db.models import Requirement
    from tests.conftest import TEST_ENGINE

    ext_id = f"req_dto_test_{uuid.uuid4()}"
    forged_id = 987_654
    resp = client.post("/api/v1/requirements/", json={
        "external_id": ext_id,
        "description": "DTO guard",
        "id": forged_id,
        "created_at": "1999-01-01T00:00:00",
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["id"] != forged_id, "the client-sent id must be ignored"
    assert not data["created_at"].startswith("1999"), "the client-sent timestamp must be ignored"

    with Session(TEST_ENGINE) as session:
        assert session.get(Requirement, forged_id) is None, (
            "no row may exist under the forged primary key"
        )
        row = session.exec(
            select(Requirement).where(Requirement.external_id == ext_id)
        ).first()
        assert row is not None and row.id == data["id"]


def test_create_requirement_refuses_the_job_posting_namespace(client):
    """
    "req_job_<n>" is minted by publishing a posting, and the description stored
    under it is the criterion the model grades every applicant by. An employer
    who could pre-claim a competitor's next posting id would choose that text —
    and break the publish that was supposed to create it.
    """
    resp = client.post("/api/v1/requirements/", json={
        "external_id": "req_job_999999",
        "description": "Squatted by another employer.",
    })
    assert resp.status_code == 403, resp.text


def test_job_posting_is_not_published_without_its_requirement(client):
    """
    The posting and the requirement it is graded against used to be two
    separate commits, so anything that broke the second — a colliding
    "req_job_<id>" row — left a live, publicly listed posting behind whose
    evaluation criterion was somebody else's text. One transaction now: either
    both rows exist or neither does.
    """
    from sqlalchemy.exc import IntegrityError
    from sqlmodel import Session, select

    from src.db.models import JobPosting, Requirement
    from tests.conftest import TEST_ENGINE

    # SQLite hands out the next rowid, so the id the following posting would
    # take is known — squat its requirement directly (the API path is closed by
    # the reserved-namespace guard above).
    first = client.post("/api/v1/jobs/", json={
        "title": f"İlk İlan {uuid.uuid4().hex[:6]}",
        "description": "Sıradaki ilan kimliğini belirlemek için.",
    })
    assert first.status_code == 201, first.text
    colliding = f"req_job_{first.json()['id'] + 1}"
    with Session(TEST_ENGINE) as session:
        session.add(Requirement(external_id=colliding, description="Artık kalmış satır."))
        session.commit()

    title = f"Yetim İlan {uuid.uuid4().hex[:6]}"
    try:
        with pytest.raises(IntegrityError):
            client.post("/api/v1/jobs/", json={
                "title": title,
                "description": "Bu ilan hiç yayına çıkmamalı.",
            })
        with Session(TEST_ENGINE) as session:
            assert session.exec(
                select(JobPosting).where(JobPosting.title == title)
            ).all() == [], "a posting must never outlive the requirement it is graded by"
    finally:
        with Session(TEST_ENGINE) as session:
            row = session.exec(
                select(Requirement).where(Requirement.external_id == colliding)
            ).first()
            if row:
                session.delete(row)
                session.commit()


def test_auth_required_for_extraction(unauthenticated_client):
    """
    Verify that the extraction endpoint rejects requests without the API key.
    This validates the Zero Trust implementation.
    """
    resp = unauthenticated_client.post("/api/v1/extract", json={
        "payload": {
            "candidate_id": "cand_unauth",
            "source_type": "GITHUB",
            "raw_data": "some code",
            "consent_verified": True
        },
        "requirement": {
            "id": "req_unauth",
            "description": "Some requirement"
        }
    })
    assert resp.status_code == 403, (
        f"Expected 403 Forbidden for unauthenticated request, got {resp.status_code}"
    )
    print("✅ TEST PASSED: Extraction endpoint correctly rejected unauthenticated request.")
