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


def test_registration_fails_loudly_when_the_minted_identity_is_taken(keyed_client):
    """
    Registration derives the profile id as "cand_<user id>". When that id was
    already taken, it used to skip profile creation SILENTLY: 201, a token,
    but candidate_external_id null forever — the account could never apply or
    upload evidence, with no in-product recovery. A taken identity must abort
    the registration loudly and leave no half-created account behind.
    """
    from sqlmodel import Session, select

    from src.db.models import Candidate, UserAccount
    from tests.conftest import TEST_ENGINE

    # Predict the next account id and squat its identity directly in the
    # database (the API path is closed by the reserved-namespace guard).
    probe = keyed_client.post(
        "/api/v1/auth/register",
        json={"email": f"probe-{uuid.uuid4().hex[:8]}@example.com",
              "password": "secret123", "role": "candidate"},
    )
    assert probe.status_code == 201, probe.text
    probe_id = keyed_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {probe.json()['access_token']}"},
    ).json()["id"]
    squatted = f"cand_{probe_id + 1}"
    with Session(TEST_ENGINE) as session:
        session.add(Candidate(external_id=squatted, user_id=probe_id, name="Çömelen"))
        session.commit()

    victim_email = f"victim-{uuid.uuid4().hex[:8]}@example.com"
    try:
        resp = keyed_client.post(
            "/api/v1/auth/register",
            json={"email": victim_email, "password": "secret123", "role": "candidate"},
        )
        assert resp.status_code == 409, resp.text
        with Session(TEST_ENGINE) as session:
            assert session.exec(
                select(UserAccount).where(UserAccount.email == victim_email)
            ).first() is None, "the half-created account must be rolled back"
    finally:
        # The rolled-back id gets handed out again, so the squat row must not
        # leak into later registrations in the suite.
        with Session(TEST_ENGINE) as session:
            row = session.exec(
                select(Candidate).where(Candidate.external_id == squatted)
            ).first()
            if row:
                session.delete(row)
                session.commit()


def test_promotion_takes_effect_without_a_new_token(keyed_client):
    """
    The moderation panel gates on the role /auth/me reads from the database,
    while the API used to gate on the role frozen into the 24h token: a
    promoted user saw the panel unlock and every call behind it answer 403
    until they signed out. The account row is the single authority.
    """
    email = f"promote-{uuid.uuid4().hex[:8]}@example.com"
    reg = keyed_client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "secret123", "role": "candidate"},
    )
    assert reg.status_code == 201, reg.text
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    assert keyed_client.get("/api/v1/moderation/evidences", headers=headers).status_code == 403

    from scripts.promote_admin import promote

    promote(email)

    assert keyed_client.get("/api/v1/moderation/evidences", headers=headers).status_code == 200, (
        "the freshly promoted admin must not have to log in again"
    )


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


def test_candidate_cannot_read_another_candidates_profile(candidate_client):
    """
    The roster is employer-only — but identities are minted as "cand_<user id>"
    from a sequential key, so the by-id view has to draw the same line or
    anyone who can count reads every profile.
    """
    from tests.conftest import create_candidate_profile

    ext_id = f"cand_stranger_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(ext_id, user_id=77777, name="Yabancı")

    resp = candidate_client.get(f"/api/v1/candidates/{ext_id}")
    assert resp.status_code == 403, resp.text


