"""
EIF: Role Boundary Tests
---
Locks in who may do what. Before these rules existed, the internal API key
was the only gate — and the frontend proxy attaches it to every request, so
any unauthenticated browser could read the candidate roster, create job
postings, and accept or decline applications.
"""

import uuid

import pytest

# (method, path) pairs that must reject a caller carrying only the internal
# key — i.e. a browser request that never signed in.
REQUIRES_SIGN_IN = [
    ("get", "/api/v1/candidates/"),
    ("post", "/api/v1/candidates/"),
    ("get", "/api/v1/requirements/"),
    ("post", "/api/v1/requirements/"),
    ("post", "/api/v1/jobs/"),
    ("get", "/api/v1/applications/"),
    ("post", "/api/v1/applications/"),
]


@pytest.mark.parametrize("method,path", REQUIRES_SIGN_IN)
def test_requires_signed_in_user(keyed_client, method, path):
    resp = keyed_client.request(method.upper(), path)
    assert resp.status_code == 401, (
        f"{method.upper()} {path} answered {resp.status_code} to a request with no user token"
    )


def test_public_job_list_stays_open(keyed_client):
    """Job seekers browse before signing up; this list must stay public."""
    resp = keyed_client.get("/api/v1/jobs/")
    assert resp.status_code == 200


def test_candidate_cannot_create_job(candidate_client):
    resp = candidate_client.post(
        "/api/v1/jobs/",
        json={"title": "Şef", "description": "Mutfak", "category": "GASTRONOMY"},
    )
    assert resp.status_code == 403


def test_candidate_cannot_decide_applications(candidate_client):
    resp = candidate_client.patch("/api/v1/applications/1", json={"status": "accepted"})
    assert resp.status_code == 403, "A candidate must not be able to accept their own application"


def test_candidate_cannot_list_all_candidates(candidate_client):
    resp = candidate_client.get("/api/v1/candidates/")
    assert resp.status_code == 403, "The candidate roster is employer-only"


def test_employer_can_create_job_with_category(client):
    """A posted job keeps its sector — the column the filters match on."""
    resp = client.post(
        "/api/v1/jobs/",
        json={
            "title": f"Kıdemli Aşçı {uuid.uuid4().hex[:6]}",
            "description": "Mutfak yönetimi ve menü planlama",
            "category": "GASTRONOMY",
            "company_name": "Test Restoran",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["category"] == "GASTRONOMY"
    assert body["company_name"] == "Test Restoran", "company_name must be resolved, not a placeholder"


def test_registration_rejects_admin_role(keyed_client):
    """The register endpoint is public — self-granted admin must be impossible."""
    resp = keyed_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"admin-{uuid.uuid4().hex[:8]}@example.com",
            "password": "secret123",
            "role": "admin",
        },
    )
    assert resp.status_code == 422


def test_registered_candidate_gets_server_owned_identity(keyed_client):
    """The UI must never build the identity itself; /auth/me hands it out."""
    email = f"cand-{uuid.uuid4().hex[:8]}@example.com"
    reg = keyed_client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "role": "candidate", "full_name": "Test Aday"},
    )
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]

    me = keyed_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    assert me.json()["candidate_external_id"], "a candidate account must expose its candidate identity"


def test_candidate_only_sees_own_applications(keyed_client):
    """
    Regression guard: the list endpoint used to return the whole table, so every
    candidate saw everyone else's applications and their accept/decline status.
    """
    email = f"lone-{uuid.uuid4().hex[:8]}@example.com"
    reg = keyed_client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "role": "candidate", "full_name": "Yalnız Aday"},
    )
    token = reg.json()["access_token"]

    resp = keyed_client.get(
        "/api/v1/applications/", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == [], "a candidate with no applications must see an empty list"
