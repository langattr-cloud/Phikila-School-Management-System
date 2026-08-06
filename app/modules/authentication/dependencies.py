from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models
from .security import ALGORITHM, SECRET_KEY
from .schemas import TokenPayload

reusable_oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(reusable_oauth2)
) -> models.User:
  try:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    token_data = TokenPayload(**payload)
    if token_data.sub is None:
      raise HTTPException(
          status_code=status.HTTP_403_FORBIDDEN,
          detail="Could not validate credentials",
      )
  except JWTError:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Could not validate credentials",
    )
  
  user = db.query(models.User).filter(models.User.id == int(token_data.sub)).first()
  if not user:
    raise HTTPException(status_code=404, detail="User not found")
  if not user.is_active:
    raise HTTPException(status_code=400, detail="Inactive user")
  return user