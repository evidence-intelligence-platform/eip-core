"""
EIF: Core Zone API Integration Tests (Auth, Jobs, Applications)
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 06_API_CONTRACTS.md
"""


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
