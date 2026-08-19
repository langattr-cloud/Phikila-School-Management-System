"""Reliable school access-request approval endpoint."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.email.service import email_service
from app.modules.scheduling.tenancy import TtMembership, TtSchool

from .authz import Identity, audit, require_super_admin
from .models import TtAccessRequest

router = APIRouter()
GRANTABLE_ROLES = {"viewer", "student", "teacher", "scheduler", "admin"}


class ApprovalDecision(BaseModel):
    approve: bool
    role: str | None = None
    school_id: int | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str | None) -> str | None:
        if value is not None and value not in GRANTABLE_ROLES:
            raise ValueError("That role cannot be granted.")
        return value


@router.post("/access-requests/{request_id}/decide")
def decide_access_request(
    request_id: int,
    payload: ApprovalDecision,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    row = db.query(TtAccessRequest).filter(TtAccessRequest.id == request_id).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown access request.")
    if row.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has already been decided.")

    if not payload.approve:
        try:
            row.status = "rejected"
            row.decided_by = identity.user_id
            row.decided_at = datetime.utcnow()
            row.decision_note = payload.note
            audit(db, identity, "access_request_rejected", f"Rejected access request from {row.email}", entity="access_request", entity_id=row.id)
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not record the rejection: {exc}") from exc
        return {"status": "rejected"}

    school_id = payload.school_id or row.requested_school_id
    if not school_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a school to grant access to.")

    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The selected school does not exist.")
    if (getattr(school, "status", None) or "active") != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, f"{school.name} is inactive. Activate the school before granting access, or choose an active school.")

    granted = payload.role or row.requested_role or "viewer"
    if granted not in GRANTABLE_ROLES:
        granted = "viewer"

    # tt_memberships.user_id is varchar in the live database; access requests use UUID.
    membership_user_id = str(row.user_id)
    try:
        membership = (
            db.query(TtMembership)
            .filter(TtMembership.user_id == membership_user_id, TtMembership.school_id == school_id)
            .first()
        )
        if membership is None:
            membership = TtMembership(
                user_id=membership_user_id,
                school_id=school_id,
                role=granted,
                email=row.email,
                is_active=True,
            )
            db.add(membership)
        else:
            membership.role = granted
            membership.email = row.email or membership.email
            membership.is_active = True

        row.status = "approved"
        row.granted_role = granted
        row.granted_school_id = school_id
        row.decided_by = identity.user_id
        row.decided_at = datetime.utcnow()
        row.decision_note = payload.note
        audit(db, identity, "access_request_approved", f"Approved {row.email} as {granted} at {school.name}", entity="access_request", entity_id=row.id, school_id=school_id)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not record the approval: {exc}") from exc

    if row.email:
        try:
            email_service.send_access_request_approved_email(to=row.email, school_name=school.name, role=granted)
        except Exception:
            pass

    return {"status": "approved", "role": granted, "school_id": school_id}
