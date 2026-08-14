"""Platform administration API (super admin only).

Tenant isolation rule applied throughout: a ``school_id`` in a path is always
checked against the caller's server-side memberships before any row is read.
Super admins are the single, explicit exception.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.scheduling.models import TtClass, TtTeacher
from app.modules.scheduling.tenancy import ROLE_ORDER, TtMembership, TtSchool

from .authz import (
    Identity,
    audit,
    require_active_access,
    require_super_admin,
    resolve_identity,
)
from .models import TtAccessRequest, TtPlatformAdmin, TtPlatformAudit

router = APIRouter()

# Roles a super admin may grant inside a school. "super_admin" is deliberately
# absent: platform authority is granted through its own dedicated endpoint.
GRANTABLE_ROLES = ["viewer", "student", "teacher", "scheduler", "admin"]
# Roles an applicant may ask for at signup.
REQUESTABLE_ROLES = ["teacher", "scheduler", "admin", "student", "viewer"]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class SchoolIn(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    slug: str = Field(min_length=2, max_length=80)
    timezone: str = Field(default="Africa/Nairobi", max_length=60)
    academic_year: str | None = Field(default=None, max_length=40)

    @field_validator("slug")
    @classmethod
    def clean_slug(cls, value: str) -> str:
        slug = value.strip().lower().replace(" ", "-")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug):
            raise ValueError("Use lowercase letters, numbers and hyphens only.")
        return slug

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class SchoolPatch(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=160)
    timezone: str | None = Field(default=None, max_length=60)
    academic_year: str | None = Field(default=None, max_length=40)


class AdministratorIn(BaseModel):
    email: EmailStr
    role: str = "admin"

    @field_validator("role")
    @classmethod
    def check_role(cls, value: str) -> str:
        if value not in GRANTABLE_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(GRANTABLE_ROLES)}")
        return value


class AccessRequestIn(BaseModel):
    """Submitted by a freshly signed-up user. Grants nothing by itself."""

    requested_role: str = "teacher"
    school_id: int | None = None
    school_name: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("requested_role")
    @classmethod
    def check_role(cls, value: str) -> str:
        if value not in REQUESTABLE_ROLES:
            raise ValueError("That role cannot be requested.")
        return value


class DecisionIn(BaseModel):
    approve: bool
    # What the super admin actually grants; may differ from the request.
    role: str | None = None
    school_id: int | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("role")
    @classmethod
    def check_role(cls, value: str | None) -> str | None:
        if value is not None and value not in GRANTABLE_ROLES:
            raise ValueError("That role cannot be granted.")
        return value


# ---------------------------------------------------------------------------
# Session bootstrap — used by the frontend to decide what to render
# ---------------------------------------------------------------------------
@router.get("/session")
def session(
    identity: Identity = Depends(resolve_identity),
    db: Session = Depends(get_db),
):
    """Safe description of the caller's authority.

    This is UX metadata only. Every endpoint re-checks authority server-side,
    so tampering with the response changes nothing.
    """
    request = (
        db.query(TtAccessRequest)
        .filter(TtAccessRequest.user_id == identity.user_id)
        .first()
    )
    schools = []
    if identity.memberships:
        rows = (
            db.query(TtSchool)
            .filter(TtSchool.id.in_(list(identity.memberships)))
            .all()
        )
        schools = [
            {"id": s.id, "name": s.name, "role": identity.memberships.get(s.id)}
            for s in rows
        ]

    return {
        "user_id": identity.user_id,
        "email": identity.email,
        "is_super_admin": identity.is_super_admin,
        "schools": schools,
        "has_access": bool(identity.is_super_admin or identity.memberships),
        "access_request": (
            {
                "status": request.status,
                "requested_role": request.requested_role,
                "requested_school_name": request.requested_school_name,
                "decision_note": request.decision_note,
            }
            if request
            else None
        ),
    }


# ---------------------------------------------------------------------------
# Access requests
# ---------------------------------------------------------------------------
@router.get("/access-requests/options")
def access_request_options(db: Session = Depends(get_db)):
    """Schools and roles an applicant may pick from.

    Deliberately unauthenticated: the signup form needs it before an account
    exists. It returns only school display names and the list of *requestable*
    roles, which excludes every privileged platform role. No school data,
    membership or count is exposed.
    """
    schools = db.query(TtSchool).order_by(TtSchool.name).all()
    return {
        "schools": [{"id": s.id, "name": s.name} for s in schools],
        "roles": REQUESTABLE_ROLES,
    }


@router.post("/access-requests", status_code=201)
def submit_access_request(
    payload: AccessRequestIn,
    identity: Identity = Depends(resolve_identity),
    db: Session = Depends(get_db),
):
    """Record what the new user is asking for. Never grants it."""
    if identity.is_super_admin or identity.memberships:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Your account already has access."
        )
    if not payload.school_id and not (payload.school_name or "").strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Choose your school, or enter its name if it is not listed.",
        )

    school_name = (payload.school_name or "").strip() or None
    if payload.school_id:
        school = db.query(TtSchool).filter(TtSchool.id == payload.school_id).first()
        if school is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown school.")
        school_name = school.name

    existing = (
        db.query(TtAccessRequest)
        .filter(TtAccessRequest.user_id == identity.user_id)
        .first()
    )
    if existing and existing.status == "pending":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Your request is already awaiting review."
        )

    row = existing or TtAccessRequest(user_id=identity.user_id)
    row.email = identity.email or ""
    row.requested_role = payload.requested_role
    row.requested_school_id = payload.school_id
    row.requested_school_name = school_name
    row.note = payload.note
    row.status = "pending"
    row.decided_by = None
    row.decided_at = None
    row.decision_note = None
    if existing is None:
        db.add(row)
    db.commit()
    return {"status": "pending"}


@router.get("/access-requests")
def list_access_requests(
    request_status: str = Query(default="pending", alias="status"),
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    query = db.query(TtAccessRequest)
    if request_status != "all":
        query = query.filter(TtAccessRequest.status == request_status)
    rows = query.order_by(TtAccessRequest.created_at.desc()).limit(200).all()
    return [
        {
            "id": r.id,
            "email": r.email,
            "full_name": r.full_name,
            "requested_role": r.requested_role,
            "requested_school_id": r.requested_school_id,
            "requested_school_name": r.requested_school_name,
            "note": r.note,
            "status": r.status,
            "created_at": r.created_at,
            "decided_at": r.decided_at,
            "decided_by": r.decided_by,
        }
        for r in rows
    ]


@router.post("/access-requests/{request_id}/decide")
def decide_access_request(
    request_id: int,
    payload: DecisionIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Approve or reject. The granted role is whatever the admin chooses."""
    row = db.query(TtAccessRequest).filter(TtAccessRequest.id == request_id).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown request.")
    if row.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This request was already decided.")

    row.decided_by = identity.email or identity.user_id
    row.decided_at = datetime.utcnow()
    row.decision_note = payload.note

    if not payload.approve:
        row.status = "rejected"
        audit(
            db, identity, "access_request_rejected",
            f"Rejected access request from {row.email}",
            entity="access_request", entity_id=row.id,
        )
        db.commit()
        return {"status": "rejected"}

    school_id = payload.school_id or row.requested_school_id
    if not school_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Choose which school to grant access to. The applicant named a "
            "school that does not exist yet — create it first.",
        )
    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown school.")

    # The granted role is the admin's decision; the request is only a hint.
    granted = payload.role or row.requested_role
    if granted not in GRANTABLE_ROLES:
        granted = "viewer"

    membership = (
        db.query(TtMembership)
        .filter(
            TtMembership.user_id == row.user_id,
            TtMembership.school_id == school_id,
        )
        .first()
    )
    if membership is None:
        membership = TtMembership(
            user_id=row.user_id,
            school_id=school_id,
            role=granted,
            email=row.email,
        )
        db.add(membership)
    else:
        membership.role = granted
        membership.is_active = True

    row.status = "approved"
    row.granted_role = granted
    row.granted_school_id = school_id

    audit(
        db, identity, "access_request_approved",
        f"Approved {row.email} as {granted} at {school.name}",
        entity="access_request", entity_id=row.id, school_id=school_id,
    )
    db.commit()
    return {"status": "approved", "role": granted, "school_id": school_id}


