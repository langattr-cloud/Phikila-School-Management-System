import requests
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rate_limit import rate_limit_auth
from app.modules.authentication.services import authenticate_user
from app.modules.authentication.security import create_access_token
from app.modules.authentication.schemas import Token
from app.modules.authentication.supabase import get_supabase_claims
from app.config import settings

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


class InitialPasswordIn(BaseModel):
    password: str = Field(min_length=12, max_length=128)


@router.post("/complete-initial-password", dependencies=[Depends(rate_limit_auth)])
def complete_initial_password(
    payload: InitialPasswordIn,
    claims: dict = Depends(get_supabase_claims),
):
    """Set a personal password and clear the server-managed first-login flag."""
    metadata = dict(claims.get("app_metadata") or {})
    if not metadata.get("must_change_password"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account does not require initial password setup.",
        )

    service_key = settings.supabase_service_role_key
    if not settings.supabase_url or not service_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password setup is temporarily unavailable. Contact the platform administrator.",
        )

    metadata["must_change_password"] = False
    try:
        response = requests.put(
            f"{settings.supabase_url}/auth/v1/admin/users/{claims['sub']}",
            headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
            json={"password": payload.password, "app_metadata": metadata},
            timeout=12,
        )
    except requests.RequestException:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach the authentication service. Try again.",
        ) from None

    if response.status_code not in (200, 201):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The authentication service could not update your password.",
        )
    return {"status": "password_updated"}


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
