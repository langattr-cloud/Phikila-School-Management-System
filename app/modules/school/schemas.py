from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr

# --- School Settings Schemas ---
class SchoolSettingsBase(BaseModel):
    timezone: Optional[str] = "Africa/Nairobi"
    currency: Optional[str] = "KES"
    date_format: Optional[str] = "YYYY-MM-DD"
    time_format: Optional[str] = "HH:mm"
    language: Optional[str] = "en"
    allow_multiple_sessions: Optional[bool] = False
    default_lesson_duration: Optional[int] = 40
    current_academic_year_id: Optional[int] = None

class SchoolSettingsCreate(SchoolSettingsBase):
    pass

class SchoolSettingsUpdate(BaseModel):
    timezone: Optional[str] = None
    currency: Optional[str] = None
    date_format: Optional[str] = None
    time_format: Optional[str] = None
    language: Optional[str] = None
    allow_multiple_sessions: Optional[bool] = None
    default_lesson_duration: Optional[int] = None
    current_academic_year_id: Optional[int] = None

class SchoolSettingsResponse(SchoolSettingsBase):
    id: int
    school_id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

# --- School Branding Schemas ---
class SchoolBrandingBase(BaseModel):
    logo_path: Optional[str] = None
    stamp_path: Optional[str] = None
    report_header: Optional[str] = None
    report_footer: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None

class SchoolBrandingCreate(SchoolBrandingBase):
    pass

class SchoolBrandingUpdate(SchoolBrandingBase):
    pass

class SchoolBrandingResponse(SchoolBrandingBase):
    id: int
    school_id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

# --- School Contact Schemas ---
class SchoolContactBase(BaseModel):
    principal: Optional[str] = None
    deputy_principal: Optional[str] = None
    bursar: Optional[str] = None
    telephone: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[EmailStr] = None
    emergency_contact: Optional[str] = None

class SchoolContactCreate(SchoolContactBase):
    pass

class SchoolContactUpdate(SchoolContactBase):
    pass

class SchoolContactResponse(SchoolContactBase):
    id: int
    school_id: int
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True

# --- School Info Schemas ---
class SchoolBase(BaseModel):
    name: str
    code: str
    registration_number: Optional[str] = None
    education_system: Optional[str] = None
    school_type: Optional[str] = None
    category: Optional[str] = None
    county: Optional[str] = None
    sub_county: Optional[str] = None
    ward: Optional[str] = None
    postal_address: Optional[str] = None
    physical_address: Optional[str] = None
    phone: Optional[str] = None
    alternative_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    website: Optional[str] = None
    motto: Optional[str] = None
    vision: Optional[str] = None
    mission: Optional[str] = None
    principal_name: Optional[str] = None
    established_year: Optional[int] = None
    logo: Optional[str] = None
    is_active: Optional[bool] = True

class SchoolCreate(SchoolBase):
    settings: Optional[SchoolSettingsCreate] = None
    branding: Optional[SchoolBrandingCreate] = None
    contact: Optional[SchoolContactCreate] = None

class SchoolUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    registration_number: Optional[str] = None
    education_system: Optional[str] = None
    school_type: Optional[str] = None
    category: Optional[str] = None
    county: Optional[str] = None
    sub_county: Optional[str] = None
    ward: Optional[str] = None
    postal_address: Optional[str] = None
    physical_address: Optional[str] = None
    phone: Optional[str] = None
    alternative_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    website: Optional[str] = None
    motto: Optional[str] = None
    vision: Optional[str] = None
    mission: Optional[str] = None
    principal_name: Optional[str] = None
    established_year: Optional[int] = None
    logo: Optional[str] = None
    is_active: Optional[bool] = None

class SchoolResponse(SchoolBase):
    id: int
    created_at: datetime
    updated_at: datetime
    settings: Optional[SchoolSettingsResponse] = None
    branding: Optional[SchoolBrandingResponse] = None
    contact: Optional[SchoolContactResponse] = None
    class Config:
        from_attributes = True
