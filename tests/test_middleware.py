"""Tests for the security middleware and rate limiting."""

import os

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------
def test_security_headers_present(client):
    resp = client.get("/health")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert "strict-origin-when-cross-origin" in resp.headers["Referrer-Policy"]


def test_csp_header_present(client):
    resp = client.get("/health")
    lower_headers = {k.lower() for k in resp.headers.keys()}
    assert "content-security-policy" in lower_headers


def test_referrer_policy_value(client):
    resp = client.get("/health")
    assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


# ---------------------------------------------------------------------------
# Request ID
# ---------------------------------------------------------------------------
def test_request_id_echoed(client):
    resp = client.get("/health", headers={"x-request-id": "test-req-123"})
    assert resp.headers.get("x-request-id") == "test-req-123"


def test_request_id_generated_when_missing(client):
    resp = client.get("/health")
    assert resp.headers.get("x-request-id") is not None


# ---------------------------------------------------------------------------
# Rate limiting — only run when RATE_LIMIT_TEST=1 is set (requires real DB)
# ---------------------------------------------------------------------------
_RATE_LIMIT_ENABLED = os.environ.get("RATE_LIMIT_TEST", "0") == "1"


@pytest.mark.skipif(not _RATE_LIMIT_ENABLED, reason="Set RATE_LIMIT_TEST=1 to test rate limiting")
def test_rate_limit_on_excessive_requests(client):
    statuses = []
    for _ in range(70):
        resp = client.get("/health")
        statuses.append(resp.status_code)
    assert 429 in statuses
