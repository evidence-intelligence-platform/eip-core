"""
EIF: Admin Bootstrap CLI Tool
---
Version: 1.0.0
Owner: EIF Architecture Team
---
Promotes an existing UserAccount to the "admin" role.

/auth/register deliberately refuses role="admin" (the endpoint is public), so
the only legitimate way to mint an administrator is this out-of-band script,
run by someone with shell access to the server.

Usage:
  venv\\Scripts\\python.exe scripts/promote_admin.py user@example.com

The account must already exist (register it normally first).
"""

import os
import sys

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), "..")))

from sqlmodel import Session, select

from src.db.database import engine
from src.db.models import UserAccount
from src.services.audit import record_audit


def promote(email: str) -> None:
    with Session(engine) as session:
        user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
        if not user:
            print(f"[ERROR] No account found for '{email}'. Register it first via /auth/register.")
            sys.exit(1)

        if user.role == "admin":
            print(f"[OK] '{email}' is already an admin. Nothing to do.")
            return

        previous_role = user.role
        user.role = "admin"
        session.add(user)
        # Minting an administrator is the most security-sensitive write in the
        # system; the audit row commits atomically with the promotion. There is
        # no JWT here — the actor is whoever holds shell access to the server.
        record_audit(
            session,
            actor_id="cli:promote_admin",
            action="user.promote_admin",
            target_entity=f"useraccount:{user.id}",
            details=f"role: {previous_role} -> admin",
        )
        session.commit()
        print(f"[SUCCESS] '{email}' promoted: {previous_role} -> admin.")
        print("[NOTE] Takes effect immediately: every request reads the role from this row.")


def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/promote_admin.py <email>")
        sys.exit(1)
    promote(sys.argv[1])


if __name__ == "__main__":
    main()
