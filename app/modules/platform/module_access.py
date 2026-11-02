"""School module entitlement checks shared by API routers.

Entitlements are stored per school and evaluated from the verified caller's
active membership. Platform administrators manage entitlements through the
platform router; they do not bypass a school's module flag on school APIs.
"""
from __future__ import annotations

from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.platform.authz import Identity, resolve_identity
from .entitlements import DEFAULT_ENABLED_MODULES, MODULES, TtSchoolModuleEntitlement


def module_enabled(db: Session, school_id: int, module: str) -> bool:
    if module not in MODULES:
        return False
    row = (
        db.query(TtSchoolModuleEntitlement)
        .filter(
            TtSchoolModuleEntitlement.school_id == school_id,
            TtSchoolModuleEntitlement.module_key == module,
        )
        .first()
    )
    if row is not None:
        return bool(row.enabled)
    # Newly created schools have no rows until the first admin save; match the
    # requested starter set in that case. Once any rows exist, missing keys deny.
    configured = db.query(TtSchoolModuleEntitlement.id).filter(
        TtSchoolModuleEntitlement.school_id == school_id
    ).first()
    return configured is None and module in DEFAULT_ENABLED_MODULES


def require_school_module(module: str) -> Callable:
    """FastAPI dependency for routers whose school scope comes from membership."""
    if module not in MODULES:
        raise ValueError(f"Unknown school module: {module}")

    def dependency(
        identity: Identity = Depends(resolve_identity),
        db: Session = Depends(get_db),
    ):
        # Platform administrators retain access to every active module and do
        # not need a school membership or a school entitlement to enter it.
        if identity.is_super_admin:
            return identity
        school_id = identity.primary_school_id
        if school_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account is not linked to an active school.")
        if not module_enabled(db, school_id, module):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "module_not_enabled", "module": module,
                        "message": "This module is not enabled for your school. Contact your platform administrator."},
            )
        return principal

    return dependency
