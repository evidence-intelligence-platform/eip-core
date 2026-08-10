"""
EIF: Shared rate limiter.
---
The limiter lives here (not in main.py) so routers can decorate their own
endpoints with @limiter.limit without importing main.py — which would be a
circular import, since main.py imports the routers.

Keying: every browser request reaches the engine through the Next.js
server-side proxy, so request.client.host is the proxy's address for every
user. We key on the forwarded client address instead, exactly as the consent
log records it.
"""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request: Request) -> str | None:
    """
    The address the caller connected from.

    A conforming ingress APPENDS the address it saw to the RIGHT of whatever
    the client already sent, so the right-most entry is the only one the
    caller cannot forge. The left-most is attacker-supplied end to end and
    must never be trusted — recording or keying on it would let a candidate
    write an arbitrary address into the consent record, or dodge a rate limit
    by rotating a spoofed header.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        candidate = forwarded.rsplit(",", 1)[-1].strip()
        if candidate:
            return candidate
    real_ip = request.headers.get("x-real-ip")
    if real_ip and real_ip.strip():
        return real_ip.strip()
    return request.client.host if request.client else None


def _rate_limit_key(request: Request) -> str:
    """
    One rate-limit bucket per end user, not per socket peer.

    get_remote_address keys on request.client.host, which is the proxy's
    address for every browser request — the whole user base would share a
    single bucket per endpoint. Key on the forwarded client address instead.
    """
    return client_ip(request) or get_remote_address(request)


# 60 requests/minute per end-user address by default; endpoints tighten this
# with their own @limiter.limit decorators.
limiter = Limiter(key_func=_rate_limit_key, default_limits=["60/minute"])
