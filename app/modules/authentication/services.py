from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.modules.users.models import User
from app.modules.authentication.security import verify_password

def authenticate_user(db: Session, identifier: str, password: str):
    user = db.query(User).filter(
        or_(User.email == identifier, User.username == identifier)
    ).first()
    
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user