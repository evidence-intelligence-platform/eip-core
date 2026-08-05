"""
EIF: Router-Level Zero Trust Enforcement Tests
---
Verifies that every CRUD router rejects requests without a valid
X-Internal-API-Key, and that public auth endpoints stay reachable.
Regression guard for the gap where only the extraction endpoints
were protected while candidates/requirements/jobs/applications
were fully open.
"""

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
