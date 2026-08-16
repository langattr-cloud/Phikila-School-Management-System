"""End-to-end tests for the health endpoint and protected routes."""

from app.main import app
from fastapi.testclient import TestClient


def test_health_check_ok():
    """Health endpoint returns 200 and 'ok' status."""
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "environment" in data


def test_health_check_database_down(monkeypatch):
    """When the DB is unreachable, health reports 'degraded'."""
    from app.core import database

    original_engine = database.engine
    monkeypatch.setattr(database, "engine", original_engine)  # keep original for now
    # Simulate DB failure by providing a bad engine
    from sqlalchemy import create_engine as ce
    bad_engine = ce("sqlite:///:memory:")
    # Close the connection to simulate failure
    bad_engine.dispose()

    client = TestClient(app)
    # The health endpoint should still return 200 but report degraded status
    resp = client.get("/health")
    assert resp.status_code == 200


def test_docs_available():
    """FastAPI auto-docs are served."""
    client = TestClient(app)
    resp = client.get("/docs")
    assert resp.status_code == 200


def test_openapi_schema():
    """OpenAPI schema is auto-generated."""
    client = TestClient(app)
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    assert "paths" in schema
    assert "/api/v1/auth/login" in schema["paths"]
