"""Application settings loaded from environment variables."""

import os
from functools import lru_cache


class Settings:
    """Small dependency-free settings object for local and serverless deployments."""

    def __init__(self) -> None:
        vercel_environment = os.getenv("VERCEL_ENV", "").lower()
        self.environment = (
            "production"
            if vercel_environment == "production"
            else os.getenv("ENVIRONMENT", "development").lower()
        )
        self.database_url = self._database_url(os.getenv("DATABASE_URL"))

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

        # VITE_SUPABASE_URL is already required by the browser build. Accept it
        # as a compatibility fallback so a Vercel deployment cannot accidentally
        # enter local-auth mode simply because the server-side alias is missing.
        self.supabase_url = (
            os.getenv("SUPABASE_URL")
            or os.getenv("VITE_SUPABASE_URL", "")
        ).rstrip("/")
        # The anon/public key is safe to use for Auth's /auth/v1/user endpoint.
        # Keep the server-side name canonical, with the Vite name as a deployment
        # compatibility fallback because the same public key is already required
        # by the browser build.
        self.supabase_anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv(
            "VITE_SUPABASE_ANON_KEY", ""
        )
        self.supabase_jwt_audience = os.getenv(
            "SUPABASE_JWT_AUDIENCE", "authenticated"
        )
        self.supabase_jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "")
        self.app_jwt_secret = os.getenv("APP_JWT_SECRET", "")

        # Secrets must be supplied through the deployment environment. Never ship
        # a provider API key in source control or provide a hard-coded fallback.
        self.resend_api_key = os.getenv("RESEND_API_KEY", "")
        self.resend_from_email = os.getenv(
            "RESEND_FROM_EMAIL", "Phikila School System <onboarding@resend.dev>"
        )

    @staticmethod
    def _csv(value: str) -> list[str]:
        return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]

    @staticmethod
    def _database_url(value: str | None) -> str:
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

        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg2://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg2://", 1)
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production" or bool(os.getenv("VERCEL"))

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
