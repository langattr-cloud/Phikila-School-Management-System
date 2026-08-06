from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr


class GuardianBase(BaseModel):
  parent_name: str
  relationship_to_student: str
  phone_number: str
  email: Optional[EmailStr] = None
  address: Optional[str] = None
  is_emergency_contact: bool = False


class GuardianCreate(GuardianBase):
  pass


class GuardianResponse(GuardianBase):
  id: int
  student_id: int

  class Config:
    from_attributes = True


class StudentBase(BaseModel):
  admission_number: str
  first_name: str
  middle_name: Optional[str] = None
  last_name: str
  gender: str
  date_of_birth: date
  nationality: Optional[str] = "Kenyan"
  birth_cert_or_id: Optional[str] = None
  contact_info: Optional[str] = None
  photo_url: Optional[str] = None
  status: Optional[str] = "Active"


class StudentCreate(StudentBase):
  guardians: List[GuardianCreate] = []


class StudentResponse(StudentBase):
  id: int
  created_at: datetime
  updated_at: Optional[datetime] = None
  guardians: List[GuardianResponse] = []

  class Config:
    from_attributes = True