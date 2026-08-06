from app.core.database import Base
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func


class Student(Base):
  __tablename__ = "students"
  __table_args__ = {"extend_existing": True}

  id = Column(Integer, primary_key=True, index=True)
  admission_number = Column(String, unique=True, index=True, nullable=False)
  first_name = Column(String, nullable=False)
  middle_name = Column(String, nullable=True)
  last_name = Column(String, nullable=False)
  gender = Column(String, nullable=False)
  date_of_birth = Column(Date, nullable=False)
  nationality = Column(String, default="Kenyan")
  birth_cert_or_id = Column(String, unique=True, nullable=True)
  contact_info = Column(String, nullable=True)
  photo_url = Column(String, nullable=True)
  status = Column(
      String, default="Active"
  )  # Active, Graduated, Transferred, Suspended, Withdrawn

  created_at = Column(DateTime(timezone=True), server_default=func.now())
  updated_at = Column(DateTime(timezone=True), onupdate=func.now())

  guardians = relationship(
      "app.modules.students.models.Guardian",
      back_populates="student",
      cascade="all, delete-orphan",
  )


class Guardian(Base):
  __tablename__ = "guardians"
  __table_args__ = {"extend_existing": True}

  id = Column(Integer, primary_key=True, index=True)
  student_id = Column(
      Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False
  )
  parent_name = Column(String, nullable=False)
  relationship_to_student = Column(
      String, nullable=False
  )  # e.g., Father, Mother, Guardian
  phone_number = Column(String, nullable=False)
  email = Column(String, nullable=True)
  address = Column(Text, nullable=True)
  is_emergency_contact = Column(Boolean, default=False)

  student = relationship(
      "app.modules.students.models.Student", back_populates="guardians"
  )