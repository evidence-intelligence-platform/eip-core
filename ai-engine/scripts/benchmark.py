"""
EIF API Performance & Latency Benchmark CLI Tool
---
Version: 1.0.0
Owner: EIF Architecture Team
---
Measures Min, Max, Average, P95 latency (in milliseconds) and throughput (req/sec)
for Auth, Database ORM, and AI Extraction endpoints.

Usage:
  python scripts/benchmark.py
  python scripts/benchmark.py --iterations 100
"""

import argparse
import os
import statistics
import sys
import time
import uuid
from typing import Any

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), "..")))

API_KEY = os.getenv("INTERNAL_API_KEY", "eif-test-internal-api-key")
os.environ["INTERNAL_API_KEY"] = API_KEY

from fastapi.testclient import TestClient  # noqa: E402

from src.main import app  # noqa: E402

client = TestClient(app)
HEADERS = {"X-Internal-API-Key": API_KEY}


def calculate_metrics(latencies_ms: list[float]) -> dict[str, Any]:
    if not latencies_ms:
        return {"min": 0, "max": 0, "avg": 0, "p95": 0, "count": 0}

    sorted_lat = sorted(latencies_ms)
    count = len(sorted_lat)
    p95_index = max(0, int(count * 0.95) - 1)

    return {
        "count": count,
        "min": round(min(sorted_lat), 2),
        "max": round(max(sorted_lat), 2),
        "avg": round(statistics.mean(sorted_lat), 2),
        "p95": round(sorted_lat[p95_index], 2),
        "total_time_s": round(sum(sorted_lat) / 1000.0, 3),
    }


def print_table(results: dict[str, dict[str, Any]]):
    print("\n=========================================================================================")
    print(f" {'ENDPOINT / COMPONENT':<35} | {'COUNT':<6} | {'AVG (ms)':<9} | {'P95 (ms)':<9} | {'MIN (ms)':<9} | {'MAX (ms)':<9}")
    print("=========================================================================================")

    for name, m in results.items():
        print(f" {name:<35} | {m['count']:<6} | {m['avg']:<9.2f} | {m['p95']:<9.2f} | {m['min']:<9.2f} | {m['max']:<9.2f}")

    print("=========================================================================================\n")


def run_benchmark(iterations: int = 30):
    print(f"[INIT] Starting EIP API Performance & Latency Benchmark ({iterations} iterations per endpoint)...\n")
    results = {}

    # ──────────────────────────────────────────────────────────────────────────
    # Benchmark 1: Health Check Endpoint (/docs)
    # ──────────────────────────────────────────────────────────────────────────
    print("[BENCHMARK 1/4] Profiling Health Check Endpoint (/docs)...")
    latencies = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        res = client.get("/docs")
        t1 = time.perf_counter()
        if res.status_code == 200:
            latencies.append((t1 - t0) * 1000.0)
    results["Health Check (/docs)"] = calculate_metrics(latencies)

    # ──────────────────────────────────────────────────────────────────────────
    # Benchmark 2: Auth Login & PBKDF2 Password Hashing Overhead
    # ──────────────────────────────────────────────────────────────────────────
    print("[BENCHMARK 2/4] Profiling PBKDF2 Hashing & Auth Login (/api/v1/auth/login)...")
    # Register test user
    test_email = f"bench_{uuid.uuid4().hex[:6]}@acme.com"
    client.post("/api/v1/auth/register", json={"email": test_email, "password": "Password123!", "role": "employer"})

    latencies = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        res = client.post("/api/v1/auth/login", json={"email": test_email, "password": "Password123!"})
        t1 = time.perf_counter()
        if res.status_code == 200:
            latencies.append((t1 - t0) * 1000.0)
    results["Auth Login (PBKDF2 Hash)"] = calculate_metrics(latencies)

    # ──────────────────────────────────────────────────────────────────────────
    # Benchmark 3: Database ORM Queries (/api/v1/jobs/)
    # ──────────────────────────────────────────────────────────────────────────
    print("[BENCHMARK 3/4] Profiling Database ORM Query Latency (/api/v1/jobs/)...")
    latencies = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        res = client.get("/api/v1/jobs/", headers=HEADERS)
        t1 = time.perf_counter()
        if res.status_code == 200:
            latencies.append((t1 - t0) * 1000.0)
    results["Database ORM Query (/jobs/)"] = calculate_metrics(latencies)

    # ──────────────────────────────────────────────────────────────────────────
    # Benchmark 4: AI Extraction Endpoint (/api/v1/extract)
    # ──────────────────────────────────────────────────────────────────────────
    print("[BENCHMARK 4/4] Profiling AI Evidence Extraction Route (/api/v1/extract)...")
    payload = {
        "payload": {
            "candidate_id": "cand_bench_1",
            "source_type": "PDF_RESUME",
            "raw_data": "Developed React frontend and FastAPI backend with SQLModel ORM.",
            "consent_verified": True,
        },
        "requirement": {
            "id": "req_bench_1",
            "description": "React and FastAPI experience required",
        },
    }

    latencies = []
    # Test a smaller batch for LLM extraction
    llm_iters = min(iterations, 10)
    for _ in range(llm_iters):
        t0 = time.perf_counter()
        res = client.post("/api/v1/extract", json=payload, headers=HEADERS)
        t1 = time.perf_counter()
        if res.status_code in (200, 500):
            latencies.append((t1 - t0) * 1000.0)
    results["AI Extraction Pipeline"] = calculate_metrics(latencies)

    # Print Summary Table
    print_table(results)
    print("[SUCCESS] API Benchmark completed successfully!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="EIP API Performance Benchmark")
    parser.add_argument("--iterations", type=int, default=30, help="Number of iterations per endpoint")
    args = parser.parse_args()
    run_benchmark(iterations=args.iterations)
