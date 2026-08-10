"""
EIF: Router-Level Zero Trust Enforcement Tests
---
Verifies that every CRUD router rejects requests without a valid
X-Internal-API-Key, and that public auth endpoints stay reachable.
Regression guard for the gap where only the extraction endpoints
were protected while candidates/requirements/jobs/applications
were fully open.
"""

import uuid

import pytest

PROTECTED_ENDPOINTS = [
    ("get", "/api/v1/candidates/"),
    ("post", "/api/v1/candidates/"),
    ("get", "/api/v1/requirements/"),
    ("post", "/api/v1/requirements/"),
    ("get", "/api/v1/jobs/"),
    ("post", "/api/v1/jobs/"),
    ("get", "/api/v1/applications/"),
    ("post", "/api/v1/applications/"),
]


@pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS)
def test_router_rejects_missing_key(unauthenticated_client, method, path):
    resp = unauthenticated_client.request(method.upper(), path)
    assert resp.status_code == 403, f"{method.upper()} {path} must require the internal API key"


@pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS)
def test_router_rejects_wrong_key(unauthenticated_client, method, path):
    resp = unauthenticated_client.request(
        method.upper(), path, headers={"X-Internal-API-Key": "definitely-wrong-key"}
    )
    assert resp.status_code == 403, f"{method.upper()} {path} must reject an invalid key"


def test_auth_register_login_stay_public(unauthenticated_client):
    # Public zone endpoints must NOT require the internal key — a 403 here
    # would lock users out entirely. Any non-403 status (e.g. 422 validation
    # error for the empty body) proves the dependency is not applied.
    for path in ("/api/v1/auth/register", "/api/v1/auth/login"):
        resp = unauthenticated_client.post(path, json={})
        assert resp.status_code != 403, f"{path} must stay reachable without the internal key"


def _reg(keyed_client, **overrides):
    body = {
        "email": f"co-{uuid.uuid4().hex[:8]}@example.com",
        "password": "personal-pass-1",
        "role": "employer",
    }
    body.update(overrides)
    return keyed_client.post("/api/v1/auth/register", json=body)


def test_candidate_registers_with_only_personal_email(keyed_client):
    """A job seeker needs nothing but a personal e-mail and a password."""
    resp = keyed_client.post("/api/v1/auth/register", json={
        "email": f"seeker-{uuid.uuid4().hex[:8]}@example.com",
        "password": "personal-pass-1",
        "role": "candidate",
        "full_name": "İş Arayan",
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["role"] == "candidate"


def test_employer_must_supply_company_name_and_tax_number(keyed_client):
    # No company fields at all → rejected.
    assert _reg(keyed_client, company_name="", tax_number="").status_code == 400
    # Missing/invalid tax number → rejected.
    assert _reg(
        keyed_client, company_name="Acme A.Ş.", tax_number="12", company_size="1-5"
    ).status_code == 400


def test_small_employer_needs_no_corporate_email(keyed_client):
    """A 1-5 person company is not asked for a corporate address."""
    resp = _reg(
        keyed_client,
        company_name="Küçük Atölye",
        tax_number="1234567890",
        company_size="1-5",
    )
    assert resp.status_code == 201, resp.text


def test_large_employer_must_supply_corporate_email(keyed_client):
    """Past 5 people, a corporate e-mail becomes required."""
    without = _reg(
        keyed_client,
        company_name="Büyük Şirket A.Ş.",
        tax_number="1234567890",
        company_size="21-50",
    )
    assert without.status_code == 400, without.text

    with_corp = _reg(
        keyed_client,
        company_name="Büyük Şirket A.Ş.",
        tax_number="1234567890",
        company_size="21-50",
        company_email="ik@buyuksirket.com",
    )
    assert with_corp.status_code == 201, with_corp.text
