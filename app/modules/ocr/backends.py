"""Pluggable OCR backends.

Each backend implements the same ``recognize`` interface so the application
can swap engines via the ``OCR_BACKEND`` environment variable without
touching any calling code.

Supported backends:
  - ``paddleocr`` — PaddleOCR (SOTA accuracy, heavier)
  - ``tesseract`` — Tesseract via pytesseract (lighter, still good)
  - ``auto``      — tries PaddleOCR first, falls back to Tesseract
"""

from __future__ import annotations

import logging
import os
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class OCRBox:
    """A single recognised text region with bounding-box coordinates."""
    text: str
    confidence: float
    # Four corner points: top-left, top-right, bottom-right, bottom-left
    x1: int
    y1: int
    x2: int
    y2: int


@dataclass
class OCRPage:
    """All recognised text on a single page/image."""
    boxes: list[OCRBox] = field(default_factory=list)
    full_text: str = ""
    width: int = 0
    height: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def lines(self) -> list[str]:
        """Return text sorted by vertical position (top → bottom)."""
        sorted_boxes = sorted(self.boxes, key=lambda b: (b.y1, b.x1))
        return [b.text for b in sorted_boxes]


@dataclass
class OCRResult:
    """Complete result from processing one or more images."""
    pages: list[OCRPage] = field(default_factory=list)
    backend: str = ""
    error: str | None = None

    @property
    def full_text(self) -> str:
        return "\n\n".join(p.full_text for p in self.pages)

    @property
    def all_lines(self) -> list[str]:
        lines: list[str] = []
        for page in self.pages:
            lines.extend(page.lines)
        return lines


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class OCRBackend(ABC):
    """Interface that every OCR backend must satisfy."""

    name: str = "base"

    @abstractmethod
    def recognize(self, image_bytes: bytes, *, dpi: int = 300) -> OCRPage:
        """Run OCR on a single image and return structured results."""

    def recognize_multi(self, images: list[bytes], *, dpi: int = 300) -> OCRResult:
        """Process multiple images (e.g. multi-page PDF)."""
        pages = []
        for img in images:
            try:
                pages.append(self.recognize(img, dpi=dpi))
            except Exception as exc:
                logger.warning("OCR failed on one image: %s", exc)
                pages.append(OCRPage(full_text="", metadata={"error": str(exc)}))
        return OCRResult(pages=pages, backend=self.name)


# ---------------------------------------------------------------------------
# PaddleOCR backend
# ---------------------------------------------------------------------------

class PaddleOCRBackend(OCRBackend):
    """SOTA document OCR via PaddleOCR-VL / PP-StructureV3.

    Requires: pip install paddlepaddle paddleocr
    """

    name = "paddleocr"
    _instance: Any = None

    def _get_engine(self) -> Any:
        if self._instance is not None:
            return self._instance
        try:
            from paddleocr import PaddleOCR  # type: ignore[import-untyped]
            self._instance = PaddleOCR(
                use_angle_cls=True,
                lang="en",
                use_gpu=False,
                show_log=False,
            )
            return self._instance
        except ImportError:
            raise RuntimeError(
                "PaddleOCR is not installed. "
                "Install with: pip install paddlepaddle paddleocr"
            )

    def recognize(self, image_bytes: bytes, *, dpi: int = 300) -> OCRPage:
        import numpy as np
        import cv2

        engine = self._get_engine()
        # Decode image bytes → numpy array
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")

        h, w = img.shape[:2]
        result = engine.ocr(img, cls=True)
        boxes: list[OCRBox] = []
        texts: list[str] = []

        if result and result[0]:
            for line in result[0]:
                coords, (text, conf) = line[0], line[1]
                # coords are [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
                xs = [int(p[0]) for p in coords]
                ys = [int(p[1]) for p in coords]
                boxes.append(OCRBox(
                    text=text,
                    confidence=float(conf),
                    x1=min(xs), y1=min(ys),
                    x2=max(xs), y2=max(ys),
                ))
                texts.append(text)

        return OCRPage(
            boxes=boxes,
            full_text="\n".join(texts),
            width=w,
            height=h,
            metadata={"engine": "paddleocr"},
        )


# ---------------------------------------------------------------------------
# Tesseract backend
# ---------------------------------------------------------------------------

class TesseractBackend(OCRBackend):
    """Lighter OCR via Tesseract + pytesseract.

    Requires: pip install pytesseract
    System:    apt install tesseract-ocr  (Linux)
               brew install tesseract     (macOS)
    """

    name = "tesseract"

    def recognize(self, image_bytes: bytes, *, dpi: int = 300) -> OCRPage:
        try:
            import pytesseract  # type: ignore[import-untyped]
            from PIL import Image
        except ImportError:
            raise RuntimeError(
                "pytesseract is not installed. "
                "Install with: pip install pytesseract"
            )

        import io
        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size

        # Get detailed data with bounding boxes
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        boxes: list[OCRBox] = []
        texts: list[str] = []

        n = len(data["text"])
        for i in range(n):
            text = data["text"][i].strip()
            conf = float(data["conf"][i])
            if text and conf > 0:
                boxes.append(OCRBox(
                    text=text,
                    confidence=conf / 100.0,
                    x1=data["left"][i],
                    y1=data["top"][i],
                    x2=data["left"][i] + data["width"][i],
                    y2=data["top"][i] + data["height"][i],
                ))
                texts.append(text)

        full_text = pytesseract.image_to_string(img)
        return OCRPage(
            boxes=boxes,
            full_text=full_text.strip(),
            width=w,
            height=h,
            metadata={"engine": "tesseract"},
        )


# ---------------------------------------------------------------------------
# Auto-selecting wrapper
# ---------------------------------------------------------------------------

class AutoBackend(OCRBackend):
    """Tries PaddleOCR first, falls back to Tesseract."""

    name = "auto"
    _chosen: OCRBackend | None = None

    def _resolve(self) -> OCRBackend:
        if self._chosen is not None:
            return self._chosen
        try:
            backend = PaddleOCRBackend()
            backend.recognize(b"", dpi=72)  # dry-run to verify import
            self._chosen = backend
        except Exception:
            logger.info("PaddleOCR unavailable, falling back to Tesseract")
            self._chosen = TesseractBackend()
        return self._chosen

    def recognize(self, image_bytes: bytes, *, dpi: int = 300) -> OCRPage:
        return self._resolve().recognize(image_bytes, dpi=dpi)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_BACKENDS: dict[str, type[OCRBackend]] = {
    "paddleocr": PaddleOCRBackend,
    "tesseract": TesseractBackend,
    "auto": AutoBackend,
}


def get_backend(name: str | None = None) -> OCRBackend:
    """Return an OCR backend instance.

    ``name`` defaults to the ``OCR_BACKEND`` env var, falling back to
    ``auto`` (PaddleOCR → Tesseract).
    """
    chosen = (name or os.getenv("OCR_BACKEND", "auto")).lower().strip()
    cls = _BACKENDS.get(chosen)
    if cls is None:
        raise ValueError(
            f"Unknown OCR backend {chosen!r}. "
            f"Choose from: {', '.join(_BACKENDS)}"
        )
    return cls()
