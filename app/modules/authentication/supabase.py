"""FastAPI dependencies for verifying Supabase Auth access tokens."""

from functools import lru_cache
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import PyJWKClient

from app.config import settings
from app.modules.authentication.security import SECRET_KEY


bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache
def _jwks_client() -> PyJWKClient:
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")
    # PyJWKClient caches the JWKS and keys, so this does not fetch them per request.
    return PyJWKClient(settings.supabase_jwks_url, cache_jwk_set=True, lifespan=3600)


def _verify_local_token(token: str) -> dict[str, Any] | None:
    """Verify a token issued by the app's own legacy login endpoint.

    Only accepted when no Supabase project is configured (pure local /
    self-hosted development). Returns the decoded claims or ``None`` when the
    token is not a local-development token.
    """
    if settings.supabase_url:
        return None
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
        if algorithm != "HS256":
            return None
        claims = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=["HS256"],
            options={
                "verify_iss": False,
                "verify_aud": False,
                "require": ["exp", "sub"],
            },
        )
        # The legacy token's subject is the user's email. The rest of the
        # application reads ``email`` from claims, so mirror it there.
        sub = claims.get("sub")
        if isinstance(sub, str) and "@" in sub and not claims.get("email"):
            claims["email"] = sub
        return claims
    except jwt.PyJWTError:
        return None


def get_supabase_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Validate the caller's JWT and return its claims.

    With a configured Supabase project this verifies Supabase Auth access
    tokens exactly as before. Without one (local development / self-hosted),
    tokens issued by the app's own ``/api/v1/auth/login`` endpoint are
    accepted instead.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="A valid access token is required",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    try:
        # Local development mode: no Supabase project configured, so the
        # only tokens that can be valid are the ones we issued ourselves.
        if not settings.supabase_url:
            local = _verify_local_token(credentials.credentials)
            if local is None:
                raise RuntimeError("Not a valid local-development token")
            return local

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
