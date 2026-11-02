"""Isolated Vercel function for Library endpoints."""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.datastructures import QueryParams

from app.config import settings
from app.modules.library.router import router as library_router
from app.modules.platform.router import router as platform_router

app = FastAPI(title="Phikila Library API", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-School-Id"],
)

@app.middleware("http")
async def restore_library_path(request: Request, call_next):
    original_path = request.query_params.get("__path")
    if original_path:
        if not (original_path.startswith("/api/v1/library/") or original_path.startswith("/api/v1/platform/")) and original_path not in {"/api/v1/library", "/health"}:
            return JSONResponse({"detail": "Invalid Library API route."}, status_code=404)
        request.scope["path"] = original_path
        request.scope["raw_path"] = original_path.encode("utf-8")
        remaining = [(key, value) for key, value in request.query_params.multi_items() if key != "__path"]
        request.scope["query_string"] = str(QueryParams(remaining)).encode("utf-8")
    return await call_next(request)

@app.get("/health")
def health():
    return {"status": "ok", "module": "library"}

app.include_router(library_router, prefix="/api/v1")
app.include_router(platform_router, prefix="/api/v1/platform")
