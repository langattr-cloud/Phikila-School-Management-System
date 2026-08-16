"""Finance models — school-scoped, Decimal-safe, auditable."""

from __future__ import annotations

from decimal import Decimal
from sqlalchemy import (
    Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class FeeStructure(Base):
    """Defines fees for an academic year/term/class/level."""

    __tablename