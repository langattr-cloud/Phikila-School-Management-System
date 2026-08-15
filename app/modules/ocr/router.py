"""Document OCR API — scan exam papers, student documents, timetables, and general files.

Uploaded images are processed through a pluggable OCR backend (PaddleOCR or
Tesseract), then domain-specific parsers extract structured data.

Endpoints:
  POST   /scan              Upload a document and run OCR + parsing
  GET    /scans             List recent scans for the school
  GET    /scans/{id}        Get a single scan result
  DELETE /scans/{id}        Delete a scan
  GET    /backends          List available OCR backends
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role

from . import models as m
from . import schemas as s
from .backends import get_backend, OCRResult
from .parsers import (
    auto_parse, parse_exam_sheet, parse_student_document,
    parse_timetable, parse_general, generate_pdf_bytes,
)

router = APIRouter()

# 10 MB upload limit
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp",
    "application/pdf",
}

PARSER_MAP = {
    "exam_sheet": parse_exam_sheet,
    "student_document": parse_student_document,
    "timetable": parse_timetable,
    "general": parse_general,
}


def _ocr_and_parse(
    image_bytes: bytes,
    document_type: str | None,
    backend_name: str | None,
) -> tuple[OCRResult, dict[str, Any], float]:
    """Run OCR, then parse the result. Returns (result, parsed_data, ms)."""
    t0 = time.perf_counter()
    backend = get_backend(backend_name)
    ocr_result = backend.recognize(image_bytes)
    ms = (time.perf_counter() - t0) * 1000

    lines = ocr_result.all_lines
    if document_type and document_type in PARSER_MAP:
        parsed = PARSER_MAP[document_type](lines)
    else:
        parsed = auto_parse(lines)

    return ocr_result, parsed, ms


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/scan", response_model=s.OCRScanResponse, status_code=201)
def scan_document(
    file: UploadFile = File(...),
    document_type: str | None = Query(default=None),
    backend: str | None = Query(default=None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler", "teacher")),
):
    """Upload an image/PDF and get OCR results with structured extraction."""
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unsupported file type: {file.content_type}. "
            f"Accepted: {', '.join(sorted(ALLOWED_TYPES))}",
        )

    content = file.file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File too large ({len(content)} bytes). Maximum is {MAX_UPLOAD_BYTES} bytes.",
        )
    if len(content) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")

    # Create the scan record
    scan = m.OCRScan(
        school_id=principal.school_id,
        user_id=principal.user_id,
        filename=file.filename or "unnamed",
        document_type=document_type or "auto",
        file_size=len(content),
        mime_type=file.content_type,
        status="processing",
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    # Process
    try:
        ocr_result, parsed_data, ms = _ocr_and_parse(content, document_type, backend)
        scan.backend_used = ocr_result.backend
        scan.processing_time_ms = round(ms, 1)
        scan.raw_text = ocr_result.full_text
        scan.parsed_data = parsed_data
        scan.document_type = parsed_data.get("type", scan.document_type)
        scan.status = "completed"
    except Exception as exc:
        scan.status = "failed"
        scan.error = str(exc)

    db.commit()
    db.refresh(scan)
    return scan


@router.get("/scans", response_model=list[s.OCRScanResponse])
def list_scans(
    limit: int = Query(default=20, ge=1, le=100),
    document_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(resolve_principal_from_scan),
):
    """List recent OCR scans for the school."""
    query = db.query(m.OCRScan).filter(m.OCRScan.school_id == principal.school_id)
    if document_type:
        query = query.filter(m.OCRScan.document_type == document_type)
    return query.order_by(m.OCRScan.created_at.desc()).limit(limit).all()


@router.get("/scans/{scan_id}", response_model=s.OCRScanResponse)
def get_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler", "teacher")),
):
    """Get a single scan result."""
    scan = (
        db.query(m.OCRScan)
        .filter(m.OCRScan.id == scan_id, m.OCRScan.school_id == principal.school_id)
        .first()
    )
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found.")
    return scan


@router.delete("/scans/{scan_id}", status_code=204)
def delete_scan(
    scan_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    """Delete a scan record."""
    scan = (
        db.query(m.OCRScan)
        .filter(m.OCRScan.id == scan_id, m.OCRScan.school_id == principal.school_id)
        .first()
    )
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found.")
    db.delete(scan)
    db.commit()


@router.get("/scans/{scan_id}/pdf")
def export_scan_pdf(
    scan_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler", "teacher")),
):
    """Export a scan result as a downloadable PDF."""
    from fastapi.responses import Response

    scan = (
        db.query(m.OCRScan)
        .filter(m.OCRScan.id == scan_id, m.OCRScan.school_id == principal.school_id)
        .first()
    )
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scan not found.")
    if scan.status != "completed" or not scan.parsed_data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Scan has no completed data to export.")

    pdf_bytes = generate_pdf_bytes(scan.parsed_data, scan.filename)
    if not pdf_bytes:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "PDF generation requires reportlab. Install with: pip install reportlab",
        )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="phikila-scan-{scan.id}.pdf"'},
    )


@router.get("/backends")
def list_backends(
    principal: Principal = Depends(require_role("admin", "scheduler", "teacher")),
):
    """List available OCR backends and which are functional."""
    backends = ["paddleocr", "tesseract", "auto"]
    available = []
    for name in backends:
        try:
            engine = get_backend(name)
            # Quick import check
            if name == "paddleocr":
                import paddleocr  # noqa: F401
            elif name == "tesseract":
                import pytesseract  # noqa: F401
            available.append({"name": name, "available": True, "label": name.upper()})
        except Exception:
            available.append({"name": name, "available": False, "label": name.upper()})
    return {"backends": available, "default": "auto"}


# ---------------------------------------------------------------------------
# Helper: reuse scheduling tenancy
# ---------------------------------------------------------------------------

# Import at module level to avoid circular imports
from app.modules.scheduling.tenancy import resolve_principal as _resolve_principal  # noqa: E402


def resolve_principal_from_scan(
    principal: Principal = Depends(_resolve_principal),
) -> Principal:
    """Alias for dependency injection naming."""
    return principal
