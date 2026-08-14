"""FastAPI dependencies for verifying Supabase Auth access tokens."""

from functools import lru_cache
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import PyJWKClient

from app.config import settings


bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache
def _jwks_client() -> PyJWKClient:
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")
    # PyJWKClient caches the JWKS and keys, so this does not fetch them per request.
    return PyJWKClient(settings.supabase_jwks_url, cache_jwk_set=True, lifespan=3600)


def get_supabase_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Validate a Supabase JWT and return its claims.

    Frontend requests should send the Supabase access token as
    ``Authorization: Bearer <access_token>``.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="A valid Supabase access token is required",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    try:
        algorithm = jwt.get_unverified_header(credentials.credentials).get("alg")
        if algorithm == "HS256":
            if not settings.supabase_jwt_secret:
                raise RuntimeError("SUPABASE_JWT_SECRET is required for HS256 tokens")
            key = settings.supabase_jwt_secret
        elif algorithm in {"RS256", "ES256"}:
            key = _jwks_client().get_signing_key_from_jwt(credentials.credentials).key
        else:
            raise jwt.InvalidAlgorithmError("Unsupported signing algorithm")

        return jwt.decode(
            credentials.credentials,
            key,
            algorithms=[algorithm],
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
            options={"require": ["exp", "sub"]},
        )
    except (jwt.PyJWTError, RuntimeError):
        raise unauthorized from None
