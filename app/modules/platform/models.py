"""Platform-level roles, access requests and audit."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.database import Base


class TtPlatformAdmin(Base):
    __tablename__ = "tt_platform_admins"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    role = Column(Text, nullable=False, default="super_admin")
    email = Column(String(160))
    is_active = Column(Boolean, default=True, nullable=False)
    granted_by = Column(String(64))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class TtAccessRequest(Base):
    __tablename__ = "tt_access_requests"
    __table_args__ = (
        Index("ix_tt_access_request_status", "status", "created_at"),
        UniqueConstraint("user_id", name="uq_tt_access_request_user"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    email = Column(String(160), nullable=False)
    full_name = Column(String(160))
    requested_role = Column(Text, nullable=False, default="teacher")
    requested_school_id = Column(Integer, index=True)
    requested_school_name = Column(Text)
    note = Column(Text)
    status = Column(Text, default="pending", nullable=False)
    decided_by = Column(UUID(as_uuid=True))
    decided_at = Column(DateTime(timezone=True))
    decision_note = Column(Text)
    granted_role = Column(String(20))
    granted_school_id = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class TtPlatformAudit(Base):
    __tablename__ = "tt_platform_audit"

    id = Column(Integer, primary_key=True)
    user_id = Column(UUID(as_uuid=True), index=True)
    action = Column(Text, nullable=False, index=True)
    entity = Column(Text)
    entity_id = Column(Text)
    detail = Column(JSONB)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    actor = Column(String(160))
    actor_id = Column(String(64), index=True)
    school_id = Column(Integer, index=True)
    summary = Column(Text)
    at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
