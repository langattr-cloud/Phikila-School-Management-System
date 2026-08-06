from pydantic import BaseModel

# This is the class your route expects
class Department(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

# And keep your creation schema for the POST request
class DepartmentCreate(BaseModel):
    name: str