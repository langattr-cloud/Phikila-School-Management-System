"""Platform-level roles, access requests and audit.

The scheduling module already owns ``tt_schools`` and ``tt_memberships`` (a
user's role *within* one school). Platform authority is deliberately a separate
table: a super admin belongs to the platform, not to any single school, so it
must not be expressible as a school membership row.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.core.database import Base


class TtPlatformAdmin(Base):
    """Platform-wide authority. Presence of an active row IS super-admin status.

    There is no ``role`` column to tamper with and no school_id: the row either
    exists and is active, or the user is not a super admin. Rows are only ever
    written by another super admin or the server-side bootstrap.
    """

    __tablename__ = "tt_platform_admins"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), nullable=False, unique=True, index=True)
    email = Column(String(160))
    is_active = Column(Boolean, default=True, nullable=False)
    # Provenance: "bootstrap" or the user_id of the granting super admin.
    granted_by = Column(String(64))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class TtAccessRequest(Base):
    """A signup awaiting super-admin approval.

    Signing up creates an *account* but no access. The requested role and school
    are only ever a request; the approving super admin decides what is actually
    granted, so a user cannot self-assign privileges by editing the request.
    """

    __tablename__ = "tt_access_requests"
    __table_args__ = (
        Index("ix_tt_access_request_status", "status", "created_at"),
        UniqueConstraint("user_id", name="uq_tt_access_request_user"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    email = Column(String(160), nullable=False)
    full_name = Column(String(160))
    # What the applicant asked for. Never applied automatically.
    requested_role = Column(String(20), nullable=False, default="teacher")
    # Either an existing school, or a free-text name for a school to be created.
    requested_school_id = Column(Integer, index=True)
    requested_school_name = Column(String(160))
    note = Column(Text)

    status = Column(String(20), default="pending", nullable=False)  # pending|approved|rejected
    decided_by = Column(String(64))
    decided_at = Column(DateTime)
    decision_note = Column(Text)
    # What was actually granted, which may differ from what was requested.
    granted_role = Column(String(20))
    granted_school_id = Column(Integer)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class TtPlatformAudit(Base):
    """Audit trail for platform-level actions.

    Deliberately stores only descriptive metadata. Credentials, tokens and
    request bodies are never written here.
    """

    __tablename__ = "tt_platform_audit"

    id = Column(Integer, primary_key=True)
    actor = Column(String(160))
    actor_id = Column(String(64), index=True)
    action = Column(String(80), nullable=False, index=True)
    entity = Column(String(80))
    entity_id = Column(String(80))
    # Scope the entry to a school where relevant, so a school admin could later
    # be shown their own history without seeing the whole platform.
    school_id = Column(Integer, index=True)
    summary = Column(Text)
    at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