def test_candidate_profile_never_exposes_the_owning_account(candidate_client):
    """
    `user_id` is the internal account key every ownership check is built on and
    `consent_timestamp` is a KVKK record; the read view carries neither.
    """
    from tests.conftest import create_candidate_profile

    ext_id = f"cand_own_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(ext_id, user_id=901, name="Kendi Kaydı")

    resp = candidate_client.get(f"/api/v1/candidates/{ext_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["external_id"] == ext_id
    assert "user_id" not in body
    assert "consent_timestamp" not in body


def test_candidate_roster_never_exposes_the_owning_account(client):
    """
    Same rule as the per-id view, bulk edition: the roster used to serve the
    raw table model, handing every employer account `user_id` — the sequential
    key every ownership check is built on — and the KVKK `consent_timestamp`
    for every candidate on the platform in one call.
    """
    from tests.conftest import create_candidate_profile

    ext_id = f"cand_roster_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(ext_id, user_id=77779, name="Listedeki")

    resp = client.get("/api/v1/candidates/")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert any(row["external_id"] == ext_id for row in rows), (
        "the seeded profile must appear in the employer roster"
    )
    for row in rows:
        assert "user_id" not in row
        assert "consent_timestamp" not in row


def _job_id(client) -> int:
    resp = client.post("/api/v1/jobs/", json={
        "title": f"Test İlanı {uuid.uuid4().hex[:6]}",
        "description": "Başvuru sahipliği testi.",
        "category": "OTHER",
    })
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_candidate_cannot_apply_as_someone_else(client, candidate_client):
    """
    candidate_id used to be taken straight from the body, so anyone could file
    an application in a rival's name — the employer dashboard shows the
    victim's real name and external_id, and nothing records who submitted it.
    """
    from sqlmodel import Session, select

    from src.db.models import Candidate, JobApplication
    from tests.conftest import TEST_ENGINE, create_candidate_profile

    victim_ext = f"cand_victim_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(victim_ext, user_id=77777, name="Kurban")
    with Session(TEST_ENGINE) as session:
        victim_id = session.exec(
            select(Candidate).where(Candidate.external_id == victim_ext)
        ).first().id

    resp = candidate_client.post("/api/v1/applications/", json={
        "candidate_id": victim_id,
        "job_id": _job_id(client),
    })
    assert resp.status_code == 403, resp.text

    with Session(TEST_ENGINE) as session:
        assert session.exec(
            select(JobApplication).where(JobApplication.candidate_id == victim_id)
        ).all() == [], "the forged application must not have been persisted"


def test_application_cannot_be_created_already_accepted(client, candidate_client):
    """
    The body used to be the table model, so a candidate could set
    status="accepted" and mint the very decision the employer-only PATCH
    exists to protect.
    """
    from sqlmodel import Session, select

    from src.db.models import Candidate
    from tests.conftest import TEST_ENGINE, create_candidate_profile

    own_ext = f"cand_self_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(own_ext, user_id=901, name="Kendi Başvurusu")
    with Session(TEST_ENGINE) as session:
        own_id = session.exec(
            select(Candidate).where(Candidate.external_id == own_ext)
        ).first().id

    job_id = _job_id(client)
    resp = candidate_client.post("/api/v1/applications/", json={
        "candidate_id": own_id,
        "job_id": job_id,
        "status": "accepted",
    })
    assert resp.status_code == 422, resp.text

    # The honest submission still works.
    resp = candidate_client.post("/api/v1/applications/", json={
        "candidate_id": own_id,
        "job_id": job_id,
        "status": "reviewing",
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "reviewing"


def test_employer_cannot_decide_another_employers_application(keyed_client, client):
    """
    The decision is irreversible, so an employer able to reach a competitor's
    applications by id could permanently kill their pipeline — and the
    candidate would see a rejection their actual employer never issued.
    """
    from sqlmodel import Session, select

    from src.db.models import Candidate, JobApplication
    from tests.conftest import TEST_ENGINE, create_candidate_profile

    reg = keyed_client.post("/api/v1/auth/register", json={
        "email": f"owner-{uuid.uuid4().hex[:8]}@example.com",
        "password": "secret123",
        "role": "employer",
    })
    assert reg.status_code == 201, reg.text
    owner_headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    job_resp = keyed_client.post(
        "/api/v1/jobs/",
        json={"title": f"Rakip İlan {uuid.uuid4().hex[:6]}", "description": "Kendi hattı."},
        headers=owner_headers,
    )
    assert job_resp.status_code == 201, job_resp.text
    job_id = job_resp.json()["id"]

    applicant_ext = f"cand_applicant_{uuid.uuid4().hex[:8]}"
    create_candidate_profile(applicant_ext, user_id=77778, name="Başvuran")
    with Session(TEST_ENGINE) as session:
        applicant = session.exec(
            select(Candidate).where(Candidate.external_id == applicant_ext)
        ).first()
        application = JobApplication(candidate_id=applicant.id, job_id=job_id)
        session.add(application)
        session.commit()
        app_id = application.id

    # `client` is a different employer account (900).
    resp = client.patch(f"/api/v1/applications/{app_id}", json={"status": "declined"})
    assert resp.status_code == 403, resp.text
    with Session(TEST_ENGINE) as session:
        assert session.get(JobApplication, app_id).status == "submitted"

    # The employer who posted the job still decides it.
    resp = keyed_client.patch(
        f"/api/v1/applications/{app_id}", json={"status": "declined"}, headers=owner_headers
    )
    assert resp.status_code == 200, resp.text


def _register_employer(keyed_client) -> tuple[str, dict]:
    """Registers a fresh employer; returns (email, auth headers)."""
    email = f"emp-{uuid.uuid4().hex[:8]}@example.com"
    reg = keyed_client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "secret123",
        "role": "employer",
    })
    assert reg.status_code == 201, reg.text
    return email, {"Authorization": f"Bearer {reg.json()['access_token']}"}


def _post_job(keyed_client, headers) -> int:
    resp = keyed_client.post(
        "/api/v1/jobs/",
        json={"title": f"İlan {uuid.uuid4().hex[:6]}", "description": "Kapsam testi."},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _file_application(job_id: int, name: str = "Başvuran") -> int:
    """Inserts an application (and its candidate) directly; returns its id."""
    from sqlmodel import Session

    from src.db.models import Candidate, JobApplication
    from tests.conftest import TEST_ENGINE

    with Session(TEST_ENGINE) as session:
        candidate = Candidate(
            external_id=f"cand_scope_{uuid.uuid4().hex[:8]}",
            user_id=None,
            name=name,
        )
        session.add(candidate)
        session.flush()
        application = JobApplication(candidate_id=candidate.id, job_id=job_id)
        session.add(application)
        session.commit()
        return application.id


def test_employer_cannot_list_another_employers_applications(keyed_client, admin_client):
    """
    The listing carries applicant names and external ids. Unscoped, it handed
    every employer account the entire platform's pipelines — every rival's
    applicants and their accept/decline status.
    """
    _email_a, headers_a = _register_employer(keyed_client)
    _email_b, headers_b = _register_employer(keyed_client)

    app_a = _file_application(_post_job(keyed_client, headers_a), name="A'nın Adayı")
    app_b = _file_application(_post_job(keyed_client, headers_b), name="B'nin Adayı")

    ids_seen_by_a = {row["id"] for row in keyed_client.get(
        "/api/v1/applications/", headers=headers_a
    ).json()}
    assert app_a in ids_seen_by_a, "an employer must see applications into their own postings"
    assert app_b not in ids_seen_by_a, "an employer must not see a rival's applications"

    ids_seen_by_b = {row["id"] for row in keyed_client.get(
        "/api/v1/applications/", headers=headers_b
    ).json()}
    assert app_b in ids_seen_by_b
    assert app_a not in ids_seen_by_b

    # Admins keep the platform-wide view.
    ids_seen_by_admin = {row["id"] for row in admin_client.get("/api/v1/applications/").json()}
    assert {app_a, app_b} <= ids_seen_by_admin


def test_applications_on_ownerless_postings_stay_visible_to_employers(keyed_client):
    """
    Postings that predate ownership tracking have created_by_user_id NULL and
    cannot be attributed to anyone. Chosen transitional policy: they stay
    visible to every employer, so existing demo/legacy dashboards built on
    pre-ownership data do not go blank the day scoping ships.
    """
    from sqlmodel import Session

    from src.db.models import JobPosting
    from tests.conftest import TEST_ENGINE

    with Session(TEST_ENGINE) as session:
        legacy = JobPosting(
            created_by_user_id=None,
            title=f"Sahipsiz İlan {uuid.uuid4().hex[:6]}",
            description="Sahiplik takibinden önce açılmış ilan.",
        )
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id

    legacy_app = _file_application(legacy_id, name="Eski Sistemden")

    _email, headers = _register_employer(keyed_client)
    ids_seen = {row["id"] for row in keyed_client.get(
        "/api/v1/applications/", headers=headers
    ).json()}
    assert legacy_app in ids_seen, (
        "applications into ownerless (pre-ownership) postings must stay visible to employers"
    )


def test_application_list_decidable_flag_matches_decision_guard(keyed_client, admin_client):
    """
    Contract parity between the list and the decision PATCH. Employers are
    shown applications into ownerless (pre-ownership) postings, but the PATCH
    only lets them decide postings they created — so each listed row carries
    `decidable`, and the dashboard renders accept/decline buttons from it.
    A row claiming decidable must PATCH 200 and one that does not must 403;
    anything else dead-ends the employer journey in a surprise "yetkiniz yok".
    """
    from sqlmodel import Session

    from src.db.models import JobPosting
    from tests.conftest import TEST_ENGINE

    with Session(TEST_ENGINE) as session:
        legacy = JobPosting(
            created_by_user_id=None,
            title=f"Sahipsiz İlan {uuid.uuid4().hex[:6]}",
            description="Sahiplik takibinden önce açılmış ilan.",
        )
        session.add(legacy)
        session.commit()
        legacy_id = legacy.id
    legacy_app = _file_application(legacy_id, name="Eski Sistemden")

    _email, headers = _register_employer(keyed_client)
    own_app = _file_application(_post_job(keyed_client, headers), name="Sahipli Aday")

    rows = {row["id"]: row for row in keyed_client.get(
        "/api/v1/applications/", headers=headers
    ).json()}
    assert rows[own_app]["decidable"] is True
    assert rows[legacy_app]["decidable"] is False, (
        "an employer can never decide an ownerless posting's application; "
        "the list must say so instead of baiting a guaranteed 403"
    )

    # The flag mirrors the PATCH guard exactly.
    denied = keyed_client.patch(
        f"/api/v1/applications/{legacy_app}", json={"status": "accepted"}, headers=headers
    )
    assert denied.status_code == 403, denied.text
    allowed = keyed_client.patch(
        f"/api/v1/applications/{own_app}", json={"status": "accepted"}, headers=headers
    )
    assert allowed.status_code == 200, allowed.text

    # Admins may decide anything, ownerless postings included — and their
    # list says so, so the ownerless case has an actual resolution path.
    admin_rows = {row["id"]: row for row in admin_client.get("/api/v1/applications/").json()}
    assert admin_rows[legacy_app]["decidable"] is True
    resolved = admin_client.patch(
        f"/api/v1/applications/{legacy_app}", json={"status": "declined"}
    )
    assert resolved.status_code == 200, resolved.text


def test_application_decision_writes_audit_row(keyed_client):
    """
    An accept/decline is a legally relevant, irreversible decision about a
    person. It must leave an AuditTrail row in the same transaction: actor is
    the JWT sub, action names the verdict, target names the application.
    """
    from sqlmodel import Session, select

    from src.db.models import AuditTrail
    from tests.conftest import TEST_ENGINE

    email, headers = _register_employer(keyed_client)
    app_id = _file_application(_post_job(keyed_client, headers), name="Karar Bekleyen")

    resp = keyed_client.patch(
        f"/api/v1/applications/{app_id}", json={"status": "accepted"}, headers=headers
    )
    assert resp.status_code == 200, resp.text

    with Session(TEST_ENGINE) as session:
        rows = session.exec(select(AuditTrail).where(
            AuditTrail.target_entity == f"application:{app_id}"
        )).all()
    assert len(rows) == 1, "exactly one audit row must record the decision"
    assert rows[0].actor_id == email
    assert rows[0].action == "application.decision.accepted"
