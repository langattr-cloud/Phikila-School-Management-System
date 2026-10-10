"""Platform-admin endpoints for school module entitlements."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.scheduling.tenancy import TtSchool
from .authz import Identity, audit, require_super_admin
from .entitlements import DEFAULT_ENABLED_MODULES, MODULES, TtSchoolModuleEntitlement

router = APIRouter()


class ModuleSelection(BaseModel):
    enabled_modules: list[str] = Field(max_length=len(MODULES))


def _rows(db: Session, school_id: int) -> dict[str, TtSchoolModuleEntitlement]:
    return {
        row.module_key: row
        for row in db.query(TtSchoolModuleEntitlement)
        .filter(TtSchoolModuleEntitlement.school_id == school_id)
        .all()
    }


def _payload(school: TtSchool, rows: dict[str, TtSchoolModuleEntitlement]) -> dict:
    return {
        "school_id": school.id,
        "school_name": school.name,
        "modules": [
            {
                "key": key,
                "label": details["label"],
                "description": details["description"],
                "enabled": rows[key].enabled if key in rows else key in DEFAULT_ENABLED_MODULES,
            }
            for key, details in MODULES.items()
        ],
    }


@router.get("/schools/{school_id}/modules")
def get_school_modules(
    school_id: int,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown school.")
    return _payload(school, _rows(db, school_id))


@router.put("/schools/{school_id}/modules")
def set_school_modules(
    school_id: int,
    payload: ModuleSelection,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown school.")

    requested = set(payload.enabled_modules)
    unknown = requested - set(MODULES)
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {"message": "Unknown module key(s).", "modules": sorted(unknown)},
        )

    rows = _rows(db, school_id)
    for key in MODULES:
        row = rows.get(key)
        if row is None:
            row = TtSchoolModuleEntitlement(
                school_id=school_id, module_key=key, enabled=key in requested,
                updated_by=identity.email or identity.user_id,
            )
            db.add(row)
        else:
            row.enabled = key in requested
            row.updated_by = identity.email or identity.user_id

    audit(
        db, identity, "school_modules_updated",
        f"Updated module access for {school.name}: {len(requested)} enabled",
        entity="school_module_entitlement", entity_id=school_id, school_id=school_id,
    )
    db.commit()
    return _payload(school, _rows(db, school_id))