# ---------------------------------------------------------------------------
# Platform dashboard
# ---------------------------------------------------------------------------
@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Real counts only — every figure is a database aggregate."""
    schools = db.query(TtSchool).count()
    memberships = db.query(func.count(func.distinct(TtMembership.user_id))).scalar() or 0
    teachers = db.query(TtTeacher).count()
    classes = db.query(TtClass).count()
    pending = (
        db.query(TtAccessRequest)
        .filter(TtAccessRequest.status == "pending")
        .count()
    )
    admins = (
        db.query(TtPlatformAdmin).filter(TtPlatformAdmin.is_active.is_(True)).count()
    )
    recent = (
        db.query(TtPlatformAudit)
        .order_by(TtPlatformAudit.at.desc())
        .limit(8)
        .all()
    )
    return {
        "schools": schools,
        "users": int(memberships),
        "teachers": teachers,
        "classes": classes,
        "pending_requests": pending,
        "super_admins": admins,
        "recent": [
            {
                "at": r.at,
                "actor": r.actor,
                "action": r.action,
                "summary": r.summary,
            }
            for r in recent
        ],
    }


# ---------------------------------------------------------------------------
# Schools
# ---------------------------------------------------------------------------
def _school_summary(db: Session, school: TtSchool) -> dict[str, Any]:
    users = (
        db.query(TtMembership)
        .filter(TtMembership.school_id == school.id, TtMembership.is_active.is_(True))
        .count()
    )
    return {
        "id": school.id,
        "name": school.name,
        "slug": school.slug,
        "timezone": school.timezone,
        "academic_year": school.academic_year,
        "status": getattr(school, "status", None) or "active",
        "users": users,
        "teachers": db.query(TtTeacher).filter(TtTeacher.school_id == school.id).count(),
        "classes": db.query(TtClass).filter(TtClass.school_id == school.id).count(),
        "created_at": school.created_at,
    }


@router.get("/schools")
def list_schools(
    search: str | None = Query(default=None, max_length=120),
    school_status: str = Query(default="all", alias="status"),
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    query = db.query(TtSchool)
    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.filter(TtSchool.name.ilike(pattern))
    rows = query.order_by(TtSchool.name).all()
    summaries = [_school_summary(db, s) for s in rows]
    if school_status != "all":
        summaries = [s for s in summaries if s["status"] == school_status]
    return summaries


@router.post("/schools", status_code=201)
def create_school(
    payload: SchoolIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    if db.query(TtSchool).filter(TtSchool.slug == payload.slug).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A school already uses that code."
        )
    school = TtSchool(
        name=payload.name,
        slug=payload.slug,
        timezone=payload.timezone,
        academic_year=payload.academic_year,
    )
    db.add(school)
    db.flush()
    audit(
        db, identity, "school_created", f"Created school {school.name}",
        entity="school", entity_id=school.id, school_id=school.id,
    )
    db.commit()
    db.refresh(school)
    return _school_summary(db, school)


@router.get("/schools/{school_id}")
def get_school(
    school_id: int,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown school.")
    return _school_summary(db, school)


@router.patch("/schools/{school_id}")
def update_school(
    school_id: int,
    payload: SchoolPatch,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown school.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(school, key, value)
    audit(
        db, identity, "school_updated", f"Updated school {school.name}",
        entity="school", entity_id=school.id, school_id=school.id,
    )
    db.commit()
    db.refresh(school)
    return _school_summary(db, school)


@router.post("/schools/{school_id}/status")
def set_school_status(
    school_id: int,
    active: bool = Query(...),
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Activate or deactivate. Data is always retained."""
    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown school.")
    school.status = "active" if active else "inactive"
    audit(
        db, identity,
        "school_activated" if active else "school_deactivated",
        f"{'Activated' if active else 'Deactivated'} school {school.name}",
        entity="school", entity_id=school.id, school_id=school.id,
    )
    db.commit()
    db.refresh(school)
    return _school_summary(db, school)


