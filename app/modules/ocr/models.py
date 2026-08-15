"""OCR document scan tracking models."""

from __future__ import annotations

import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Float, JSON, ForeignKey, Boolean,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class OCRScan(Base):
    """Tracks each document scan / OCR request."""

    __tablename__ = "ocr_scans"

    id = Column(Integer, primary_key=True, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    user_id = Column(String, nullable=False)

    # Document metadata
    filename = Column(String(255), nullable=False)
    document_type = Column(
        String(50), nullable=False,
        comment="exam_sheet | student_document | timetable | general",
    )
    file_size = Column(Integer, default=0)
    mime_type = Column(String(100))

    # OCR engine info
    backend_used = Column(String(50), comment="paddleocr | tesseract | auto")
    processing_time_ms = Column(Float, comment="Milliseconds to process")

    # Results
    parsed_data = Column(JSON, comment="Structured data extracted by the parser")
    raw_text = Column(Text, comment="Full OCR text output")
    error = Column(Text, nullable=True)

    # Status
    status = Column(
        String(20), default="pending",
        comment="pending | processing | completed | failed",
    )

    # Relationships
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
