from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

# Import your project's central Base to avoid mapping and registry errors
from app.core.database import Base  # Update this path if your database file has a different path

class SchoolInfo(Base):
    __tablename__ = "school_info"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    registration_number = Column(String(100), unique=True, nullable=True)
    education_system = Column(String(100), nullable=True)
    school_type = Column(String(100), nullable=True)
    category = Column(String(100), nullable=True)
    county = Column(String(100), nullable=True)
    sub_county = Column(String(100), nullable=True)
    ward = Column(String(100), nullable=True)
    postal_address = Column(String(255), nullable=True)
    physical_address = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    alternative_phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    website = Column(String(255), nullable=True)
    motto = Column(String(255), nullable=True)
    vision = Column(Text, nullable=True)
    mission = Column(Text, nullable=True)
    principal_name = Column(String(255), nullable=True)
    established_year = Column(Integer, nullable=True)
    logo = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    settings = relationship("SchoolSettings", back_populates="school", uselist=False, cascade="all, delete-orphan")
    branding = relationship("SchoolBranding", back_populates="school", uselist=False, cascade="all, delete-orphan")
    contact = relationship("SchoolContact", back_populates="school", uselist=False, cascade="all, delete-orphan")


class SchoolSettings(Base):
    __tablename__ = "school_settings"

    id = Column(Integer, primary_key=True, index=True)
    # Production schema retains a required key column from the original
    # key/value settings table. The FastAPI school settings model is a
    # single per-school settings record, so use a stable key for that record.
    key = Column(String(255), nullable=False, default="general")
    school_id = Column(Integer, ForeignKey("school_info.id", ondelete="CASCADE"), unique=True, nullable=False)

    timezone = Column(String(100), default="Africa/Nairobi", nullable=False)
    currency = Column(String(10), default="KES", nullable=False)
    date_format = Column(String(50), default="YYYY-MM-DD", nullable=False)
    time_format = Column(String(50), default="HH:mm", nullable=False)
    language = Column(String(50), default="en", nullable=False)

    allow_multiple_sessions = Column(Boolean, default=False, nullable=False)
    default_lesson_duration = Column(Integer, default=40, nullable=False)

    current_academic_year_id = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    school = relationship("SchoolInfo", back_populates="settings")


class SchoolBranding(Base):
    __tablename__ = "school_branding"

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("school_info.id", ondelete="CASCADE"), unique=True, nullable=False)

    logo_path = Column(String(255), nullable=True)
    stamp_path = Column(String(255), nullable=True)
    report_header = Column(Text, nullable=True)
    report_footer = Column(Text, nullable=True)

    primary_color = Column(String(50), nullable=True)
    secondary_color = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    school = relationship("SchoolInfo", back_populates="branding")


class SchoolContact(Base):
    __tablename__ = "school_contact"

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, ForeignKey("school_info.id", ondelete="CASCADE"), unique=True, nullable=False)

    principal = Column(String(255), nullable=True)
    deputy_principal = Column(String(255), nullable=True)
    bursar = Column(String(255), nullable=True)
    telephone = Column(String(50), nullable=True)
    mobile = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    emergency_contact = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    school = relationship("SchoolInfo", back_populates="contact")