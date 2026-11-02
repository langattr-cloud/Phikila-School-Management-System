"""Finance workspace authorization.

The selected school is resolved from a request header, but that header is only
a selector: authority is always re-derived from the verified identity and DB.
"""
from __future__ import annotations

from typing import Callable

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.platform.authz import Identity, resolve_identity
from app.modules.platform.entitlements import TtSchoolModuleEntitlement
from app.modules.platform.module_access import module_enabled
from app.modules.platform.tenancy import Principal, ROLE_ORDER, TtMembership, TtSchool


def resolve_finance_principal(
    identity: Identity = Depends(resolve_identity),
    db: Session = Depends(get_db),
    school_header: str | None = Header(default=None, alias="X-School-Id"),
) -> Principal:
    if not school_header:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select a school using X-School-Id.")
    try:
        school_id = int(school_header)
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid X-School-Id header.")
    if school_id <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid X-School-Id header.")

    school = db.query(TtSchool).filter(
        TtSchool.id == school_id,
        TtSchool.status == "active",
    ).first()
    if school is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This school is not active on the platform.")

    if identity.is_super_admin:
        # Active platform-admin status is authoritative; membership is not required.
        role = "super_admin"
        membership = None
    else:
        membership = db.query(TtMembership).filter(
            TtMembership.user_id == identity.user_id,
            TtMembership.school_id == school_id,
            TtMembership.is_active.is_(True),
        ).first()
        if membership is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to the selected school.")
        role = str(membership.role or "").lower()
        if not module_enabled(db, school_id, "finance"):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "module_not_enabled",
                    "module": "finance",
                    "message": "Finance is not enabled for the selected school. Contact your platform administrator.",
                },
            )

    return Principal(
        user_id=identity.user_id,
        email=identity.email or (membership.email if membership else None),
        school_id=school_id,
        role=role,
        teacher_id=membership.teacher_id if membership else None,
        class_id=membership.class_id if membership else None,
    )


def require_finance_role(*roles: str) -> Callable:
    if not roles:
        roles = ("viewer",)
    try:
        minimum = min(roles, key=lambda role: ROLE_ORDER.index(role))
    except ValueError as exc:
        raise ValueError(f"Unknown Finance role in {roles!r}") from exc

    def dependency(principal: Principal = Depends(resolve_finance_principal)) -> Principal:
        if principal.role != "super_admin" and not principal.at_least(minimum):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You do not have permission to perform this Finance action.",
            )
        return principal

    return dependency
