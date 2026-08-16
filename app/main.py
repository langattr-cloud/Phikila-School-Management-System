"""Phikila School System – FastAPI application factory."""

import logging
import time
from pathlib import Path, PurePosixPath

import structlog
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.core.database import engine
from app.modules.academics.router import router as academics_router
from app.modules.authentication.router import router as auth_router
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.school.router import router as school_router
from app.modules.users.router import router as users_router

# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)

logger = structlog.get_logger("phikila")

# Directory where the Vite frontend is built (frontend/ -> frontend/dist).
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# ---------------------------------------------------------------------------
# Rate limiter (shared across all routes)
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


# ---------------------------------------------------------------------------
# SPA static files with fallback
# ---------------------------------------------------------------------------
class SPAStaticFiles(StaticFiles):
    """Serve real files first and fall back to index.html for browser routes."""

    backend_roots = frozenset({"api", "health", "docs", "redoc", "openapi.json"})

    async def get_response(self, path: str, scope: dict):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            is_frontend_route = (
                error.status_code == 404
                and scope["method"] in {"GET", "HEAD"}
                and not PurePosixPath(path).suffix
                and path.split("/", 1)[0] not in self.backend_roots
            )
            if not is_frontend_route:
                raise
        return await super().get_response("index.html", scope)


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------
def create_app() -> FastAPI:
    app = FastAPI(
        title="Phikila School System API",
        description="Backend API for Phikila School System",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.state.limiter = limiter

    # ------------------------------------------------------------------
    # Middleware: structured request logging
    # ------------------------------------------------------------------
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.perf_counter()
        request_id = request.headers.get("x-request-id", "")
        if not request_id:
            request_id = f"req-{int(time.time() * 1000)}-{id(request) & 0xFFFF:04x}"
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("Request failed")
            raise
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "request_completed",
            status_code=response.status_code,
            elapsed_ms=round(elapsed_ms, 2),
        )
        response.headers["x-request-id"] = request_id
        return response

    # ------------------------------------------------------------------
    # Middleware: security headers
    # ------------------------------------------------------------------
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self' "
            + " ".join(settings.cors_origins)
            + "; "
            "frame-ancestors 'none'"
        )
        return response

    # ------------------------------------------------------------------
    # CORS (only when configured)
    # ------------------------------------------------------------------
    if settings.cors_origins or settings.cors_origin_regex:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_origin_regex=settings.cors_origin_regex,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "Accept"],
        )

    # ------------------------------------------------------------------
    # Health check with DB connectivity
    # ------------------------------------------------------------------
    @app.get("/health", tags=["Health"])
    def health_check():
        from sqlalchemy import text

        db_ok = False
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            logger.exception("Database health check failed")

        return {
            "status": "ok" if db_ok else "degraded",
            "environment": settings.environment,
            "database": "connected" if db_ok else "disconnected",
        }

    # ------------------------------------------------------------------
    # Rate limit error handler
    # ------------------------------------------------------------------
    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Try again later."},
        )

    # ------------------------------------------------------------------
    # Register Phase 1 Routers
    # ------------------------------------------------------------------
    protected = [Depends(get_supabase_claims)]
    app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
    app.include_router(
        users_router,
        prefix="/api/v1/users",
        tags=["Users"],
        dependencies=protected,
    )
    app.include_router(
        school_router,
        prefix="/api/v1/school",
        tags=["School Profile"],
        dependencies=protected,
    )

    # ------------------------------------------------------------------
    # Phase 2 Routers
    # ------------------------------------------------------------------
    app.include_router(
        academics_router,
        prefix="/api/v1/academics",
        tags=["Academics"],
        dependencies=protected,
    )

    # Phase 3-5 routers are scaffolded and can be enabled when modules are ready:
    #   from app.modules.teachers.router import router as teachers_router
    #   from app.modules.students.router import router as students_router
    #   from app.modules.timetable.router import router as timetable_router
    #   from app.modules.examinations.router import router as examinations_router
    #   from app.modules.reports.router import router as reports_router

    # ------------------------------------------------------------------
    # Serve the built frontend at / (SPA fallback for client routes)
    # ------------------------------------------------------------------
    if FRONTEND_DIST.is_dir():
        app.mount(
            "/",
            SPAStaticFiles(directory=FRONTEND_DIST, html=True),
            name="frontend",
        )
    elif settings.is_production:
        raise RuntimeError(
            "frontend/dist is missing; Vercel must run the configured frontend "
            "build before packaging the FastAPI application"
        )

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
