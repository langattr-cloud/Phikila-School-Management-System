"""OCR API schemas."""

from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from typing import Any


class OCRScanResponse(BaseModel):
    id: int
    school_id: int
    filename: str
    document_type: str
    backend_used: str | None = None
    processing_time_ms: float | None = None
    parsed_data: dict[str, Any] | None = None
    raw_text: str | None = None
    error: str | None = None
    status: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class OCRScanRequest(BaseModel):
    """Optional overrides when uploading a document."""
    document_type: str | None = Field(
        default=None,
        description="Force document type: exam_sheet, student_document, timetable, general. Omit for auto-detect.",
    )
    backend: str | None = Field(
        default=None,
        description="Force OCR backend: paddleocr, tesseract, auto. Omit for server default.",
    )
