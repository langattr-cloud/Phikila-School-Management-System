"""Cloudflare-aware security middleware.

Adds security headers and request logging in production. In development
these are lightweight or no-ops.

When deployed behind Cloudflare:
  - CF-Connecting-IP reveals the real client IP
  - X-Forwarded-Proto is set to "https" by Cloudflare
  - The middleware trusts these headers when CF_CONNECTING_IP is present
"""

from __future__ import annotations

import logging
import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("phikila.access")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject standard security headers into every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Never cache authenticated API responses
        path = request.url.path
        is_api = path.startswith("/api/") or path.startswith("/health")
        is_static = path.startswith("/assets/") or path.startswith("/static/") or path.startswith("/brand/")

        if is_static:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif is_api:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        else:
            response.headers["Cache-Control"] = "no-cache"

        for key, value in SECURITY_HEADERS.items():
            response.headers[key] = value

        # HSTS in production
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"

        return response


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Structured access log with request id, latency, and status."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4())[:8])
        start = time.perf_counter()

        response = await call_next(request)

        duration_ms = (time.perf_counter() - start) * 1000
        path = request.url.path

        # Never log query strings that might contain tokens
        safe_path = path.split("?")[0]

        # Never log auth headers
        logger.info(
            "request",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": safe_path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 1),
            },
        )

        response.headers["X-Request-Id"] = request_id
        return response
