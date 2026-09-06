"""Application settings loaded from environment variables."""

import os
from functools import lru_cache


class Settings:
    """Small dependency-free settings object for local and serverless deployments."""

    def __init__(self) -> None:
        vercel_environment = os.getenv("VERCEL_ENV", "").lower()
        self.environment = "production" if vercel_environment == "production" else os.getenv("ENVIRONMENT", "development").lower()
        self.database_url = self._database_url(os.getenv("DATABASE_URL"))
        production_origins = ["https://www.phikila.com", "https://phikila.com"]
        default_cors_origins = ",".join(production_origins) if self.is_production else "http://localhost:5173,http://127.0.0.1:5173"
        configured_origins = self._csv(os.getenv("CORS_ORIGINS", default_cors_origins))
        if self.is_production:
            configured_origins = list(dict.fromkeys([*configured_origins, *production_origins]))
        self.cors_origins = configured_origins
        if "*" in self.cors_origins:
            raise RuntimeError("CORS_ORIGINS must list exact trusted origins; wildcard CORS is not allowed")
        built_in_production_regex = r"https://([a-z0-9-]+\.)*phikila\.com|https://[a-z0-9-]+\.vercel\.app"
        configured_regex = os.getenv("CORS_ORIGIN_REGEX")
        self.cors_origin_regex = (f"(?:{configured_regex})|(?:{built_in_production_regex})" if configured_regex else built_in_production_regex) if self.is_production else (configured_regex or None)
        self.supabase_url = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")).rstrip("/")
        self.supabase_anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")
        self.supabase_jwt_audience = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
        self.supabase_jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "")
        self.app_jwt_secret = os.getenv("APP_JWT_SECRET", "")
        self.resend_api_key = os.getenv("RESEND_API_KEY", "")
        self.resend_from_email = os.getenv("RESEND_FROM_EMAIL", "Phikila School System <onboarding@resend.dev>")
        self.microsoft_client_id = os.getenv("MICROSOFT_CLIENT_ID", "")
        self.microsoft_client_secret = os.getenv("MICROSOFT_CLIENT_SECRET", "")
        self.microsoft_redirect_uri = os.getenv("MICROSOFT_REDIRECT_URI", "")
        self.microsoft_frontend_redirect = os.getenv("MICROSOFT_FRONTEND_REDIRECT", "")
        self.microsoft_token_encryption_key = os.getenv("MICROSOFT_TOKEN_ENCRYPTION_KEY", "")

    @staticmethod
    def _csv(value: str) -> list[str]:
        return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]

    @staticmethod
    def _database_url(value: str | None) -> str:
        if not value:
            if os.getenv("VERCEL") or os.getenv("ENVIRONMENT", "").lower() == "production":
                raise RuntimeError("DATABASE_URL is not configured. Add the Supabase transaction-pooler connection string to the deployment environment and redeploy.")
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
