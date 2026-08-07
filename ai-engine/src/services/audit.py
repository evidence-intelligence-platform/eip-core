"""
EIF: Audit Trail & Consent Log Writers
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 08_SECURITY_ARCHITECTURE.md — every legally relevant action leaves
a record; 01_ENGINEERING_CONSTITUTION.md Article II — consent is evidence too.
---
The AuditTrail and ConsentLog tables existed since the first schema but
nothing ever wrote them, so the platform could not prove who decided what,
or that consent was actually captured. These helpers keep call sites to one
line and — deliberately — only session.add(): the caller commits, so the
audit/consent row lives or dies with the business write it describes.
"""

import hashlib

from sqlmodel import Session

from src.db.models import AuditTrail, ConsentLog


def record_audit(
    session: Session,
    actor_id: str,
    action: str,
    target_entity: str,
    details: str | None = None,
) -> AuditTrail:
    """
    Appends an AuditTrail row to the caller's session (no commit here).

    `actor_id` is normally the JWT `sub`; `created_at` defaults to UTC now via
    the model. The caller's commit makes the audit row transactional with the
    action it records — an audit entry for a write that never happened (or the
    reverse) would be worse than none.
    """
    entry = AuditTrail(
        actor_id=actor_id,
        action=action,
        target_entity=target_entity,
        details=details,
    )
    session.add(entry)
    return entry


def record_consent(
    session: Session,
    candidate_external_id: str,
    ip_address: str | None = None,
) -> ConsentLog:
    """
    Appends a ConsentLog row to the caller's session (no commit here).

    Called only after the consent gate has passed, so consent_granted is True
    by construction; `consent_timestamp` defaults to UTC now via the model.
    """
    entry = ConsentLog(
        candidate_external_id=candidate_external_id,
        consent_granted=True,
        ip_address=ip_address,
    )
    session.add(entry)
    return entry


def anonymize_identifier(identifier: str) -> str:
    """
    One-way pseudonym for an identifier that must not be stored in plaintext.

    Used when auditing account deletion: KVKK erasure would be undermined if
    the audit row itself preserved the deleted e-mail address. A SHA-256
    digest still lets an auditor confirm "this known address was deleted"
    without the trail disclosing it.
    """
    digest = hashlib.sha256(identifier.strip().lower().encode("utf-8")).hexdigest()
    return f"sha256:{digest}"
