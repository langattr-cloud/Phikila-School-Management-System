"""Standalone calendar-date resource for scheduling setup.

Dates are concrete calendar occurrences. They are deliberately not derived
from, stored as, or converted into recurring weekday rules.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Integer, String, UniqueConstraint

from app.core.database import Base


class TtCalendarDate(Base):
    __tablename__ = "tt_calendar_dates"
    __table_args__ = (
        UniqueConstraint("school_id", "date", name="uq_tt_calendar_date"),
    )

    id = Column(Integer, primary_key=True)
    school_id = Column(Integer, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    label = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
