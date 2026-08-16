"""
EIF Automated End-to-End System Smoke Test CLI Tool
---
Version: 2.0.0
Owner: EIF Architecture Team
Compliance: 01_ENGINEERING_CONSTITUTION.md Article III — the lifecycle is
proven by execution, not by assertion.
---
Walks the 7 stages of the Evidence Intelligence Platform lifecycle in-process,
the way a real employer and a real candidate move through it:

1. Public health endpoint (the probe Docker and Railway call)
2. Employer + candidate registration, JWT login, profile identity
3. Requirement setup and the server-owned candidate identity
4. Consent gate, ownership gate and AI evidence extraction
5. Job posting published under the REGISTERED company
6. Application submission and the employer-only decision
7. Evidence audit from both sides of the need-to-know boundary

Two accounts are used on purpose. The engine binds evidence and applications to
the identity that owns them, so a single account cannot walk the whole flow:
the candidate files evidence for themselves, the employer decides.

Exit code is 0 only when every stage passed; any failure exits 1. A check that
cannot run (no LLM credentials) is reported as SKIPPED and named in the summary
— never as a pass.

Usage:
  python scripts/smoke_test.py
  python scripts/smoke_test.py --skip-llm   # environment without GEMINI_API_KEY
"""

import argparse
import os
import sys
import uuid

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), "..")))

# Set before importing the app: load_dotenv() never overrides an existing
# variable, so this pins the same key on both sides of the call and lets the
# smoke test run on a machine that has no .env at all.
API_KEY = os.getenv("INTERNAL_API_KEY", "eif-test-internal-api-key")
os.environ["INTERNAL_API_KEY"] = API_KEY
KEY_HEADERS = {"X-Internal-API-Key": API_KEY}

from fastapi.testclient import TestClient  # noqa: E402

from src.main import app  # noqa: E402
from src.services.tax_id import is_valid_vkn  # noqa: E402

PASSWORD = "SmokeTest123!"

# First 9 digits of the tax number used for the employer account. The 10th is
# the checksum digit, derived below — registration rejects an invented number.
VKN_PREFIX = "555000001"

SKIPPED: list[str] = []


def generate_vkn(prefix: str = VKN_PREFIX) -> str:
    """
    Builds a checksum-valid VKN by appending the single check digit that the
    production validator accepts for `prefix`.

    Registration validates the tax number with is_valid_tax_number (auth.py),
    so the test data has to come from that same algorithm. Deriving the digit
    here — instead of pasting a literal that happens to pass today — means the
    smoke test breaks loudly if the checksum rule ever changes, rather than
    failing at the registration step with an unexplained 400.
    """
    for check_digit in range(10):
        candidate = f"{prefix}{check_digit}"
        if is_valid_vkn(candidate):
            return candidate
    raise RuntimeError(f"No valid VKN check digit exists for prefix '{prefix}'.")


def auth_headers(token: str) -> dict[str, str]:
    """
    The internal key proves the caller is the trusted proxy; the JWT says who
    is asking. Every router past registration requires both.
    """
    return {**KEY_HEADERS, "Authorization": f"Bearer {token}"}


def log_stage(stage_num: int, title: str):
    print("\n==================================================")
    print(f" STAGE {stage_num}: {title}")
    print("==================================================")


def log_pass(msg: str):
    print(f"  [PASS] {msg}")


def log_skip(msg: str):
    SKIPPED.append(msg)
    print(f"  [SKIP] {msg}")


def log_fail(msg: str):
    print(f"  [FAIL] {msg}")
    print("\n==================================================")
    print(" [FAILURE] SMOKE TEST ABORTED — LIFECYCLE IS BROKEN")
    print("==================================================\n")
    sys.exit(1)


def llm_service_available() -> tuple[bool, str]:
    """
    Whether the extraction endpoints have a model provider to depend on.

    The LLM service is a FastAPI dependency, so a missing GEMINI_API_KEY makes
    the request blow up before any request body is even validated — including
    the consent-gate probe, which is otherwise credential-free. Checking the
    factory first keeps stage 4 from dying in an unrelated traceback.
    """
    try:
        from src.services.llm_factory import get_llm_service

        get_llm_service()
        return True, ""
    except Exception as exc:  # provider not configured, or dormant provider
        return False, str(exc)


