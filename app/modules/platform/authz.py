"""Platform and tenant authorization dependencies.

Design rules enforced here:

* Nothing about identity or authority is ever read from the request body,
  query string or headers other than the verified Supabase bearer token.
* Super-admin status is the presence of an active ``tt_platform_admins`` row.
  It cannot be represented in a JWT claim, a school membership, or any field a
  client can influence.
* School access is derived from ``tt_memberships``. A ``school_id`` supplied by
  the browser is only ever *checked against* that membership, never trusted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.scheduling.tenancy import ROLE_ORDER, TtMembership

from .models import TtPlatformAdmin, TtPlatformAudit


@dataclass
class Identity:
    """Everything the server knows about the caller, from trusted sources only."""

    user_id: str
    email: str | None
    is_super_admin: bool
    # school_id -> role, from membership rows.
    memberships: dict[int, str] = field(default_factory=dict)

    @property
    def school_ids(self) -> list[int]:
        return sorted(self.memberships)

    @property
    def primary_school_id(self) -> int | None:
        ids = self.school_ids
        return ids[0] if ids else None

    def role_in(self, school_id: int) -> str | None:
        return self.memberships.get(school_id)

    def can_access_school(self, school_id: int) -> bool:
        """Super admins reach every school; everyone else only their own."""
        return self.is_super_admin or school_id in self.memberships

    def has_school_role(self, school_id: int, minimum: str) -> bool:
        if self.is_super_admin:
            return True
        role = self.memberships.get(school_id)
        if role is None:
            return False
        try:
            return ROLE_ORDER.index(role) >= ROLE_ORDER.index(minimum)
        except ValueError:
            return False


def resolve_identity(
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
) -> Identity:
    """Build the caller's identity from the verified token plus database state."""
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token.")

    admin_row = (
        db.query(TtPlatformAdmin)
        .filter(
            TtPlatformAdmin.user_id == user_id,
            TtPlatformAdmin.is_active.is_(True),
        )
        .first()
    )

    memberships = {
        row.school_id: row.role
        for row in db.query(TtMembership).filter(
            TtMembership.user_id == user_id,
            TtMembership.is_active.is_(True),
        )
    }

    return Identity(
        user_id=user_id,
        email=claims.get("email"),
        is_super_admin=admin_row is not None,
        memberships=memberships,
    )


def require_super_admin(identity: Identity = Depends(resolve_identity)) -> Identity:
    """Gate for every platform-wide endpoint."""
    if not identity.is_super_admin:
        # 404-style vagueness is unhelpful here; the caller is authenticated and
        # simply lacks authority. Say so without revealing platform structure.
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This action requires platform administrator access.",
        )
    return identity


def require_active_access(identity: Identity = Depends(resolve_identity)) -> Identity:
    """Any user who has actually been granted access to something.

    A freshly signed-up account has no membership and is not a platform admin,
    so it lands here with a clear "awaiting approval" message rather than an
    opaque error.
    """
    if identity.is_super_admin or identity.memberships:
        return identity
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        "Your account is awaiting administrator approval.",
    )


def require_school_access(minimum: str = "viewer") -> Callable[..., Callable[[int], int]]:
    """Factory returning a dependency that validates a path ``school_id``.

    Usage::

        @router.get("/schools/{school_id}/users")
        def read(school_id: int, _=Depends(require_school_access("admin"))):

    The returned dependency raises before the handler body runs, so a handler
    can never accidentally serve another tenant's rows.
    """

    def dependency(
        school_id: int,
        identity: Identity = Depends(resolve_identity),
    ) -> Identity:
        if not identity.can_access_school(school_id):
            # Do not disclose whether the school exists.
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You do not have access to this school.",
            )
        if not identity.has_school_role(school_id, minimum):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You do not have permission to perform this action for this school.",
            )
        return identity

    return dependency


def audit(
    db: Session,
    identity: Identity,
    action: str,
    summary: str,
    entity: str | None = None,
    entity_id: str | int | None = None,
    school_id: int | None = None,
) -> None:
    """Record a platform action. Never called with credential material."""
    db.add(
        TtPlatformAudit(
            actor=identity.email or identity.user_id,
            actor_id=identity.user_id,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            school_id=school_id,
            summary=summary,
        )
    )
