"""Domain-specific parsers that turn raw OCR text into structured data.

Each parser takes an ``OCRResult`` (from ``backends.py``) and returns a
dictionary suitable for the API response.  The parsers are intentionally
lenient — school documents vary wildly in formatting, so they extract what
they can and mark uncertain fields as ``null``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Exam / result sheet parser
# ---------------------------------------------------------------------------

@dataclass
class StudentScore:
    name: str
    admission_no: str | None = None
    scores: dict[str, float] = field(default_factory=dict)  # subject → score
    total: float | None = None
    grade: str | None = None
    position: int | None = None


def parse_exam_sheet(lines: list[str]) -> dict[str, Any]:
    """Extract student scores from a scanned exam result sheet.

    Handles common formats:
      - Name  | Admission No | Subj1 | Subj2 | … | Total | Grade
      - Numbered lists: "1. John Doe – 78, 85, 92 → 255, A"
      - Tabular data with pipes or tabs
    """
    students: list[StudentScore] = []
    subjects: list[str] = []
    exam_info: dict[str, str | None] = {
        "exam_name": None,
        "term": None,
        "class_name": None,
        "subject": None,
    }

    for line in lines:
        lower = line.lower().strip()

        # Detect header metadata
        if any(kw in lower for kw in ["exam", "test", "assessment", "term", "semester"]):
            if not exam_info["exam_name"]:
                exam_info["exam_name"] = line.strip()
        if "term" in lower:
            m = re.search(r"term\s*[:\-]?\s*(\d|[IVX]+)", lower)
            if m:
                exam_info["term"] = m.group(1).upper()
        if any(kw in lower for kw in ["class", "grade", "form", "year"]):
            if not exam_info["class_name"]:
                exam_info["class_name"] = line.strip()
        if "subject" in lower or "course" in lower:
            if not exam_info["subject"]:
                exam_info["subject"] = line.strip()

    # --- Try to detect a table header row to find subject names ---
    for i, line in enumerate(lines):
        if re.search(r"\b(name|student|admission)\b", line, re.I):
            # This looks like a header row — extract column names
            parts = re.split(r"\s*[|\t]+\s*", line.strip())
            # Skip known non-subject columns
            skip = {"name", "student", "admission", "no", "no.", "roll", "reg",
                    "total", "grade", "position", "rank", "avg", "average", "rem"}
            subjects = [p.strip() for p in parts
                        if p.strip().lower().strip(".") not in skip and p.strip()]
            break

    # --- Parse student rows ---
    # Pattern 1: "1. John Doe  001  78  85  92  255  A"
    numbered_re = re.compile(
        r"^\d+[.)]\s*(.+?)"               # name
        r"(?:\s+(\S+))?"                    # optional admission no
        r"(?:\s+([\d.,]+))+"                # one or more scores
    )
    # Pattern 2: "John Doe | 001 | 78 | 85 | A"
    pipe_re = re.compile(
        r"^(.+?)\s*[|\t]\s*(.+?)\s*[|\t]\s*(.+)"
    )

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Skip header-like lines
        if re.match(r"^(name|student|#|no|subject|total|grade)", line, re.I):
            continue

        # Try pipe-separated
        pipe_match = pipe_re.match(line)
        if pipe_match:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 3:
                name = parts[0]
                admission_no = None
                scores: dict[str, float] = {}
                total = None
                grade = None

                # Try to identify admission number (alphanumeric, short)
                idx = 1
                if idx < len(parts) and re.match(r"^[A-Z]?\d{2,8}$", parts[idx]):
                    admission_no = parts[idx]
                    idx += 1

                # Remaining parts are scores/grades
                numeric_parts = []
                for part in parts[idx:]:
                    clean = part.replace(",", "")
                    if re.match(r"^\d+\.?\d*$", clean):
                        numeric_parts.append(float(clean))
                    elif re.match(r"^[A-Fa-f][+-]?$", part):
                        grade = part.upper()

                if subjects and len(numeric_parts) >= len(subjects):
                    for j, subj in enumerate(subjects[:len(numeric_parts)]):
                        scores[subj] = numeric_parts[j]
                    remaining = numeric_parts[len(subjects):]
                    if remaining:
                        total = remaining[0]
                else:
                    for j, val in enumerate(numeric_parts):
                        label = subjects[j] if j < len(subjects) else f"Score_{j+1}"
                        scores[label] = val
                    if len(numeric_parts) > len(subjects):
                        total = numeric_parts[-1]

                students.append(StudentScore(
                    name=name,
                    admission_no=admission_no,
                    scores=scores,
                    total=total,
                    grade=grade,
                ))

    # --- Fallback: detect numeric clusters ---
    if not students:
        for line in lines:
            numbers = re.findall(r"\b(\d{1,3})\b", line)
            if len(numbers) >= 2:
                # Extract any name-like text before the numbers
                text_part = re.split(r"\s+\d", line)[0].strip()
                text_part = re.sub(r"^\d+[.)]\s*", "", text_part)
                if text_part and len(text_part) > 1:
                    scores = {f"Score_{j+1}": float(n) for j, n in enumerate(numbers)}
                    students.append(StudentScore(name=text_part, scores=scores))

    return {
        "type": "exam_sheet",
        "exam_info": exam_info,
        "subjects": subjects,
        "students": [
            {
                "name": s.name,
                "admission_no": s.admission_no,
                "scores": s.scores,
                "total": s.total,
                "grade": s.grade,
                "position": s.position,
            }
            for s in students
        ],
        "total_students": len(students),
    }


# ---------------------------------------------------------------------------
# Student document parser (certificates, transcripts, IDs)
# ---------------------------------------------------------------------------

def parse_student_document(lines: list[str]) -> dict[str, Any]:
    """Extract key fields from a student certificate, transcript, or ID."""
    text = "\n".join(lines)
    result: dict[str, Any] = {"type": "student_document", "fields": {}}
    fields = result["fields"]

    patterns: list[tuple[str, str, str | None]] = [
        # (field_name, regex, group_index)
        ("student_name", r"(?:name|student|candidate)[:\s]+([A-Z][A-Za-z\s.'-]+)", 1),
        ("admission_no", r"(?:admission|reg(?:istration)?|roll)\s*(?:no|number|#)?[:\s]*([A-Z]?\d{3,10})", 1),
        ("date_of_birth", r"(?:dob|date\s*of\s*birth|born)[:\s]*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})", 1),
        ("gender", r"(?:gender|sex)[:\s]*(male|female|m|f)\b", 1),
        ("class_name", r"(?:class|grade|form|year|level)[:\s]*([A-Za-z0-9\s]+?)(?:\s*[,\n]|\s*$)", 1),
        ("school_name", r"(?:school|institution|academy|college)[:\s]+([A-Z][A-Za-z\s&'.]+)", 1),
        ("exam_year", r"(?:year|session|exam(?:ination)?(?:\s*year)?)[:\s]*(\d{4})", 1),
        ("total_score", r"(?:total|aggregate|score)[:\s]*(\d+)", 1),
        ("grade", r"(?:grade|class)[:\s]*([A-Fa-f][+-]?)\b", 1),
        ("result_status", r"(?:result|status|outcome)[:\s]*(pass(?:ed)?|fail(?:ed)?|distinction|credit|merit)", 1),
    ]

    for field_name, pattern, group in patterns:
        m = re.search(pattern, text, re.I)
        if m:
            fields[field_name] = m.group(group).strip()

    # Extract any visible numbers that could be scores
    all_numbers = re.findall(r"\b(\d{1,3})\b", text)
    if all_numbers:
        result["detected_numbers"] = [int(n) for n in all_numbers[:20]]

    return result


# ---------------------------------------------------------------------------
# Timetable parser
# ---------------------------------------------------------------------------

def parse_timetable(lines: list[str]) -> dict[str, Any]:
    """Extract timetable entries from a scanned schedule.

    Looks for patterns like:
      - "Monday  8:00-9:00  Mathematics  Mr. Smith  Room 101"
      - Grid layouts with days as columns
    """
    DAYS = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
    time_re = re.compile(r"(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})")

    entries: list[dict[str, Any]] = []
    current_day: str | None = None

    for line in lines:
        lower = line.lower().strip()
        if not line.strip():
            continue

        # Check if this line starts with a day name
        for day in DAYS:
            if lower.startswith(day):
                current_day = day.capitalize()
                # The rest of the line might have an entry
                remainder = re.sub(rf"^{day}\s*[:\-.]*\s*", "", line.strip(), flags=re.I)
                if remainder:
                    # Try to parse time + subject from remainder
                    tm = time_re.search(remainder)
                    if tm:
                        before = remainder[:tm.start()].strip()
                        after = remainder[tm.end():].strip()
                        parts = [p.strip() for p in re.split(r"[|\t]+", after) if p.strip()] or [after]
                        entries.append({
                            "day": current_day,
                            "start_time": tm.group(1).replace(".", ":"),
                            "end_time": tm.group(2).replace(".", ":"),
                            "subject": before or None,
                            "teacher": parts[0] if len(parts) > 0 else None,
                            "room": parts[1] if len(parts) > 1 else None,
                        })
                break

        # If no day header, check for time entries
        if current_day:
            tm = time_re.search(line)
            if tm:
                before = line[:tm.start()].strip()
                after = line[tm.end():].strip()
                parts = [p.strip() for p in re.split(r"[|\t]+", after) if p.strip()] or [after]
                entries.append({
                    "day": current_day,
                    "start_time": tm.group(1).replace(".", ":"),
                    "end_time": tm.group(2).replace(".", ":"),
                    "subject": before or None,
                    "teacher": parts[0] if len(parts) > 0 else None,
                    "room": parts[1] if len(parts) > 1 else None,
                })

    return {
        "type": "timetable",
        "entries": entries,
        "days_detected": list({e["day"] for e in entries}),
        "total_periods": len(entries),
    }


# ---------------------------------------------------------------------------
# General document parser
# ---------------------------------------------------------------------------

def parse_general(lines: list[str]) -> dict[str, Any]:
    """Generic document — extract paragraphs, lists, and key-value pairs."""
    text = "\n".join(lines)

    # Detect key-value pairs (e.g. "Name: John", "Date: 2024-01-15")
    kv_pairs: dict[str, str] = {}
    for line in lines:
        m = re.match(r"^([A-Za-z\s_]{2,30})\s*[:=\-]\s*(.+)$", line.strip())
        if m:
            key = m.group(1).strip().lower().replace(" ", "_")
            val = m.group(2).strip()
            kv_pairs[key] = val

    # Detect bullet/numbered lists
    list_items = [line.strip() for line in lines
                  if re.match(r"^\s*[-•*]\s+|^\s*\d+[.)]\s+", line.strip())]

    # Detect headers (lines that are short, uppercase or title case, no period)
    headers = [line.strip() for line in lines
               if line.strip() and len(line.strip()) < 80
               and not line.strip().endswith(".")
               and (line.strip().isupper() or line.strip().istitle())]

    # Detect emails and phone numbers
    emails = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)
    phones = re.findall(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}", text)

    return {
        "type": "general",
        "key_value_pairs": kv_pairs,
        "list_items": list_items,
        "headers": headers[:10],
        "emails": emails,
        "phones": phones,
        "line_count": len(lines),
    }


# ---------------------------------------------------------------------------
# Auto-detect and parse
# ---------------------------------------------------------------------------

def generate_pdf_bytes(scan_data: dict[str, Any], filename: str = "scan") -> bytes:
    """Generate a PDF from structured scan data (server-side).

    Uses reportlab if available, otherwise returns empty bytes.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        import io
    except ImportError:
        return b""

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    elements: list = []

    # Title
    elements.append(Paragraph(f"Phikila Document Scan", styles["Title"]))
    elements.append(Paragraph(f"File: {filename}", styles["Normal"]))
    doc_type = scan_data.get("type", "unknown")
    elements.append(Paragraph(f"Type: {doc_type.replace('_', ' ').title()}", styles["Normal"]))
    elements.append(Spacer(1, 12))

    if doc_type == "exam_sheet":
        students = scan_data.get("students", [])
        subjects = scan_data.get("subjects", [])
        if students:
            header = ["#", "Name"] + subjects[:6] + ["Total"]
            table_data = [header]
            for i, s in enumerate(students):
                row = [str(i + 1), s.get("name", "")]
                scores = s.get("scores", {})
                for sub in subjects[:6]:
                    row.append(str(scores.get(sub, "—")))
                row.append(str(s.get("total", "—")))
                table_data.append(row)
            t = Table(table_data)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F2A47")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f3ec")]),
            ]))
            elements.append(t)

    elif doc_type == "timetable":
        entries = scan_data.get("entries", [])
        if entries:
            header = ["Day", "Time", "Subject", "Teacher", "Room"]
            table_data = [header]
            for e in entries:
                table_data.append([
                    e.get("day", ""),
                    f"{e.get('start_time', '')}–{e.get('end_time', '')}",
                    e.get("subject", "—"),
                    e.get("teacher", "—"),
                    e.get("room", "—"),
                ])
            t = Table(table_data)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F2A47")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            elements.append(t)
    else:
        fields = scan_data.get("fields", scan_data.get("key_value_pairs", {}))
        for k, v in fields.items():
            elements.append(Paragraph(f"<b>{k.replace('_', ' ').title()}:</b> {v}", styles["Normal"]))

    doc.build(elements)
    return buf.getvalue()


def auto_parse(lines: list[str]) -> dict[str, Any]:
    """Auto-detect document type and parse accordingly."""
    text_lower = "\n".join(lines).lower()

    # Check for exam-related keywords
    exam_keywords = ["exam", "test", "score", "mark", "grade", "result",
                     "assessment", "total", "average", "position", "rank"]
    if sum(1 for kw in exam_keywords if kw in text_lower) >= 3:
        return parse_exam_sheet(lines)

    # Check for timetable keywords
    timetable_keywords = ["monday", "tuesday", "wednesday", "thursday", "friday",
                          "timetable", "schedule", "period", "lesson"]
    if sum(1 for kw in timetable_keywords if kw in text_lower) >= 2:
        return parse_timetable(lines)

    # Check for student document keywords
    student_keywords = ["student", "admission", "certificate", "transcript",
                        "candidate", "registration", "enrol"]
    if sum(1 for kw in student_keywords if kw in text_lower) >= 2:
        return parse_student_document(lines)

    # Fallback to general
    return parse_general(lines)
