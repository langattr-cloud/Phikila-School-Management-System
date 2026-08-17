"""FastAPI dependencies for verifying Supabase Auth access tokens."""

import logging
import time
from typing import Any

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import PyJWKClient

from app.config import settings
from app.modules.authentication.security import SECRET_KEY

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)

_jwks_cache: dict[str, Any] = {"client": None, "failed_at": 0.0}
_JWKS_RETRY_BACKOFF = 30


def _jwks_client() -> PyJWKClient:
    if _jwks_cache["client"] is not None:
        return _jwks_cache["client"]
    if _jwks_cache["failed_at"] and (time.time() - _jwks_cache["failed_at"]) < _JWKS_RETRY_BACKOFF:
        raise RuntimeError("JWKS client unavailable (retry backoff)")
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")
    try:
        client = PyJWKClient(settings.supabase_jwks_url, cache_jwk_set=True, lifespan=3600)
        _jwks_cache["client"] = client
        _jwks_cache["failed_at"] = 0.0
        return client
    except Exception:
        _jwks_cache["failed_at"] = time.time()
        raise


def _verify_local_token(token: str) -> dict[str, Any] | None:
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
            options={"verify_iss": False, "verify_aud": False, "require": ["exp", "sub"]},
        )
        sub = claims.get("sub")
        if isinstance(sub, str) and "@" in sub and not claims.get("email"):
            claims["email"] = sub
        return claims
    except jwt.PyJWTError:
        return None


def _verify_with_supabase_auth_api(token: str) -> dict[str, Any] | None:
    """Ask Supabase Auth to validate a token when local JWT verification fails."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None
    try:
        response = requests.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
            timeout=5,
        )
        if response.status_code != 200:
            return None
        user = response.json()
        user_id = user.get("id")
        if not user_id:
            return None
        return {
            "sub": user_id,
            "email": user.get("email"),
            "user_metadata": user.get("user_metadata") or {},
            "app_metadata": user.get("app_metadata") or {},
        }
    except requests.RequestException as exc:
        logger.warning("Supabase Auth API fallback unavailable: %s", exc)
        return None


def get_supabase_claims(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Validate the caller's access token and return its claims."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="A valid access token is required",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    token = credentials.credentials
    if not settings.supabase_url:
        local = _verify_local_token(token)
        if local is None:
            raise unauthorized
        return local

    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
        if algorithm == "HS256":
            if not settings.supabase_jwt_secret:
                raise RuntimeError("SUPABASE_JWT_SECRET is required for HS256 tokens")
            key = settings.supabase_jwt_secret
        elif algorithm in {"RS256", "ES256"}:
            key = _jwks_client().get_signing_key_from_jwt(token).key
        else:
            raise jwt.InvalidAlgorithmError("Unsupported signing algorithm")

        return jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
            options={"require": ["exp", "sub"]},
        )
    except (jwt.PyJWKClientError, jwt.PyJWTError, RuntimeError) as exc:
        # Supabase Auth is authoritative. A stale/missing JWKS or legacy JWT
        # configuration must not invalidate an otherwise valid browser session.
        logger.warning("Local Supabase JWT verification failed; using Auth API fallback: %s", exc)
        claims = _verify_with_supabase_auth_api(token)
        if claims is not None:
            return claims
        raise unauthorized from None
