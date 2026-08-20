"""Reusable distributed rate limiting for backend routes."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from ipaddress import ip_address

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from upstash_ratelimit import FixedWindow, Ratelimit

from app.core.redis import RedisConfigurationError, get_redis
from app.modules.platform.authz import Identity, resolve_identity
from app.modules.scheduling.tenancy import Principal, resolve_principal

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimitPolicy:
    name: str
    requests: int
    window_seconds: int


AUTH_LOGIN = RateLimitPolicy("auth-login", 10, 60)
TIMETABLE_SOLVER = RateLimitPolicy("timetable-solver", 5, 60)
SCHEDULING_MUTATION = RateLimitPolicy("scheduling-mutation", 60, 60)
PLATFORM_MUTATION = RateLimitPolicy("platform-mutation", 30, 60)
OCR_PROCESSING = RateLimitPolicy("ocr-processing", 20, 60)
API_MUTATION = RateLimitPolicy("api-mutation", 120, 60)


def _limiter(policy: RateLimitPolicy) -> Ratelimit | None:
    redis = get_redis()
    if redis is None:
        return None
    return Ratelimit(
        redis=redis,
        limiter=FixedWindow(policy.requests, policy.window_seconds),
        prefix=f"phikila:{policy.name}",
    )


def _client_ip(request: Request) -> str:
    # Render terminates TLS/proxy traffic. Trust only the address supplied by
    # the ASGI server; do not use a client-controlled X-Forwarded-For header.
    host = request.client.host if request.client else "unknown"
    try:
        return str(ip_address(host))
    except ValueError:
        return "unknown"


def _fail_open() -> bool:
    # Production should fail closed unless explicitly configured otherwise.
    return os.getenv("REDIS_RATE_LIMIT_FAIL_OPEN", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _redis_unavailable(policy: RateLimitPolicy, reason: str) -> None:
    logger.error("Redis rate limiter unavailable for policy %s: %s", policy.name, reason)
    if _fail_open():
        return
    raise HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "Rate limiting service is temporarily unavailable.",
    )


def _enforce(policy: RateLimitPolicy, identifier: str) -> None:
    try:
        limiter = _limiter(policy)
    except RedisConfigurationError as exc:
        _redis_unavailable(policy, "invalid backend Redis configuration")
        return
    except Exception:
        logger.exception("Failed to initialize Upstash rate limiter for policy %s", policy.name)
        _redis_unavailable(policy, "client initialization failed")
        return

    if limiter is None:
        _redis_unavailable(policy, "Redis credentials are not configured")
        return

    try:
        result = limiter.limit(identifier)
    except Exception:
        logger.exception("Upstash rate limiter request failed for policy %s", policy.name)
        _redis_unavailable(policy, "Redis request failed")
        return

    if not result.allowed:
        retry_after = max(1, int(result.reset - time.time()))
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def rate_limit_auth(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> None:
    """Limit credential attempts by server-observed IP plus login identifier."""
    username = form_data.username.strip().lower()
    _enforce(AUTH_LOGIN, f"ip:{_client_ip(request)}:login:{username}")


def rate_limit_scheduling_mutation(
    request: Request,
    principal: Principal = Depends(resolve_principal),
) -> Principal:
    """Limit scheduling writes by the server-derived tenant and user."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        policy = (
            TIMETABLE_SOLVER
            if request.url.path.endswith("/solver/generate")
            else SCHEDULING_MUTATION
        )
        _enforce(
            policy,
            f"school:{principal.school_id}:user:{principal.user_id}",
        )
    return principal


def rate_limit_platform_mutation(
    request: Request,
    identity: Identity = Depends(resolve_identity),
) -> Identity:
    """Limit platform/admin activity by authenticated user and school scope."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        school_scope = ",".join(map(str, identity.school_ids)) or "platform"
        _enforce(
            PLATFORM_MUTATION,
            f"tenant:{school_scope}:user:{identity.user_id}",
        )
    return identity


def rate_limit_ocr(
    request: Request,
    principal: Principal = Depends(resolve_principal),
) -> Principal:
    """Limit expensive OCR processing per authenticated tenant and user."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        _enforce(
            OCR_PROCESSING,
            f"school:{principal.school_id}:user:{principal.user_id}",
        )
    return principal


def rate_limit_api_mutation(
    request: Request,
    principal: Principal = Depends(resolve_principal),
) -> Principal:
    """Conservative limit for other authenticated state-changing API calls."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        _enforce(
            API_MUTATION,
            f"school:{principal.school_id}:user:{principal.user_id}",
        )
    return principal
