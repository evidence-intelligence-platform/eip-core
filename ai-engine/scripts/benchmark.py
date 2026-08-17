"""
EIF API Performance & Latency Benchmark CLI Tool
---
Version: 2.0.0
Owner: EIF Architecture Team
---
Measures Min, Max, Average and P95 latency (in milliseconds) for the public
health endpoint, PBKDF2 login, the database ORM read path and the AI extraction
pipeline.

A number is only printed when it was actually measured. Every request that did
not return the expected status is counted as an error, an endpoint that
produced no successful sample is reported as FAILED, and the process exits
non-zero — a benchmark that measured nothing is a failed benchmark, not a fast
one.

Usage:
  python scripts/benchmark.py
  python scripts/benchmark.py --iterations 100
  python scripts/benchmark.py --skip-llm    # environment without GEMINI_API_KEY
"""

import argparse
import math
import os
import statistics
import sys
import time
import uuid
from collections.abc import Callable
from typing import Any

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), "..")))

# Set before importing the app: load_dotenv() never overrides an existing
# variable, so this pins the same key on both sides of the call.
API_KEY = os.getenv("INTERNAL_API_KEY", "eif-test-internal-api-key")
os.environ["INTERNAL_API_KEY"] = API_KEY
KEY_HEADERS = {"X-Internal-API-Key": API_KEY}

from fastapi.testclient import TestClient  # noqa: E402

from src.main import app  # noqa: E402

PASSWORD = "BenchmarkPass123!"

# The LLM round-trip dominates its own run and costs quota, so it is profiled
# with a smaller batch than the local endpoints.
MAX_LLM_ITERATIONS = 10


def auth_headers(token: str) -> dict[str, str]:
    """Internal key plus the caller's identity — most routers require both."""
    return {**KEY_HEADERS, "Authorization": f"Bearer {token}"}


def calculate_metrics(latencies_ms: list[float]) -> dict[str, Any]:
    """Latency statistics. Never called with an empty sample — see measure()."""
    sorted_lat = sorted(latencies_ms)
    count = len(sorted_lat)
    # Nearest-rank percentile (ceil), not floor: on a 3-sample run the floor
    # variant returned the median and printed a P95 lower than the average.
    p95_index = min(count - 1, max(0, math.ceil(count * 0.95) - 1))

    return {
        "count": count,
        "min": round(min(sorted_lat), 2),
        "max": round(max(sorted_lat), 2),
        "avg": round(statistics.mean(sorted_lat), 2),
        "p95": round(sorted_lat[p95_index], 2),
        "total_time_s": round(sum(sorted_lat) / 1000.0, 3),
    }


def measure(
    request_fn: Callable[[], Any], iterations: int, expected_status: int = 200
) -> dict[str, Any]:
    """
    Times `iterations` calls and keeps only the ones that answered as expected.

    Errors are counted and their status codes reported rather than dropped: a
    run where every call returned 401 used to look identical to a run that was
    never executed, and both printed a latency table.
    """
    latencies: list[float] = []
    errors: dict[int, int] = {}
    last_error = ""

    for _ in range(iterations):
        t0 = time.perf_counter()
        res = request_fn()
        t1 = time.perf_counter()
        if res.status_code == expected_status:
            latencies.append((t1 - t0) * 1000.0)
        else:
            errors[res.status_code] = errors.get(res.status_code, 0) + 1
            last_error = res.text[:200]

    result: dict[str, Any] = {"errors": errors, "last_error": last_error}
    if latencies:
        result["metrics"] = calculate_metrics(latencies)
    return result


def print_table(results: dict[str, dict[str, Any]]):
    header = (
        f" {'ENDPOINT / COMPONENT':<35} | {'COUNT':<6} | {'AVG (ms)':<9} | "
        f"{'P95 (ms)':<9} | {'MIN (ms)':<9} | {'MAX (ms)':<9}"
    )
    print("\n" + "=" * len(header))
    print(header)
    print("=" * len(header))

    for name, result in results.items():
        metrics = result.get("metrics")
        if not metrics:
            reason = "SKIPPED" if result.get("skipped") else "NO MEASUREMENT"
            print(f" {name:<35} | {reason}")
            continue
        print(
            f" {name:<35} | {metrics['count']:<6} | {metrics['avg']:<9.2f} | "
            f"{metrics['p95']:<9.2f} | {metrics['min']:<9.2f} | {metrics['max']:<9.2f}"
        )

    print("=" * len(header) + "\n")


