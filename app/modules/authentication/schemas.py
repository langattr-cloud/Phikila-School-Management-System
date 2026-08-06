from typing import Optional
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
  email: EmailStr
  full_name: str
  is_active: Optional[bool] = True


class UserCreate(UserBase):
  password: str


class UserResponse(UserBase):
  id: int
  is_superuser: bool

  class Config:
    from_attributes = True


class Token(BaseModel):
  access_token: str
  token_type: str


class TokenPayload(BaseModel):
  sub: Optional[str] = None