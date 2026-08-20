"""Multi-tenant access control.

``school_id`` is never accepted from the client. It is resolved from a
membership row keyed by the verified Supabase user id, so a caller cannot read
or write another school's data by editing a request. This mirrors — and is
enforced independently of — the PostgreSQL RLS policies in docs/rls.sql.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy import Boolean, Column, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Session

from app.core.database import Base, get_db
from app.modules.authentication.supabase import get_supabase_claims

ROLE_ORDER = ["viewer", "student", "teacher", "scheduler", "admin", "super_admin"]


class TtSchool(Base):
    __tablename__ = "tt_schools"

    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    slug = Column(String(80), unique=True, index=True)
    timezone = Column(String(60), default="Africa/Nairobi")
    academic_year = Column(String(40))
    status = Column(String(20), default="active", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class TtMembership(Base):
    __tablename__ = "tt_memberships"
    __table_args__ = (UniqueConstraint("user_id", "school_id", name="uq_tt_membership"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    role = Column(String(20), default="viewer", nullable=False)
    email = Column(String(160))
    teacher_id = Column(Integer)
    class_id = Column(Integer)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


@dataclass
class Principal:
    user_id: str
    email: str | None
    school_id: int
    role: str
    teacher_id: int | None = None
    class_id: int | None = None

    def at_least(self, role: str) -> bool:
        try:
            return ROLE_ORDER.index(self.role) >= ROLE_ORDER.index(role)
        except ValueError:
            return False


def resolve_principal(
    claims: dict[str, Any] = Depends(get_supabase_claims),
    db: Session = Depends(get_db),
) -> Principal:
    """Resolve the caller's tenant and role from trusted auth/database state."""
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token.")

    email = claims.get("email")
    membership = (
        db.query(TtMembership)
        .filter(TtMembership.user_id == user_id, TtMembership.is_active.is_(True))
        .order_by(TtMembership.id)
        .first()
    )

    if membership is None:
        has_any = db.query(TtMembership.id).first() is not None
        if has_any:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Your account is not linked to a school yet. Ask an administrator for access.",
            )
        school = TtSchool(name="My School", slug="my-school")
        db.add(school)
        db.flush()
        membership = TtMembership(user_id=user_id, school_id=school.id, role="admin", email=email)
        db.add(membership)
        db.commit()
        db.refresh(membership)

    # Platform super-admin status is stored in tt_platform_admins, while the
    # school module uses this Principal. Keep those two authorization models in
    # sync so a platform super-admin is not accidentally downgraded to the
    # ordinary membership role for school-module writes.
    from app.modules.platform.models import TtPlatformAdmin

    is_platform_super_admin = (
        db.query(TtPlatformAdmin.id)
        .filter(
            TtPlatformAdmin.user_id == user_id,
            TtPlatformAdmin.is_active.is_(True),
        )
        .first()
        is not None
    )
    effective_role = "super_admin" if is_platform_super_admin else membership.role

    return Principal(
        user_id=user_id,
        email=email or membership.email,
        school_id=membership.school_id,
        role=effective_role,
        teacher_id=membership.teacher_id,
        class_id=membership.class_id,
    )


def require_role(*roles: str) -> Callable[[Principal], Principal]:
    minimum = min(roles, key=lambda role: ROLE_ORDER.index(role))

    def dependency(principal: Principal = Depends(resolve_principal)) -> Principal:
        if not principal.at_least(minimum):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to make this change.")
        return principal

    return dependency