def run_benchmark(iterations: int = 30, skip_llm: bool = False) -> int:
    if iterations < 1:
        print("[ERROR] --iterations must be at least 1; nothing can be measured otherwise.")
        return 1

    print(f"[INIT] Starting EIP API Performance & Latency Benchmark ({iterations} iterations per endpoint)...\n")
    results: dict[str, dict[str, Any]] = {}

    with TestClient(app) as client:
        # The endpoints under test cap themselves at 10-15 requests/minute, so a
        # 30-iteration run would spend most of its samples measuring the rate
        # limiter's rejection path instead of the handler. This process is a
        # profiler, not a load test: measure the handler, and say so.
        from src.rate_limit import limiter

        limiter.enabled = False
        print("[NOTE] Rate limiter disabled in-process so latency reflects the handlers.\n")

        # ──────────────────────────────────────────────────────────────────────
        # Setup: an account whose identity the protected endpoints will accept
        # ──────────────────────────────────────────────────────────────────────
        run_id = uuid.uuid4().hex[:8]
        email = f"bench_{run_id}@example.com"
        res = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": PASSWORD,
                "role": "candidate",
                "full_name": "Benchmark Candidate",
            },
        )
        if res.status_code != 201:
            print(f"[ERROR] Benchmark setup failed: registration returned {res.status_code}: {res.text}")
            return 1
        token = res.json()["access_token"]

        # Registration mints the server-owned candidate identity; extraction is
        # refused for any other one, so the benchmark has to file evidence under
        # the account it just created.
        res = client.get("/api/v1/auth/me", headers=auth_headers(token))
        if res.status_code != 200 or not res.json().get("candidate_external_id"):
            print(f"[ERROR] Benchmark setup failed: profile lookup returned {res.status_code}: {res.text}")
            return 1
        candidate_ext_id = res.json()["candidate_external_id"]
        print(f"[SETUP] Benchmark identity ready: {email} ({candidate_ext_id})\n")

        # ──────────────────────────────────────────────────────────────────────
        # Benchmark 1: Public health endpoint
        # ──────────────────────────────────────────────────────────────────────
        print("[BENCHMARK 1/4] Profiling the public health endpoint (/health)...")
        results["Health Endpoint (/health)"] = measure(lambda: client.get("/health"), iterations)

        # ──────────────────────────────────────────────────────────────────────
        # Benchmark 2: Auth login & PBKDF2 password hashing overhead
        # ──────────────────────────────────────────────────────────────────────
        print("[BENCHMARK 2/4] Profiling PBKDF2 hashing & auth login (/api/v1/auth/login)...")
        results["Auth Login (PBKDF2 Hash)"] = measure(
            lambda: client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD}),
            iterations,
        )

        # ──────────────────────────────────────────────────────────────────────
        # Benchmark 3: Database ORM read path
        # ──────────────────────────────────────────────────────────────────────
        print("[BENCHMARK 3/4] Profiling database ORM query latency (/api/v1/jobs/)...")
        results["Database ORM Query (/jobs/)"] = measure(
            lambda: client.get("/api/v1/jobs/", headers=auth_headers(token)), iterations
        )

        # ──────────────────────────────────────────────────────────────────────
        # Benchmark 4: AI extraction pipeline
        # ──────────────────────────────────────────────────────────────────────
        llm_iterations = min(iterations, MAX_LLM_ITERATIONS)
        if skip_llm:
            print("[BENCHMARK 4/4] AI extraction pipeline SKIPPED (--skip-llm).")
            results["AI Extraction Pipeline"] = {"skipped": True, "errors": {}, "last_error": ""}
        else:
            print(f"[BENCHMARK 4/4] Profiling AI evidence extraction ({llm_iterations} calls)...")
            payload = {
                "payload": {
                    "candidate_id": candidate_ext_id,
                    "source_type": "PDF_RESUME",
                    "raw_data": "Developed React frontend and FastAPI backend with SQLModel ORM.",
                    "consent_verified": True,
                },
                "requirement": {
                    "id": f"req_bench_{run_id}",
                    "description": "React and FastAPI experience required",
                },
            }
            # Only HTTP 200 counts. Timing the 500 that a missing API key
            # produces measures how fast the engine fails, and reported it as
            # extraction throughput.
            results["AI Extraction Pipeline"] = measure(
                lambda: client.post("/api/v1/extract", json=payload, headers=auth_headers(token)),
                llm_iterations,
            )

    print_table(results)

    failed = {
        name: result
        for name, result in results.items()
        if not result.get("skipped") and (not result.get("metrics") or result["errors"])
    }
    skipped = [name for name, result in results.items() if result.get("skipped")]

    print("=" * 60)
    if failed:
        print(f" [FAILURE] {len(failed)} BENCHMARK(S) DID NOT PRODUCE A VALID MEASUREMENT:")
        for name, result in failed.items():
            errors = ", ".join(f"HTTP {code} x{count}" for code, count in result["errors"].items())
            print(f"   - {name}: {errors or 'no requests executed'}")
            if result["last_error"]:
                print(f"     last response: {result['last_error']}")
        print("=" * 60 + "\n")
        return 1

    if skipped:
        print(f" [PARTIAL] BENCHMARK COMPLETED — {len(skipped)} SKIPPED: {', '.join(skipped)}")
    else:
        print(" [SUCCESS] API benchmark completed — every endpoint measured.")
    print("=" * 60 + "\n")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EIP API Performance Benchmark")
    parser.add_argument("--iterations", type=int, default=30, help="Number of iterations per endpoint")
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        default=os.getenv("EIP_SMOKE_SKIP_LLM", "").lower() in ("1", "true", "yes"),
        help="Skip the AI extraction benchmark (no model provider in this environment).",
    )
    args = parser.parse_args()
    try:
        sys.exit(run_benchmark(iterations=args.iterations, skip_llm=args.skip_llm))
    except SystemExit:
        raise
    except Exception as exc:  # a crashed benchmark never reports success
        print(f"\n[ERROR] Benchmark crashed: {type(exc).__name__}: {exc}")
        print("[FAILURE] API BENCHMARK COULD NOT COMPLETE\n")
        sys.exit(1)
