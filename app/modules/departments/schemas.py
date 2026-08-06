from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class DepartmentBase(BaseModel):
    school_id: int
    code: str
    name: str
    description: Optional[str] = None
    status: Optional[str] = "Active"

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class DepartmentResponse(DepartmentBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
    
class DepartmentMemberAssign(BaseModel):
    teacher_id: int
    position: Optional[str] = None
    is_hod: Optional[bool] = False