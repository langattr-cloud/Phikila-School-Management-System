"""Parse Kenyan bank-to-school M-PESA payment messages into normalized data.

The account reference convention is ACCOUNT_NUMBER#ADMISSION_NUMBER. The hash is
only a separator; the two values are retained separately for matching and audit.
"""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal

_AMOUNT = re.compile(r"\b(?:KSh|KES)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.I)
_REF = re.compile(r"(?:M-PESA\s+Ref|MPESA\s+Ref|M-PESA\s+receipt|MPESA\s+receipt|Reference)\s*[:#-]?\s*([A-Z0-9]+)", re.I)
_ACCOUNT_STUDENT = re.compile(r"\b(\d{3,20})\s*#\s*([A-Za-z0-9-]+)\b")
_DATE_TIME = re.compile(r"\b(\d{1,2}/\d{1,2}/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)\b", re.I)
_BANKS = ("KCB", "Equity", "Co-operative", "NCBA", "Absa", "Stanbic", "DTB", "I&M")


def _parse_received_at(date_text: str | None, time_text: str | None) -> datetime | None:
    if not date_text or not time_text:
        return None
    date_formats = ("%d/%m/%Y", "%d/%m/%y")
    time_text = re.sub(r"\s+", " ", time_text.strip()).upper()
    for date_format in date_formats:
        try:
            date = datetime.strptime(date_text, date_format).date()
            time = datetime.strptime(time_text, "%I:%M %p").time()
            return datetime.combine(date, time)
        except ValueError:
            continue
    return None


def decode_payment_message(message: str) -> dict:
    """Extract payment details without posting or allocating money."""
    message = message or ""
    amount_match = _AMOUNT.search(message)
    ref_match = _REF.search(message)
    account_student_match = _ACCOUNT_STUDENT.search(message)
    dt_match = _DATE_TIME.search(message)

    # The structured ACCOUNT#ADMISSION reference takes precedence over any
    # incidental hash in the message. Keep the legacy #ADMISSION fallback.
    student_identifier = account_student_match.group(2) if account_student_match else None
    if not student_identifier:
        legacy_student = re.search(r"#\s*([A-Za-z0-9-]+)", message)
        student_identifier = legacy_student.group(1) if legacy_student else None

    bank = next((candidate for candidate in _BANKS if re.search(rf"\b{re.escape(candidate)}\b", message, re.I)), None)

    # Prefer the school/recipient name before the ACCOUNT#ADMISSION token.
    account_name = None
    if account_student_match:
        prefix = message[:account_student_match.start()]
        recipient = re.search(
            r"sent\s+to\s+.+?\s+account\s+(.+?)\s*$",
            prefix,
            re.I,
        )
        if recipient:
            account_name = recipient.group(1).strip(" .,:;-")
    if not account_name:
        account_match = re.search(
            r"(?:account|a/c)\s+(.+?)(?:\s+has\s+been\s+received|\s+received|\s+on\s+\d)",
            message,
            re.I,
        )
        if account_match:
            account_name = account_match.group(1).strip()

    return {
        "amount": Decimal(amount_match.group(1).replace(",", "")) if amount_match else None,
        "external_reference": ref_match.group(1).upper() if ref_match else None,
        "student_identifier": student_identifier,
        "received_at": _parse_received_at(dt_match.group(1), dt_match.group(2)) if dt_match else None,
        "account_name": account_name,
        "school_account_identifier": account_student_match.group(1) if account_student_match else None,
        "bank": bank,
        "payment_channel": "M-PESA → Bank" if re.search(r"M-PESA|MPESA", message, re.I) and bank else ("Bank" if bank else None),
        "raw_message": message,
    }
