from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings

# Directory where the Vite frontend is built (frontend/ -> frontend/dist).
# On Vercel the build command populates this before the function is packaged;
# locally, run `cd frontend && npm run build` first. Serving the built app from
# FastAPI lets the API and the frontend share one domain (no CORS needed).
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# ==========================================
# PHASE 1: FOUNDATION (Active)
# ==========================================
from app.modules.authentication.router import router as auth_router
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.users.router import router as users_router
from app.modules.school.router import router as school_router

# ==========================================
# PHASE 2: ACADEMIC SETUP (Uncomment when ready)
# ==========================================
from app.modules.academics.router import router as academics_router
# from app.modules.departments.router import router as departments_router
# from app.modules.subjects.router import router as subjects_router

# ==========================================
# PHASE 3: PEOPLE & RECORDS (Uncomment when ready)
# ==========================================
# from app.modules.teachers.router import router as teachers_router
# from app.modules.students.router import router as students_router
# from app.modules.class_register.router import router as class_register_router

# ==========================================
# PHASE 4: OPERATIONS (Uncomment when ready)
# ==========================================
# from app.modules.timetable.router import router as timetable_router
# from app.modules.examinations.router import router as examinations_router

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

    # Vercel frontend domains are supplied through CORS_ORIGINS. Never combine
    # wildcard origins with credentials, because browsers reject that response.
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
    # app.include_router(departments_router, prefix="/api/v1/departments", tags=["Departments"])
    # app.include_router(subjects_router, prefix="/api/v1/subjects", tags=["Subjects"])

    # ------------------------------------------
    # Register Phase 3 Routers (Uncomment when ready)
    # ------------------------------------------
    # app.include_router(teachers_router, prefix="/api/v1/teachers", tags=["Teachers"])
    # app.include_router(students_router, prefix="/api/v1/students", tags=["Students"])
    # app.include_router(class_register_router, prefix="/api/v1/class-register", tags=["Class Register"])

    # ------------------------------------------
    # Register Phase 4 Routers (Uncomment when ready)
    # ------------------------------------------
    # app.include_router(timetable_router, prefix="/api/v1/timetable", tags=["Timetable"])
    # app.include_router(examinations_router, prefix="/api/v1/examinations", tags=["Examinations"])

    # ------------------------------------------
    # Register Phase 5 Routers (Uncomment when ready)
    # ------------------------------------------
    # app.include_router(reports_router, prefix="/api/v1/reports", tags=["Reports"])

    # ------------------------------------------
    # Serve the built frontend at / so the API and the web app share one domain.
    # Mounted last so the API routes above (and /health, /docs) win the match.
    # ------------------------------------------
    if FRONTEND_DIST.is_dir():
        app.mount(
            "/",
            StaticFiles(directory=FRONTEND_DIST, html=True),
            name="frontend",
        )

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)