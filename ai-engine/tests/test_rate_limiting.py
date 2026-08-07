"""
EIF: Rate Limiting Tests
---
Regression guard: the app declared Limiter(default_limits=["60/minute"]) and
wired app.state.limiter plus the RateLimitExceeded handler, but slowapi only
enforces default limits through SlowAPIMiddleware — which was never added.
Every endpoint without an explicit @limiter.limit decorator (login, register,
moderation, DELETE /auth/me, ...) therefore had no rate limiting at all.
"""

from slowapi.middleware import SlowAPIMiddleware

from src.main import app, limiter


def test_slowapi_middleware_is_registered():
    assert any(m.cls is SlowAPIMiddleware for m in app.user_middleware), (
        "default_limits are dead config unless SlowAPIMiddleware is registered"
    )
    assert limiter.enabled


def test_default_limit_enforced_on_undecorated_endpoint(unauthenticated_client):
    """
    /health carries no explicit limit, so only the 60/minute default protects
    it. 121 requests guarantee that one fixed window holds more than 60 even
    if a minute boundary falls mid-test.
    """
    limiter.reset()
    try:
        statuses = [
            unauthenticated_client.get("/health").status_code for _ in range(121)
        ]
        assert statuses[0] == 200, "the first request must pass"
        assert 429 in statuses, "hammering an undecorated endpoint must hit 429"
    finally:
        # Leave no shared counters behind for the rest of the suite.
        limiter.reset()


def test_buckets_are_per_forwarded_client_not_per_socket_peer(unauthenticated_client):
    """
    Every request reaches the engine through the single Next.js server-side
    proxy, so the socket peer is the same address for every user. Keyed on it,
    the whole platform shared one bucket per endpoint: a handful of concurrent
    users 429'd everyone else, sign-in included. The bucket must follow the
    forwarded client address — the same one the consent log records.
    """
    limiter.reset()
    try:
        statuses = [
            unauthenticated_client.get(
                "/health", headers={"X-Forwarded-For": "203.0.113.10"}
            ).status_code
            for _ in range(121)
        ]
        assert 429 in statuses, "one client's hammering must exhaust its own bucket"
        resp = unauthenticated_client.get(
            "/health", headers={"X-Forwarded-For": "198.51.100.9"}
        )
        assert resp.status_code == 200, (
            "an unrelated client must have its own untouched bucket"
        )
    finally:
        limiter.reset()


def test_spoofed_leftmost_forwarded_entry_does_not_mint_fresh_buckets(unauthenticated_client):
    """
    A conforming ingress APPENDS the real client address to X-Forwarded-For,
    so only the right-most entry is trustworthy. Keying on the left-most one
    would let an attacker rotate a fake first entry and dodge the limiter
    entirely with an unlimited supply of fresh buckets.
    """
    limiter.reset()
    try:
        statuses = [
            unauthenticated_client.get(
                "/health",
                # Rotating attacker-chosen first entry, fixed ingress-written
                # last entry: all of these are the SAME client.
                headers={"X-Forwarded-For": f"10.0.0.{i % 16}, 203.0.113.11"},
            ).status_code
            for i in range(121)
        ]
        assert 429 in statuses, (
            "rotating the forgeable entry must not evade the client's bucket"
        )
    finally:
        limiter.reset()
