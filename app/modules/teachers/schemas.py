from pydantic import BaseModel
from typing import Optional, List

# Qualification Schemas
class QualificationBase(BaseModel):
    title: str
    institution: Optional[str] = None

class QualificationCreate(QualificationBase):
    pass

class Qualification(QualificationBase):
    id: int
    teacher_id: int

    class Config:
        from_attributes = True

# Teacher Schemas
class TeacherBase(BaseModel):
    name: str
    tsc_number: Optional[str] = None
    department: Optional[str] = None

class TeacherCreate(TeacherBase):
    pass

class Teacher(TeacherBase):
    id: int
    qualifications: List[Qualification] = []

    class Config:
        from_attributes = True

from pydantic import BaseModel
from typing import Optional

class TeacherBase(BaseModel):
    name: str
    email: str
    department_id: Optional[int] = None

class TeacherCreate(TeacherBase):
    pass

class TeacherUpdate(TeacherBase):
    name: Optional[str] = None
    email: Optional[str] = None

class Teacher(TeacherBase):
    id: int

    class Config:
        from_attributes = True   

from pydantic import BaseModel
from typing import Optional, List

# Qualification Schemas
class QualificationBase(BaseModel):
    title: str
    institution: Optional[str] = None
    year_obtained: Optional[int] = None

class QualificationCreate(QualificationBase):
    pass

class Qualification(QualificationBase):
    id: int
    teacher_id: int

    class Config:
        from_attributes = True

# Availability Schemas
class AvailabilityBase(BaseModel):
    day_of_week: str
    start_time: str
    end_time: str

class AvailabilityCreate(AvailabilityBase):
    pass

class Availability(AvailabilityBase):
    id: int
    teacher_id: int

    class Config:
        from_attributes = True

# Update your main Teacher schema to include them if desired
class TeacherBase(BaseModel):
    name: str
    tsc_number: str
    email: Optional[str] = None
    department_id: Optional[int] = None

class TeacherCreate(TeacherBase):
    pass

class Teacher(TeacherBase):
    id: int
    qualifications: List[Qualification] = []
    availabilities: List[Availability] = []

    class Config:
        from_attributes = True