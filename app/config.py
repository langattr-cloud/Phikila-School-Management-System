"""Application settings loaded from environment variables."""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with pydantic-settings validation.

    Loaded from environment variables. In production (Vercel), the project
    settings dashboard provides the values; locally, copy .env.example to .env.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    database_url: str | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    cors_origin_regex: str | None = None
    supabase_url: str = ""
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_secret: str = ""
    app_jwt_secret: str = ""

    # ------------------------------------------------------------------
    # Computed properties
    # ------------------------------------------------------------------
    @property
    def is_production(self) -> bool:
        """Treat Vercel production and previews as production-like."""
        return self.environment == "production" or bool(os.getenv("VERCEL"))

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_issuer}/.well-known/jwks.json"

    @property
    def resolved_database_url(self) -> str:
        """Return a SQLAlchemy-ready database URL.

        - If DATABASE_URL is unset, use SQLite locally and require one in production.
        - Normalise postgres:// / postgresql:// into postgresql+psycopg2://.
        """
        raw = self.database_url
        if not raw:
            if os.getenv("VERCEL") or self.environment == "production":
                raise RuntimeError(
                    "DATABASE_URL is not configured. In the Vercel dashboard for the "
                    '"backend project" (Project Settings > Environment Variables) add '
                    "DATABASE_URL with the Supabase transaction pooler URL. "
                    "Locally, copy .env.example to .env first."
                )
            return "sqlite:///./phikila.db"

        return raw.replace("postgres://", "postgresql+psycopg2://")

    def model_post_init(self, __context) -> None:
        if "*" in self.cors_origins:
            raise RuntimeError(
                "CORS_ORIGINS must list exact trusted origins; "
                "wildcard CORS is not allowed"
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
