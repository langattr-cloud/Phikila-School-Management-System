from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.modules.users.models import User


def validate_email_not_registered(db: Session, email: str):
  existing_user = db.query(User).filter(User.email == email).first()
  if existing_user:
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Email already registered",
    )
  return True