"""Application settings loaded from environment variables."""

import os
from functools import lru_cache


class Settings:
    """Small dependency-free settings object for local and serverless deployments."""

    def __init__(self) -> None:
        # VERCEL_ENV is a system variable. Prefer it for the production target so
        # a stale/missing ENVIRONMENT setting can never make production report
        # itself as development. ENVIRONMENT remains explicit and recommended.
        vercel_environment = os.getenv("VERCEL_ENV", "").lower()
        self.environment = (
            "production"
            if vercel_environment == "production"
            else os.getenv("ENVIRONMENT", "development").lower()
        )
        self.database_url = self._database_url(os.getenv("DATABASE_URL"))

        # Same-origin browser requests do not use CORS. Local development gets
        # the two Vite origins by default; Vercel gets no cross-origin access
        # unless exact origins are deliberately configured.
        default_cors_origins = (
            ""
            if self.is_production
            else "http://localhost:5173,http://127.0.0.1:5173"
        )
        self.cors_origins = self._csv(
            os.getenv("CORS_ORIGINS", default_cors_origins)
        )
        if "*" in self.cors_origins:
            raise RuntimeError(
                "CORS_ORIGINS must list exact trusted origins; wildcard CORS is not allowed"
            )
        self.cors_origin_regex = os.getenv("CORS_ORIGIN_REGEX") or None

        self.supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.supabase_jwt_audience = os.getenv(
            "SUPABASE_JWT_AUDIENCE", "authenticated"
        )
        # Only needed by older Supabase projects that still issue HS256 tokens.
        self.supabase_jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "")
        self.app_jwt_secret = os.getenv("APP_JWT_SECRET", "")

        # Resend Email integration
        self.resend_api_key = os.getenv(
            "RESEND_API_KEY", "re_S8do2b6i_4bfLTUMJsUK5uJU27CmeDhpv"
        )
        self.resend_from_email = os.getenv(
            "RESEND_FROM_EMAIL", "Phikila School System <onboarding@resend.dev>"
        )

    @staticmethod
    def _csv(value: str) -> list[str]:
        return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]

    @staticmethod
    def _database_url(value: str | None) -> str:
        # SQLite keeps initial local setup simple; production must always supply DATABASE_URL.
        if not value:
            if os.getenv("VERCEL") or os.getenv("ENVIRONMENT", "").lower() == "production":
                raise RuntimeError(
                    "DATABASE_URL is not configured. In the Vercel dashboard for the "
                    "project (Project Settings > Environment Variables) add DATABASE_URL "
                    "with the Supabase transaction-pooler connection string (Project "
                    "Settings > Database > Connection string > Transaction pooler, port "
                    "6543, append ?sslmode=require), then redeploy. Example: "
                    "postgresql://postgres.PROJECT_REF:PASSWORD@REGION.pooler.supabase.com:6543/postgres?sslmode=require"
                )
            return "sqlite:///./phikila.db"

        # SQLAlchemy needs an explicit driver. Supabase provides a postgresql:// URL.
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg2://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg2://", 1)
        return value

    @property
    def is_production(self) -> bool:
        # Treat previews as production-like for database/JWT safety even though
        # their health response can retain an explicitly configured preview label.
        return self.environment == "production" or bool(os.getenv("VERCEL"))

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
