from sqlalchemy.orm import Session
from sqlalchemy import func

from app.modules.users.models import User
from app.modules.authentication.security import verify_password


def authenticate_user(db: Session, identifier: str, password: str):
    """Authenticate with the registered email address only.

    Email matching is case-insensitive and ignores accidental surrounding
    whitespace. Usernames are deliberately not accepted as login identifiers.
    """
    email = (identifier or "").strip().lower()
    if not email or not password:
        return False

    user = (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user