def run_smoke_test(skip_llm: bool = False):
    print("[INIT] Starting Evidence Intelligence Platform End-to-End Smoke Test...\n")
    run_id = uuid.uuid4().hex[:8]

    # Context manager, so the lifespan runs and the tables exist before the
    # first request touches them.
    with TestClient(app) as client:
        # ──────────────────────────────────────────────────────────────────────
        # Stage 1: Health Check
        # ──────────────────────────────────────────────────────────────────────
        log_stage(1, "Public Health Endpoint")
        # /health, not /docs: this is the endpoint the container HEALTHCHECK and
        # Railway's healthcheckPath probe, and the only one that stays public.
        res = client.get("/health")
        if res.status_code != 200:
            log_fail(f"/health is unreachable: HTTP {res.status_code} — {res.text}")
        body = res.json()
        if body.get("status") != "healthy":
            log_fail(f"/health answered but reports an unhealthy engine: {body}")
        log_pass(f"/health is online (200 OK, status='{body['status']}', v{body.get('version')})")

        res = client.get("/docs")
        if res.status_code != 200:
            log_fail(f"API documentation is unreachable: HTTP {res.status_code}")
        log_pass("API documentation (/docs) renders")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 2: Registration & JWT Auth
        # ──────────────────────────────────────────────────────────────────────
        log_stage(2, "Employer & Candidate Registration + JWT Auth")
        tax_number = generate_vkn()
        log_pass(f"Generated checksum-valid VKN for the employer profile: {tax_number}")

        employer_email = f"employer_{run_id}@example.com"
        company_name = f"Acme Smoke A.S. {run_id}"
        employer_payload = {
            "email": employer_email,
            "password": PASSWORD,
            "role": "employer",
            "full_name": "Test Employer HR",
            # A company account must be attributable to a legal entity: name,
            # a checksum-valid tax number and a headcount band are all
            # mandatory (auth.py::_validate_employer_profile). The "1-5" band
            # is the only one that does not additionally demand a corporate
            # e-mail address.
            "company_name": company_name,
            "tax_number": tax_number,
            "company_size": "1-5",
        }
        res = client.post("/api/v1/auth/register", json=employer_payload)
        if res.status_code != 201:
            log_fail(f"Employer registration failed ({res.status_code}): {res.text}")
        employer_token = res.json()["access_token"]
        log_pass(f"Employer registered: {res.json()['email']} (role: {res.json()['role']})")

        # The company profile is the promise the platform makes to job seekers,
        # so an invented tax number must not create an account. The counter-example
        # is the same number with the check digit bumped: ten digits, all numeric,
        # rejected only because the checksum — not merely the length — is verified.
        wrong_checksum = f"{VKN_PREFIX}{(int(tax_number[-1]) + 1) % 10}"
        res = client.post(
            "/api/v1/auth/register",
            json={**employer_payload, "email": f"bogus_{run_id}@example.com", "tax_number": wrong_checksum},
        )
        if res.status_code != 400:
            log_fail(
                f"Tax-number checksum is not enforced: '{wrong_checksum}' returned {res.status_code}"
            )
        log_pass(f"Registration rejects a wrong-checksum tax number '{wrong_checksum}' (HTTP 400)")

        candidate_email = f"candidate_{run_id}@example.com"
        res = client.post(
            "/api/v1/auth/register",
            json={
                "email": candidate_email,
                "password": PASSWORD,
                "role": "candidate",
                "full_name": "Jane Doe",
            },
        )
        if res.status_code != 201:
            log_fail(f"Candidate registration failed ({res.status_code}): {res.text}")
        candidate_token = res.json()["access_token"]
        log_pass(f"Candidate registered: {res.json()['email']} (role: {res.json()['role']})")

        for label, email in (("Employer", employer_email), ("Candidate", candidate_email)):
            res = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
            if res.status_code != 200:
                log_fail(f"{label} login failed ({res.status_code}): {res.text}")
            log_pass(f"{label} JWT login successful")

        res = client.get("/api/v1/auth/me", headers=auth_headers(employer_token))
        if res.status_code != 200:
            log_fail(f"Employer profile lookup failed ({res.status_code}): {res.text}")
        if res.json().get("company_name") != company_name:
            log_fail(f"Registered company name is not returned by /auth/me: {res.json()}")
        log_pass(f"Employer profile carries the registered company: '{res.json()['company_name']}'")

        res = client.get("/api/v1/auth/me", headers=auth_headers(candidate_token))
        if res.status_code != 200:
            log_fail(f"Candidate profile lookup failed ({res.status_code}): {res.text}")
        candidate_ext_id = res.json().get("candidate_external_id")
        if not candidate_ext_id:
            log_fail("Registration did not mint a server-owned candidate identity.")
        log_pass(f"Server-owned candidate identity minted: {candidate_ext_id}")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 3: Requirement & Candidate Profile
        # ──────────────────────────────────────────────────────────────────────
        log_stage(3, "Requirement Setup & Candidate Profile")
        req_ext_id = f"req_e2e_{run_id}"
        requirement_text = "Must have 3+ years experience with React and TypeScript"
        res = client.post(
            "/api/v1/requirements/",
            json={"external_id": req_ext_id, "description": requirement_text},
            headers=auth_headers(employer_token),
        )
        if res.status_code not in (200, 201):
            log_fail(f"Requirement creation failed ({res.status_code}): {res.text}")
        log_pass(f"Requirement created: {res.json()['external_id']}")

        res = client.get(
            f"/api/v1/candidates/{candidate_ext_id}", headers=auth_headers(candidate_token)
        )
        if res.status_code != 200:
            log_fail(f"Candidate profile read failed ({res.status_code}): {res.text}")
        candidate_db_id = res.json()["id"]
        log_pass(f"Candidate profile readable by its owner: '{res.json()['name']}' (ID #{candidate_db_id})")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 4: Consent Gate, Ownership Gate & AI Extraction
        # ──────────────────────────────────────────────────────────────────────
        log_stage(4, "Consent Gate, Ownership Gate & AI Evidence Extraction")
        llm_ready, llm_error = llm_service_available()
        if not llm_ready and not skip_llm:
            log_fail(
                "LLM provider is not configured, so the extraction pipeline cannot be "
                f"exercised: {llm_error} — set GEMINI_API_KEY, or re-run with --skip-llm "
                "to acknowledge that this environment has no model access."
            )

        if not llm_ready:
            log_skip(
                "Stage 4 (consent gate, ownership gate, AI extraction) — no LLM provider "
                "configured; the extraction dependency cannot even be constructed."
            )
        else:
            consent_payload = {
                "payload": {
                    "candidate_id": candidate_ext_id,
                    "source_type": "PDF_RESUME",
                    "raw_data": "Developed React dashboard with TypeScript.",
                    "consent_verified": False,
                },
                "requirement": {"id": req_ext_id, "description": requirement_text},
            }
            res = client.post(
                "/api/v1/extract", json=consent_payload, headers=auth_headers(candidate_token)
            )
            # 422 is the schema-level refusal (EvidencePayload.enforce_consent_gate);
            # 400 is the same refusal surfaced by the endpoint. A 500 would mean the
            # gate crashed instead of rejecting, which is not a pass.
            if res.status_code not in (400, 422):
                log_fail(
                    f"Consent Gate did not block an extraction without consent: HTTP {res.status_code}"
                )
            log_pass(f"Consent Gate rejected extraction without consent (HTTP {res.status_code})")

            foreign_payload = {
                "payload": {
                    "candidate_id": "cand_999999999",
                    "source_type": "PDF_RESUME",
                    "raw_data": "Evidence filed under somebody else's identity.",
                    "consent_verified": True,
                },
                "requirement": {"id": req_ext_id, "description": requirement_text},
            }
            res = client.post(
                "/api/v1/extract", json=foreign_payload, headers=auth_headers(candidate_token)
            )
            if res.status_code != 403:
                log_fail(
                    "Evidence can be filed under an identity the caller does not own: "
                    f"HTTP {res.status_code}"
                )
            log_pass("Ownership gate refused evidence filed under a foreign identity (HTTP 403)")

            if skip_llm:
                log_skip("AI extraction call — --skip-llm requested.")
            else:
                good_payload = {
                    "payload": {
                        "candidate_id": candidate_ext_id,
                        "source_type": "PDF_RESUME",
                        "raw_data": (
                            "Senior Engineer with 5 years of frontend development "
                            "experience in React and TypeScript."
                        ),
                        "consent_verified": True,
                    },
                    "requirement": {"id": req_ext_id, "description": requirement_text},
                }
                res = client.post(
                    "/api/v1/extract", json=good_payload, headers=auth_headers(candidate_token)
                )
                if res.status_code != 200:
                    log_fail(f"AI Extraction failed ({res.status_code}): {res.text}")
                result = res.json()
                log_pass(f"AI Extraction completed — status: [{result['status']}]")
                log_pass(f"AI Reasoning: '{result['reasoning'][:60]}...'")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 5: Job Posting Creation
        # ──────────────────────────────────────────────────────────────────────
        log_stage(5, "Job Posting Creation")
        res = client.post(
            "/api/v1/jobs/",
            json={
                "title": "Lead Frontend Architect",
                "description": "Building high-throughput React applications with evidence intelligence",
                # Deliberately different from the registered company: the posting
                # must publish under the entity whose tax number was verified.
                "company_name": "Sahte Sirket A.S.",
                "category": "TECHNOLOGY",
                "status": "active",
            },
            headers=auth_headers(employer_token),
        )
        if res.status_code not in (200, 201):
            log_fail(f"Job posting creation failed ({res.status_code}): {res.text}")
        job = res.json()
        job_id = job["id"]
        if job.get("company_name") != company_name:
            log_fail(
                "Posting was published under a caller-supplied company name instead of the "
                f"registered one: '{job.get('company_name')}'"
            )
        if job.get("category") != "TECHNOLOGY":
            log_fail(f"Posting category was dropped: {job.get('category')}")
        log_pass(f"Job posting created: '{job['title']}' (ID #{job_id}, category {job['category']})")
        log_pass(f"Posting published under the registered company: '{job['company_name']}'")

        res = client.post(
            "/api/v1/jobs/",
            json={"title": "Yetkisiz Ilan", "description": "Candidates may not publish postings"},
            headers=auth_headers(candidate_token),
        )
        if res.status_code != 403:
            log_fail(f"A candidate account was able to publish a job posting: HTTP {res.status_code}")
        log_pass("Candidate account refused job posting creation (HTTP 403)")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 6: Application Submission & Decision
        # ──────────────────────────────────────────────────────────────────────
        log_stage(6, "Job Application & Employer Decision")
        res = client.post(
            "/api/v1/applications/",
            json={"candidate_id": candidate_db_id, "job_id": job_id, "status": "submitted"},
            headers=auth_headers(candidate_token),
        )
        if res.status_code not in (200, 201):
            log_fail(f"Job application submission failed ({res.status_code}): {res.text}")
        application = res.json()
        app_id = application["id"]
        log_pass(f"Application submitted by the candidate: #{app_id} (status: {application['status']})")

        res = client.patch(
            f"/api/v1/applications/{app_id}",
            json={"status": "accepted"},
            headers=auth_headers(candidate_token),
        )
        if res.status_code != 403:
            log_fail(f"A candidate was able to decide their own application: HTTP {res.status_code}")
        log_pass("Candidate refused the accept/decline decision (HTTP 403)")

        res = client.patch(
            f"/api/v1/applications/{app_id}",
            json={"status": "accepted"},
            headers=auth_headers(employer_token),
        )
        if res.status_code != 200:
            log_fail(f"Employer decision failed ({res.status_code}): {res.text}")
        log_pass(f"Application decided by the posting owner: [{res.json()['status'].upper()}]")

        # ──────────────────────────────────────────────────────────────────────
        # Stage 7: Evidence Audit & Need-to-Know Boundary
        # ──────────────────────────────────────────────────────────────────────
        log_stage(7, "Evidence Audit & Need-to-Know Boundary")
        res = client.get(
            f"/api/v1/candidates/{candidate_ext_id}/evidences",
            headers=auth_headers(candidate_token),
        )
        if res.status_code != 200:
            log_fail(f"Candidate cannot read their own evidence trail ({res.status_code}): {res.text}")
        own_evidences = res.json()
        log_pass(f"Candidate reads {len(own_evidences)} own evidence record(s)")
        for ev in own_evidences:
            log_pass(f"  * {ev['requirement_external_id']} | {ev['status']} | review: {ev['review_status']}")

        # The employer may read this candidate only because the candidate applied
        # to their posting in stage 6 — that is the need-to-know boundary.
        res = client.get(
            f"/api/v1/candidates/{candidate_ext_id}/evidences",
            headers=auth_headers(employer_token),
        )
        if res.status_code != 200:
            log_fail(f"Employer cannot read their applicant's evidence ({res.status_code}): {res.text}")
        log_pass(f"Employer of the applied posting reads {len(res.json())} approved record(s)")

        res = client.get(
            "/api/v1/candidates/cand_999999999/evidences", headers=auth_headers(employer_token)
        )
        if res.status_code != 404:
            log_fail(f"Unknown candidate lookup returned HTTP {res.status_code}, expected 404")
        log_pass("Unknown candidate lookup answers 404 without leaking data")

    print("\n==================================================")
    if SKIPPED:
        print(f" [PARTIAL] 7 STAGES COMPLETED — {len(SKIPPED)} CHECK(S) SKIPPED")
        for item in SKIPPED:
            print(f"   - {item}")
    else:
        print(" [SUCCESS] ALL 7 SMOKE TEST STAGES PASSED SUCCESSFULLY!")
    print("==================================================\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EIP End-to-End Smoke Test")
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        default=os.getenv("EIP_SMOKE_SKIP_LLM", "").lower() in ("1", "true", "yes"),
        help="Skip the checks that need a live model provider (no GEMINI_API_KEY here).",
    )
    args = parser.parse_args()
    try:
        run_smoke_test(skip_llm=args.skip_llm)
    except SystemExit:
        raise
    except Exception as exc:  # an unexpected crash is a failed smoke test, not a stack trace
        print(f"  [FAIL] Smoke test crashed: {type(exc).__name__}: {exc}")
        print("\n==================================================")
        print(" [FAILURE] SMOKE TEST ABORTED — LIFECYCLE IS BROKEN")
        print("==================================================\n")
        sys.exit(1)
