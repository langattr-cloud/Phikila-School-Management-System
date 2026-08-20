from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rate_limit import rate_limit_auth
from app.modules.authentication.services import authenticate_user
from app.modules.authentication.security import create_access_token
from app.modules.authentication.schemas import Token
from app.modules.authentication.supabase import get_supabase_claims

router = APIRouter(tags=["Authentication"])


@router.get("/me", summary="Return the verified Supabase Auth identity")
def current_identity(claims: dict = Depends(get_supabase_claims)):
    return {
        "id": claims["sub"],
        "email": claims.get("email"),
        "role": claims.get("role"),
        "app_metadata": claims.get("app_metadata", {}),
        "user_metadata": claims.get("user_metadata", {}),
    }


@router.post("/login", response_model=Token, dependencies=[Depends(rate_limit_auth)])
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = authenticate_user(db, identifier=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(subject=user.email)
    return {"access_token": access_token, "token_type": "bearer"}
