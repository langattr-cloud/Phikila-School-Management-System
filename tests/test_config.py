"""Unit tests for configuration validation."""

import os

import pytest


def test_settings_defaults():
    """Settings loads with sensible defaults."""
    from app.config import Settings

    settings = Settings()
    assert settings.environment == "development"
    assert settings.supabase_jwt_audience == "authenticated"


def test_wildcard_cors_rejected():
    """Wildcard CORS origins are rejected at startup."""
    from app.config import Settings

    with pytest.raises(RuntimeError, match="wildcard CORS"):
        Settings(cors_origins=["*"])


def test_database_url_sqlite_default():
    """When DATABASE_URL is unset, SQLite is used locally."""
    from app.config import Settings

    settings = Settings(database_url=None)
    assert settings.resolved_database_url == "sqlite:///./phikila.db"


def test_database_url_postgres_normalised():
    """postgres:// is normalised to postgresql+psycopg2://."""
    from app.config import Settings

    settings = Settings(database_url="postgres://user:pass@host:5432/db")
    assert settings.resolved_database_url == "postgresql+psycopg2://user:pass@host:5432/db"


def test_database_url_postgresql_normalised():
    """postgresql:// is also normalised."""
    from app.config import Settings

    settings = Settings(database_url="postgresql://user:pass@host:5432/db")
    assert settings.resolved_database_url == "postgresql+psycopg2://user:pass@host:5432/db"


def test_is_production_detection():
    """is_production reflects environment and VERCEL env var."""
    from app.config import Settings

    settings = Settings(environment="production")
    assert settings.is_production is True

    settings = Settings(environment="development")
    assert settings.is_production is False
