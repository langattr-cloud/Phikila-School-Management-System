from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.authentication.exceptions import CredentialsException
from app.modules.authentication.security import ALGORITHM, SECRET_KEY
from app.modules.users.models import User

# Make sure tokenUrl matches your exact router prefix + route path (e.g., "/api/auth/token" or "/api/auth/login")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise CredentialsException()
    except JWTError:
        raise CredentialsException()
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise CredentialsException()
    return user