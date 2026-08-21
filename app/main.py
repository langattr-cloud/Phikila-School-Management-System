from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.config import settings
from app.core.database import engine
from app.core.rate_limit import rate_limit_ocr, rate_limit_platform_mutation, rate_limit_scheduling_mutation
from app.modules.academics.router import router as academics_router
from app.modules.attendance.router import router as attendance_router
from app.modules.authentication.router import router as auth_router
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.email.router import router as email_router
from app.modules.examinations.router_v2 import router as exams_router
from app.modules.finance.router import router as finance_router
from app.modules.finance.operations_router import router as finance_operations_router
from app.modules.finance.account_mapping_router import router as finance_account_mapping_router
from app.modules.finance.reports_router import router as finance_reports_router
from app.modules.finance.completion_router import router as finance_completion_router
from app.modules.llm.router import router as llm_router
from app.modules.ocr.router import router as ocr_router
from app.modules.platform.router import router as platform_router
from app.modules.platform.access_approval import router as access_approval_router
from app.modules.scheduling.calendar_router import router as calendar_router
from app.modules.scheduling.events_router import router as timetable_events_router
from app.modules.scheduling.profile_router import router as timetable_profile_router
from app.modules.scheduling.router import router as scheduling_router
from app.modules.school.router import router as school_router
from app.modules.students.router_v2 import router as students_router
from app.modules.users.router import router as users_router


class SPAStaticFiles(StaticFiles):
    """Serve index.html for browser history routes while preserving asset 404s."""

    async def get_response(self, path: str, scope: dict):
        response = await super().get_response(path, scope)
        if response.status_code != 404:
            return response

        request = Request(scope)
        accept = request.headers.get("accept", "")
        if "text/html" not in accept:
            return response

        return await super().get_response("index.html", scope)


def _rate_limit_mutations(router) -> None:
    """Attach the admin rate limiter only to state-changing routes once."""
    for route in router.routes:
        if not getattr(route, "methods", set()) & {"POST", "PUT", "PATCH", "DELETE"}:
            continue
        if any(
            getattr(dep, "dependency", None) is rate_limit_platform_mutation
            for dep in getattr(route, "dependencies", [])
        ):
            continue
        route.dependencies.append(Depends(rate_limit_platform_mutation))


def _ensure_default_school() -> None:
    """Bootstrap the single-school tenant expected by existing admin claims.

    Only an empty school_info table is bootstrapped; existing school records
    are never modified.
    """
    try:
        with engine.begin() as conn:
            exists = conn.execute(
                text("SELECT to_regclass('public.school_info') IS NOT NULL")
            ).scalar()
            if not exists:
                return

            school_count = conn.execute(
                text("SELECT COUNT(*) FROM public.school_info")
            ).scalar_one()
            if school_count != 0:
                return

            conn.execute(
                text("""
                    INSERT INTO public.school_info
                        (id, name, code, is_active, created_at, updated_at)
                    VALUES
                        (1, 'Primary', 'PRI.', TRUE, now(), now())
                    ON CONFLICT (id) DO NOTHING
                """)
            )
    except Exception:
        return


def create_app() -> FastAPI:
    _ensure_default_school()
    app = FastAPI(
        title="Phikila School System API",
        description="Backend API for Phikila School System - Phased Modular Architecture",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )
    if settings.cors_origins or settings.cors_origin_regex:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_origin_regex=settings.cors_origin_regex,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["*"],
        )
    from app.middleware import SecurityHeadersMiddleware, AccessLogMiddleware
    app.add_middleware(AccessLogMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/health", tags=["Health"])
    def health_check():
        from app.modules.scheduling.solver import ORTOOLS_AVAILABLE
        return {
            "status": "ok",
            "environment": settings.environment,
            "solver_available": ORTOOLS_AVAILABLE,
        }

    @app.get("/ready", tags=["Health"])
    def readiness_check():
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return {"status": "ready", "database": "connected"}
        except Exception as exc:
            from fastapi.responses import JSONResponse
            return JSONResponse({"status": "not_ready", "error": str(exc)}, status_code=503)

    protected = [Depends(get_supabase_claims)]
    app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
    app.include_router(users_router, prefix="/api/v1/users", tags=["Users"], dependencies=protected)
    app.include_router(school_router, prefix="/api/v1/school", tags=["School Profile"], dependencies=protected)
    scheduling_router.routes[:] = [
        route for route in scheduling_router.routes
        if not (getattr(route, "path", None) == "/calendar" and "PUT" in getattr(route, "methods", set()))
    ]
    app.include_router(calendar_router, prefix="/api/v1/scheduling", tags=["Scheduling"], dependencies=[Depends(rate_limit_scheduling_mutation)])
    app.include_router(scheduling_router, prefix="/api/v1/scheduling", tags=["Scheduling"], dependencies=[Depends(rate_limit_scheduling_mutation)])
    app.include_router(timetable_events_router, prefix="/api/v1/scheduling", tags=["Scheduling Events"], dependencies=[Depends(rate_limit_scheduling_mutation)])
    app.include_router(timetable_profile_router, prefix="/api/v1/scheduling", tags=["Timetable Profiles"], dependencies=[Depends(rate_limit_scheduling_mutation)])
    app.include_router(students_router, prefix="/api/v1", tags=["Students"])
    app.include_router(attendance_router, prefix="/api/v1", tags=["Attendance"])
    app.include_router(exams_router, prefix="/api/v1", tags=["Examinations"])
    app.include_router(finance_router, prefix="/api/v1", tags=["Finance"])
    app.include_router(finance_operations_router, prefix="/api/v1", tags=["Finance Operations"])
    app.include_router(finance_completion_router, prefix="/api/v1", tags=["Finance Treasury"])
    app.include_router(finance_account_mapping_router, prefix="/api/v1", tags=["Finance Account Mapping"])
    app.include_router(finance_reports_router, prefix="/api/v1", tags=["Finance Reports"])
    app.include_router(ocr_router, prefix="/api/v1/ocr", tags=["Document OCR"], dependencies=[Depends(rate_limit_ocr)])
    _rate_limit_mutations(access_approval_router)
    _rate_limit_mutations(platform_router)
    _rate_limit_mutations(llm_router)
    app.include_router(access_approval_router, prefix="/api/v1/platform", tags=["Platform Access Approval"])
    app.include_router(platform_router, prefix="/api/v1/platform", tags=["Platform"])
    app.include_router(llm_router, prefix="/api/v1/llm", tags=["LLM Providers"])
    app.include_router(email_router, prefix="/api/v1/email", tags=["Email & Notifications"])
    app.include_router(academics_router, prefix="/api/v1/academics", tags=["Academics"], dependencies=protected)

    frontend_dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"
    if frontend_dist.is_dir():
        app.mount("/", SPAStaticFiles(directory=frontend_dist, html=True), name="frontend")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
