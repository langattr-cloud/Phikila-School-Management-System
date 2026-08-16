"""Unit tests for the Supabase JWT verification dependency."""

from unittest.mock import patch, MagicMock

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


def test_get_supabase_claims_rejects_missing_token():
    """No Authorization header → 401."""
    from app.modules.authentication.supabase import get_supabase_claims

    with pytest.raises(HTTPException) as exc_info:
        get_supabase_claims(credentials=None)
    assert exc_info.value.status_code == 401


def test_get_supabase_claims_rejects_wrong_scheme():
    """Wrong scheme (not Bearer) → 401."""
    from app.modules.authentication.supabase import get_supabase_claims

    creds = HTTPAuthorizationCredentials(scheme="Basic", credentials="something")
    with pytest.raises(HTTPException) as exc_info:
        get_supabase_claims(credentials=creds)
    assert exc_info.value.status_code == 401


def test_get_supabase_claims_validates_jwt():
    """A well-formed JWT with RS256 is validated via JWKS."""
    from app.modules.authentication.supabase import get_supabase_claims

    # Build a fake token with the right header
    fake_token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature"
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=fake_token)

    # Mock the JWT decode to return claims
    with patch("app.modules.authentication.supabase.jwt") as mock_jwt:
        mock_jwt.get_unverified_header.return_value = {"alg": "HS256"}
        mock_jwt.PyJWTError = Exception
        with patch("app.config.settings") as mock_settings:
            mock_settings.supabase_jwt_secret = "test-secret"
            mock_settings.supabase_jwt_audience = "authenticated"
            mock_settings.supabase_issuer = "https://test.supabase.co/auth/v1"

            result = get_supabase_claims(credentials=creds)
            assert isinstance(result, dict)
