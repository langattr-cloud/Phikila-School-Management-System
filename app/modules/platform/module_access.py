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
from app.modules.scheduling.tenancy import resolve_principal
from .entitlements import MODULES, TtSchoolModuleEntitlement


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
    return bool(row and row.enabled)


def require_school_module(module: str) -> Callable:
    """FastAPI dependency for routers whose school scope comes from membership."""
    if module not in MODULES:
        raise ValueError(f"Unknown school module: {module}")

    def dependency(principal=Depends(resolve_principal), db: Session = Depends(get_db)):
        if not module_enabled(db, principal.school_id, module):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "module_not_enabled", "module": module,
                        "message": "This module is not enabled for your school. Contact your platform administrator."},
            )
        return principal

    return dependency
