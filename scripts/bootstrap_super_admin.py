#!/usr/bin/env python3
"""Promote an existing, already-signed-in account to platform super admin.

This is the ONLY way the first super admin comes into existence. It is a
server-side operation run by someone with shell/database access — there is no
API route, no signup option, and no self-service path that can create one.

The account must have signed in at least once so a Supabase user id exists to
bind to. No password is read, written or stored by this script.

Usage:

    # Show who currently holds platform access
    python scripts/bootstrap_super_admin.py --list

    # Promote by email (the account must have signed in at least once)
    python scripts/bootstrap_super_admin.py --email admin@css.com

    # Promote by Supabase user id, taken from the Supabase dashboard
    python scripts/bootstrap_super_admin.py --user-id 0e2c... --email admin@css.com

DATABASE_URL must point at the target database.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.modules.platform.models import (  # noqa: E402
    TtAccessRequest,
    TtPlatformAdmin,
    TtPlatformAudit,
)
from app.modules.scheduling.tenancy import TtMembership  # noqa: E402


def find_user_id(db, email: str) -> str | None:
    """Locate a Supabase user id for an email from trusted server-side rows."""
    lowered = email.lower()
    membership = (
        db.query(TtMembership).filter(func.lower(TtMembership.email) == lowered).first()
    )
    if membership:
        return membership.user_id
    request = (
        db.query(TtAccessRequest)
        .filter(func.lower(TtAccessRequest.email) == lowered)
        .first()
    )
    if request:
        return request.user_id
    admin = (
        db.query(TtPlatformAdmin).filter(func.lower(TtPlatformAdmin.email) == lowered).first()
    )
    return admin.user_id if admin else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="Email of the account to promote")
    parser.add_argument("--user-id", help="Supabase auth user id (sub claim)")
    parser.add_argument("--list", action="store_true", help="List platform admins")
    parser.add_argument("--revoke", action="store_true", help="Revoke instead of grant")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.list:
            rows = (
                db.query(TtPlatformAdmin)
                .filter(TtPlatformAdmin.is_active.is_(True))
                .all()
            )
            if not rows:
                print("No platform administrators are configured.")
                return 0
            print(f"{len(rows)} platform administrator(s):")
            for row in rows:
                print(f"  {row.email or '(no email)'}  user_id={row.user_id}")
            return 0

        if not args.email and not args.user_id:
            parser.error("Provide --email or --user-id (or use --list).")

        user_id = args.user_id
        if not user_id:
            user_id = find_user_id(db, args.email)
            if not user_id:
                print(
                    f"No record of '{args.email}' was found.\n\n"
                    "The account must sign in to the application at least once "
                    "first, so that its Supabase user id is known. Alternatively "
                    "pass --user-id with the id from the Supabase dashboard "
                    "(Authentication > Users).",
                    file=sys.stderr,
                )
                return 1

        existing = (
            db.query(TtPlatformAdmin)
            .filter(TtPlatformAdmin.user_id == user_id)
            .first()
        )

        if args.revoke:
            if existing is None or not existing.is_active:
                print("That account is not a platform administrator.")
                return 1
            remaining = (
                db.query(TtPlatformAdmin)
                .filter(
                    TtPlatformAdmin.is_active.is_(True),
                    TtPlatformAdmin.user_id != user_id,
                )
                .count()
            )
            if remaining == 0:
                print(
                    "Refusing to revoke the only platform administrator. Grant "
                    "access to another account first.",
                    file=sys.stderr,
                )
                return 1
            existing.is_active = False
            db.add(
                TtPlatformAudit(
                    actor="bootstrap-script",
                    action="platform_admin_revoked",
                    entity="platform_admin",
                    entity_id=user_id,
                    summary=f"Revoked platform access from {existing.email or user_id}",
                )
            )
            db.commit()
            print(f"Revoked platform administrator access from {existing.email or user_id}.")
            return 0

        if existing is not None:
            if existing.is_active:
                print(f"{existing.email or user_id} is already a platform administrator.")
                return 0
            existing.is_active = True
            if args.email:
                existing.email = args.email.lower()
        else:
            db.add(
                TtPlatformAdmin(
                    user_id=user_id,
                    email=(args.email or "").lower() or None,
                    granted_by="bootstrap",
                )
            )

        db.add(
            TtPlatformAudit(
                actor="bootstrap-script",
                action="platform_admin_granted",
                entity="platform_admin",
                entity_id=user_id,
                summary=f"Granted platform access to {args.email or user_id} via bootstrap",
            )
        )
        db.commit()
        print(f"{args.email or user_id} is now a platform super administrator.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
