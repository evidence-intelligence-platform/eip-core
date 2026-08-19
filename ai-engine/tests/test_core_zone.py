"""
EIF: Core Zone API Integration Tests (Auth, Jobs, Applications)
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 06_API_CONTRACTS.md
"""

import uuid


def test_register_and_login(client):
    """Test user registration and subsequent JWT login."""
    # 1. Register candidate user
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": "test_user@eip.dev",
        "password": "securepassword123",
        "role": "candidate",
        "full_name": "Test User"
    })
    assert reg_resp.status_code == 201, f"Register failed: {reg_resp.json()}"
    reg_data = reg_resp.json()
    assert reg_data["email"] == "test_user@eip.dev"
    assert "access_token" in reg_data

    # 2. Login with credentials
    login_resp = client.post("/api/v1/auth/login", json={
        "email": "test_user@eip.dev",
        "password": "securepassword123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.json()}"
    login_data = login_resp.json()
    assert login_data["role"] == "candidate"
    assert len(login_data["access_token"]) > 20


def test_create_and_list_job_postings(client):
    """Test creating a job posting and listing all active jobs."""
    job_resp = client.post("/api/v1/jobs/", json={
        "title": "Lead AI Architect",
        "description": "Designing high-performance LLM systems with FastAPI and PyTorch.",
        "company_name": "TechWave AI"
    })
    assert job_resp.status_code == 201, f"Job creation failed: {job_resp.json()}"
    job_data = job_resp.json()
    assert job_data["title"] == "Lead AI Architect"

    list_resp = client.get("/api/v1/jobs/")
    assert list_resp.status_code == 200
    jobs = list_resp.json()
    assert any(j["title"] == "Lead AI Architect" for j in jobs)


def test_create_job_ignores_client_supplied_company_id(client):
    """
    Regression: create_job used to take `company_id` straight from the
    request body with no ownership check, so any authenticated employer
    could POST {"company_id": <any id>} and have their posting attributed
    to any company already in the database, real or seeded. The field must
    now have no effect at all — the company is always resolved server-side.
    """
    resp = client.post("/api/v1/jobs/", json={
        "title": f"IDOR Testi {uuid.uuid4().hex[:6]}",
        "description": "Bu ilan sahte bir company_id degeriyle denenmistir.",
        "company_name": f"IDOR Sirketi {uuid.uuid4().hex[:6]}",
        "company_id": 999999999,
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["company_id"] != 999999999


def test_two_employers_with_same_company_name_get_separate_companies(client, keyed_client):
    """
    Regression: Company.name carries no uniqueness constraint and
    registration never checks company_name for collisions, so resolving
    company identity by matching the free-text name used to let a second
    employer account that merely typed an existing company's exact display
    name get silently merged into that company's row — their postings would
    then be indistinguishable from the genuine company's listings. Two
    different, independently-registered employer accounts using the same
    display name must always get separate Company rows.
    """
    shared_name = f"Ortak Isim AS {uuid.uuid4().hex[:6]}"

    first = client.post("/api/v1/jobs/", json={
        "title": "Ilk Isveren Ilani",
        "description": "Ilk isverenin ilan metni budur.",
        "company_name": shared_name,
    })
    assert first.status_code == 201, first.text
    first_company_id = first.json()["company_id"]
    assert first_company_id is not None

    reg = keyed_client.post("/api/v1/auth/register", json={
        "email": f"rakip-{uuid.uuid4().hex[:8]}@example.com",
        "password": "personal-pass-1",
        "role": "employer",
        "company_name": shared_name,
        "tax_number": "1234567890",  # checksum-valid VKN
        "company_size": "1-5",
    })
    assert reg.status_code == 201, reg.text
    token = reg.json()["access_token"]

    second = keyed_client.post(
        "/api/v1/jobs/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Ikinci Isveren Ilani",
            "description": "Ikinci isverenin ilan metni budur.",
            "company_name": shared_name,
        },
    )
    assert second.status_code == 201, second.text
    second_company_id = second.json()["company_id"]
    assert second_company_id is not None
    assert second_company_id != first_company_id, (
        "iki bagimsiz isveren hesabi ayni sirket adiyla ayni Company satirina "
        "birlesmemeli"
    )


def test_job_title_and_description_reject_blank(client):
    """A whitespace-only title/description must never mint a blank AI
    grading criterion (Explainability First)."""
    resp = client.post("/api/v1/jobs/", json={
        "title": "   ",
        "description": "Gecerli bir aciklama.",
        "company_name": f"Bos Alan Testi {uuid.uuid4().hex[:6]}",
    })
    assert resp.status_code == 422, resp.text

    resp2 = client.post("/api/v1/jobs/", json={
        "title": "Gecerli baslik",
        "description": "   ",
        "company_name": f"Bos Alan Testi {uuid.uuid4().hex[:6]}",
    })
    assert resp2.status_code == 422, resp2.text


def test_employer_can_close_own_posting_but_not_someone_elses(client, keyed_client):
    """PATCH lets an employer close a filled role (stopping new applications
    via the existing status == "active" gate) but only on their own posting."""
    created = client.post("/api/v1/jobs/", json={
        "title": f"Kapatilacak Ilan {uuid.uuid4().hex[:6]}",
        "description": "Bu ilan kapatilacaktir.",
        "company_name": f"Kapatma Testi {uuid.uuid4().hex[:6]}",
    })
    assert created.status_code == 201, created.text
    job_id = created.json()["id"]

    # A different employer account may not touch this posting.
    reg = keyed_client.post("/api/v1/auth/register", json={
        "email": f"baska-isveren-{uuid.uuid4().hex[:8]}@example.com",
        "password": "personal-pass-1",
        "role": "employer",
        "company_name": f"Baska Sirket {uuid.uuid4().hex[:6]}",
        "tax_number": "1234567890",
        "company_size": "1-5",
    })
    assert reg.status_code == 201, reg.text
    other_token = reg.json()["access_token"]
    forbidden = keyed_client.patch(
        f"/api/v1/jobs/{job_id}",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"status": "closed"},
    )
    assert forbidden.status_code == 403, forbidden.text

    closed = client.patch(f"/api/v1/jobs/{job_id}", json={"status": "closed"})
    assert closed.status_code == 200, closed.text
    assert closed.json()["status"] == "closed"

    mine = client.get("/api/v1/jobs/mine")
    assert mine.status_code == 200
    assert any(j["id"] == job_id and j["status"] == "closed" for j in mine.json())
