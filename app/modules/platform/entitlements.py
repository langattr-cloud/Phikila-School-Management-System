"""Persistent school module entitlement model and canonical module catalog."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.core.database import Base

MODULES = {
    "students": {"label": "Student Management", "description": "Student records and enrollment"},
    "staff": {"label": "Staff Management", "description": "Teacher and staff records"},
    "attendance": {"label": "Attendance", "description": "Student and staff attendance"},
    "examinations": {"label": "Examinations & Results", "description": "Assessments, marks and report cards"},
    "finance": {"label": "Fees & Finance", "description": "Invoices, payments and balances"},
    "timetable": {"label": "Timetable", "description": "Classes and lesson schedules"},
    "library": {"label": "Library", "description": "Books and borrowing records"},
    "transport": {"label": "Transport", "description": "Vehicles, routes and assignments"},
    "parent_portal": {"label": "Parent Portal", "description": "Parent access and communication"},
    "ai_tools": {"label": "AI Tools", "description": "AI-powered assistance and analysis"},
}

DEFAULT_ENABLED_MODULES = {"students", "staff", "attendance", "examinations"}


class TtSchoolModuleEntitlement(Base):
    __tablename__ = "tt_school_module_entitlements"
    __table_args__ = (
        UniqueConstraint("school_id", "module_key", name="uq_school_module_entitlement"),
    )

    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, ForeignKey("tt_schools.id", ondelete="CASCADE"), nullable=False, index=True)
    module_key = Column(String(40), nullable=False)
    enabled = Column(Boolean, nullable=False, default=False)
    updated_by = Column(String(160))
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