@router.get("/schools/{school_id}/users")
def school_users(
    school_id: int,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    rows = (
        db.query(TtMembership)
        .filter(TtMembership.school_id == school_id)
        .order_by(TtMembership.role.desc())
        .all()
    )
    return [
        {
            "user_id": r.user_id,
            "email": r.email,
            "role": r.role,
            "is_active": r.is_active,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/schools/{school_id}/administrators", status_code=201)
def add_administrator(
    school_id: int,
    payload: AdministratorIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Grant a school-level role to an existing account.

    The user must already have signed in at least once, so that a Supabase user
    id exists to bind the membership to. That prevents inviting an address that
    has never authenticated and silently creating a dangling privilege.
    """
    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown school.")

    email = payload.email.lower()
    known = (
        db.query(TtMembership).filter(func.lower(TtMembership.email) == email).first()
    )
    user_id = known.user_id if known else None
    if user_id is None:
        request_row = (
            db.query(TtAccessRequest)
            .filter(func.lower(TtAccessRequest.email) == email)
            .first()
        )
        user_id = request_row.user_id if request_row else None
    if user_id is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No account with that email has signed in yet. Ask them to sign up first.",
        )

    membership = (
        db.query(TtMembership)
        .filter(
            TtMembership.user_id == user_id, TtMembership.school_id == school_id
        )
        .first()
    )
    if membership is None:
        membership = TtMembership(
            user_id=user_id, school_id=school_id, role=payload.role, email=email
        )
        db.add(membership)
    else:
        membership.role = payload.role
        membership.is_active = True

    audit(
        db, identity, "administrator_assigned",
        f"Granted {email} the {payload.role} role at {school.name}",
        entity="membership", entity_id=user_id, school_id=school_id,
    )
    db.commit()
    return {"user_id": user_id, "email": email, "role": payload.role}


@router.delete("/schools/{school_id}/administrators/{user_id}", status_code=204)
def remove_administrator(
    school_id: int,
    user_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    membership = (
        db.query(TtMembership)
        .filter(
            TtMembership.user_id == user_id, TtMembership.school_id == school_id
        )
        .first()
    )
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That user is not a member.")
    email = membership.email
    db.delete(membership)
    audit(
        db, identity, "administrator_removed",
        f"Removed {email or user_id} from school {school_id}",
        entity="membership", entity_id=user_id, school_id=school_id,
    )
    db.commit()


# ---------------------------------------------------------------------------
# Platform administrators
# ---------------------------------------------------------------------------
@router.get("/administrators")
def list_platform_admins(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    rows = (
        db.query(TtPlatformAdmin)
        .filter(TtPlatformAdmin.is_active.is_(True))
        .order_by(TtPlatformAdmin.created_at)
        .all()
    )
    return [
        {
            "user_id": r.user_id,
            "email": r.email,
            "granted_by": r.granted_by,
            "created_at": r.created_at,
            "is_self": r.user_id == identity.user_id,
        }
        for r in rows
    ]


@router.post("/administrators", status_code=201)
def grant_platform_admin(
    payload: AdministratorIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Promote an existing account to super admin.

    Only an existing super admin can reach this, so platform authority can only
    ever be conferred by someone who already holds it.
    """
    email = payload.email.lower()
    membership = (
        db.query(TtMembership).filter(func.lower(TtMembership.email) == email).first()
    )
    request_row = (
        db.query(TtAccessRequest)
        .filter(func.lower(TtAccessRequest.email) == email)
        .first()
    )
    user_id = (membership.user_id if membership else None) or (
        request_row.user_id if request_row else None
    )
    if user_id is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No account with that email has signed in yet.",
        )

    row = (
        db.query(TtPlatformAdmin).filter(TtPlatformAdmin.user_id == user_id).first()
    )
    if row is None:
        row = TtPlatformAdmin(
            user_id=user_id, email=email, granted_by=identity.user_id
        )
        db.add(row)
    else:
        row.is_active = True
        row.email = email

    audit(
        db, identity, "platform_admin_granted",
        f"Granted platform administrator access to {email}",
        entity="platform_admin", entity_id=user_id,
    )
    db.commit()
    return {"user_id": user_id, "email": email}


@router.delete("/administrators/{user_id}", status_code=204)
def revoke_platform_admin(
    user_id: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Revoke platform authority, refusing to remove the last super admin."""
    row = (
        db.query(TtPlatformAdmin)
        .filter(
            TtPlatformAdmin.user_id == user_id, TtPlatformAdmin.is_active.is_(True)
        )
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not a platform administrator.")

    remaining = (
        db.query(TtPlatformAdmin)
        .filter(
            TtPlatformAdmin.is_active.is_(True),
            TtPlatformAdmin.user_id != user_id,
        )
        .count()
    )
    if remaining == 0:
        # Safety net: the platform must never be left with nobody in charge.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This is the only platform administrator. Grant access to someone "
            "else before removing this one.",
        )

    row.is_active = False
    audit(
        db, identity, "platform_admin_revoked",
        f"Revoked platform administrator access from {row.email or user_id}",
        entity="platform_admin", entity_id=user_id,
    )
    db.commit()


@router.get("/audit")
def platform_audit(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    rows = (
        db.query(TtPlatformAudit)
        .order_by(TtPlatformAudit.at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "at": r.at,
            "actor": r.actor,
            "action": r.action,
            "entity": r.entity,
            "entity_id": r.entity_id,
            "school_id": r.school_id,
            "summary": r.summary,
        }
        for r in rows
    ]
