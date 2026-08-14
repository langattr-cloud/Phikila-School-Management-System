from pathlib import Path, PurePosixPath

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.modules.academics.router import router as academics_router
from app.modules.authentication.router import router as auth_router
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.school.router import router as school_router
from app.modules.users.router import router as users_router

# Directory where the Vite frontend is built (frontend/ -> frontend/dist).
# Vercel's explicit build command populates it before the FastAPI function is
# packaged. Vercel can promote mounted static files to its CDN, while FastAPI
# remains the source of truth for local serving and server-side SPA fallback.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


class SPAStaticFiles(StaticFiles):
    """Serve real files first and fall back to index.html for browser routes.

    A missing path with a file extension remains a 404, so a missing JavaScript,
    CSS, image, or favicon is never returned as HTML. Unknown API paths also
    remain API 404s instead of being swallowed by the frontend fallback.
    """

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


# ==========================================
# PHASE 2+: ROUTERS TO ENABLE IN LATER PHASES
# ==========================================
from app.modules.departments.router import router as departments_router
from app.modules.subjects.router import router as subjects_router

# ==========================================
# PHASE 3: PEOPLE & RECORDS (Uncomment when ready)
# ==========================================
from app.modules.teachers.router import router as teachers_router
from app.modules.students.router import router as students_router
from app.modules.class_register.router import router as class_register_router

# ==========================================
# PHASE 4: OPERATIONS (Uncomment when ready)
# ==========================================
from app.modules.timetable.router import router as timetable_router
from app.modules.examinations.router import router as examinations_router

# ==========================================
# PHASE 5: OUTPUTS (Uncomment when ready)
# ==========================================
# from app.modules.reports.router import router as reports_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Phikila School System API",
        description="Backend API for Phikila School System - Phased Modular Architecture",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Same-origin traffic needs no CORS headers. Enable CORS only when exact
    # trusted cross-origin frontends (or a deliberately scoped preview regex)
    # have been configured. Settings rejects wildcard CORS origins.
    if settings.cors_origins or settings.cors_origin_regex:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_origin_regex=settings.cors_origin_regex,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "Accept"],
        )

    @app.get("/health", tags=["Health"])
    def health_check():
        return {"status": "ok", "environment": settings.environment}

    # ------------------------------------------
    # Register Phase 1 Routers
    # ------------------------------------------
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

    # ------------------------------------------
    # Register Phase 2 Routers (Uncomment when ready)
    # ------------------------------------------
    app.include_router(
        academics_router,
        prefix="/api/v1/academics",
        tags=["Academics"],
        dependencies=protected,
    )
    app.include_router(departments_router, prefix="/api/v1/departments", tags=["Departments"], dependencies=protected)
    app.include_router(subjects_router, prefix="/api/v1/subjects", tags=["Subjects"], dependencies=protected)

    # ------------------------------------------
    # Register Phase 3 Routers (Uncomment when ready)
    # ------------------------------------------
    app.include_router(teachers_router, prefix="/api/v1/teachers", tags=["Teachers"], dependencies=protected)
    app.include_router(students_router, prefix="/api/v1/students", tags=["Students"], dependencies=protected)
    app.include_router(class_register_router, prefix="/api/v1/class-register", tags=["Class Register"], dependencies=protected)

    # ------------------------------------------
    # Register Phase 4 Routers (Uncomment when ready)
    # ------------------------------------------
    app.include_router(timetable_router, prefix="/api/v1/timetable", tags=["Timetable"], dependencies=protected)
    app.include_router(examinations_router, prefix="/api/v1/examinations", tags=["Examinations"], dependencies=protected)

    # ------------------------------------------
    # Register Phase 5 Routers (Uncomment when ready)
    # ------------------------------------------
    # app.include_router(reports_router, prefix="/api/v1/reports", tags=["Reports"])

    # ------------------------------------------
    # Serve the built frontend at / so the API and web app share one domain.
    # Mounted last so API routes, health, and documentation win route matching.
    # ------------------------------------------
    if FRONTEND_DIST.is_dir():
        app.mount(
            "/",
            SPAStaticFiles(directory=FRONTEND_DIST, html=True),
            name="frontend",
        )
    elif settings.is_production:
        raise RuntimeError(
            "frontend/dist is missing; Vercel must run the configured frontend build "
            "before packaging the FastAPI application"
        )

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
