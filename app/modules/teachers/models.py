from app.core.database import Base
from sqlalchemy import Column, Integer, ForeignKey

class Teacher(Base):
    __tablename__ = "teachers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)

class Qualification(Base):
    __tablename__ = "qualifications"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)

class Availability(Base):
    __tablename__ = "availabilities"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)