"""Student management schemas — academic placement is represented by enrollment."""
from __future__ import annotations
from datetime import date, datetime
from pydantic import BaseModel, Field

class GuardianCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200); relationship: str = Field(min_length=1, max_length=50); phone: str = Field(min_length=5, max_length=30)
    alt_phone: str | None = None; email: str | None = None; address: str | None = None; occupation: str | None = None; is_emergency_contact: bool = False
class GuardianUpdate(BaseModel):
    full_name: str | None = None; relationship: str | None = None; phone: str | None = None; alt_phone: str | None = None; email: str | None = None; address: str | None = None; occupation: str | None = None; is_emergency_contact: bool | None = None
class GuardianResponse(BaseModel):
    id:int; student_id:int; full_name:str; relationship:str; phone:str; alt_phone:str|None=None; email:str|None=None; address:str|None=None; occupation:str|None=None; is_emergency_contact:bool; created_at:datetime|None=None
    model_config={"from_attributes":True}
class StudentCreate(BaseModel):
    admission_number:str=Field(min_length=1,max_length=50); first_name:str=Field(min_length=1,max_length=100); middle_name:str|None=None; last_name:str=Field(min_length=1,max_length=100); preferred_name:str|None=None
    date_of_birth:date|None=None; gender:str|None=None; email:str|None=None; phone:str|None=None; address:str|None=None; nationality:str="Kenyan"; national_id:str|None=None; photo_url:str|None=None; admission_date:date|None=None
    academic_year_id:int; term_id:int|None=None; level_id:int; class_id:int; status:str="active"; guardians:list[GuardianCreate]=[]
class StudentUpdate(BaseModel):
    first_name:str|None=None; middle_name:str|None=None; last_name:str|None=None; preferred_name:str|None=None; date_of_birth:date|None=None; gender:str|None=None; email:str|None=None; phone:str|None=None; address:str|None=None; nationality:str|None=None; national_id:str|None=None; photo_url:str|None=None; status:str|None=None; status_reason:str|None=None
class StudentResponse(BaseModel):
    id:int; school_id:int; admission_number:str; first_name:str; middle_name:str|None=None; last_name:str; preferred_name:str|None=None; date_of_birth:date|None=None; gender:str|None=None; email:str|None=None; phone:str|None=None; address:str|None=None; nationality:str|None=None; national_id:str|None=None; photo_url:str|None=None; admission_date:date|None=None; status:str; status_reason:str|None=None; status_date:date|None=None; created_at:datetime|None=None; updated_at:datetime|None=None; guardians:list[GuardianResponse]=[]
    model_config={"from_attributes":True}
class StudentListResponse(BaseModel):
    items:list[StudentResponse]; total:int; page:int; page_size:int; pages:int
class EnrollmentResponse(BaseModel):
    id:int; school_id:int; student_id:int; academic_year_id:int; term_id:int|None=None; level_id:int; class_id:int|None=None; grade_id:int|None=None; stream_id:int|None=None; status:str; enrollment_date:date|None=None; created_at:datetime|None=None
    model_config={"from_attributes":True}
class DocumentCreate(BaseModel):
    document_type:str=Field(min_length=1,max_length=50); title:str=Field(min_length=1,max_length=200); description:str|None=None; file_url:str|None=None; file_size:int|None=None; mime_type:str|None=None; ocr_scan_id:int|None=None
class DocumentResponse(BaseModel):
    id:int; school_id:int; student_id:int; document_type:str; title:str; description:str|None=None; file_url:str|None=None; file_size:int|None=None; mime_type:str|None=None; ocr_scan_id:int|None=None; uploaded_by:str|None=None; created_at:datetime|None=None
    model_config={"from_attributes":True}