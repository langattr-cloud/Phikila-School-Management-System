from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.authentication.security import get_password_hash
from . import models, schemas

router = APIRouter(tags=["Users"])


@router.post(
    "/",
    response_model=schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
  # Check if email is already registered
  db_user_email = (
      db.query(models.User).filter(models.User.email == user.email).first()
  )
  if db_user_email:
    raise HTTPException(status_code=400, detail="Email already registered")

  # Check if username is already taken
  db_user_username = (
      db.query(models.User).filter(models.User.username == user.username).first()
  )
  if db_user_username:
    raise HTTPException(status_code=400, detail="Username already taken")

  # Create new user instance (password is always stored hashed)
  db_user = models.User(
      username=user.username,
      email=user.email,
      hashed_password=get_password_hash(user.password),
      role=getattr(user, "role", "Teacher"),
  )
  db.add(db_user)
  db.commit()
  db.refresh(db_user)
  return db_user


@router.get("/", response_model=List[schemas.UserResponse])
def read_users(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
  users = db.query(models.User).offset(skip).limit(limit).all()
  return users


@router.get("/{user_id}", response_model=schemas.UserResponse)
def read_user(user_id: int, db: Session = Depends(get_db)):
  db_user = (
      db.query(models.User).filter(models.User.id == user_id).first()
  )
  if db_user is None:
    raise HTTPException(status_code=404, detail="User not found")
  return db_user