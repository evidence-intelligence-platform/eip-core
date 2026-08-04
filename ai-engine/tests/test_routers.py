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


def test_create_and_list_candidates(client):
    """Verify that creating a candidate persists it and the list endpoint returns it."""
    ext_id = f"cand_router_test_{uuid.uuid4()}"
    resp = client.post("/api/v1/candidates/", json={
        "external_id": ext_id,
        "name": "Jane Doe"
    })
    assert resp.status_code == 200, f"Create failed: {resp.json()}"
    data = resp.json()
    assert data["name"] == "Jane Doe"
    assert data["external_id"] == ext_id

    resp = client.get("/api/v1/candidates/")
    assert resp.status_code == 200
    assert any(c["external_id"] == ext_id for c in resp.json())
    print("✅ TEST PASSED: Candidate create and list.")


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
