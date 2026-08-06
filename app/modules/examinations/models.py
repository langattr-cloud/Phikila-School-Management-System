from app.core.database import Base
from sqlalchemy import Column, ForeignKey, Integer, String


class Examination(Base):
  __tablename__ = "examinations"
  __table_args__ = {"extend_existing": True}

  id = Column(Integer, primary_key=True, index=True)
  name = Column(String, index=True)  # e.g., "Mid-Term", "End-Term"
  academic_year = Column(String, nullable=True)
  term = Column(String, nullable=True)


class AssessmentComponent(Base):
  __tablename__ = "assessment_components"
  __table_args__ = {"extend_existing": True}

  id = Column(Integer, primary_key=True, index=True)
  exam_id = Column(Integer, ForeignKey("examinations.id"))
  name = Column(String, index=True)  # e.g., "CAT", "Practical", "Project"
  weight = Column(Integer, nullable=True)  # For grading calculations