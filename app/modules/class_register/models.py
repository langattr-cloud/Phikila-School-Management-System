from app.core.database import Base
from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship


class Teacher(Base):
    __tablename__ = "teachers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    tsc_number = Column(String, unique=True, index=True, nullable=True)
    department = Column(String, nullable=True)

    # Relationships
    qualifications = relationship("Qualification", back_populates="teacher")
    availabilities = relationship("Availability", back_populates="teacher")


class ClassRegister(Base):
    __tablename__ = "class_registers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    academic_year_id = Column(
        Integer, ForeignKey("academic_years.id"), nullable=False
    )
    grade_form_id = Column(
        Integer, ForeignKey("levels.id"), nullable=False
    )  # Links to your grade/level model
    stream_id = Column(
        Integer, ForeignKey("streams.id"), nullable=False
    )  # Links to your stream model
    class_teacher_id = Column(
        Integer, ForeignKey("teachers.id"), nullable=True
    )  # Links to teachers module
    room_id = Column(String, nullable=True)  # Optional physical room identifier
    capacity = Column(Integer, default=45, nullable=False)
    status = Column(String, default="Active")  # Active, Inactive, Archived

    # Relationships (using fully qualified module paths to prevent registry clashes)
    academic_year = relationship(
        "app.modules.academics.models.AcademicYear", backref="class_registers"
    )
    grade_form = relationship(
        "app.modules.academics.models.Level", backref="class_registers"
    )
    stream = relationship(
        "app.modules.academics.models.Stream", backref="class_registers"
    )
    class_teacher = relationship(
        "app.modules.teachers.models.Teacher", backref="assigned_class"
    )