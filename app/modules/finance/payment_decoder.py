"""Parse common Kenyan school payment notifications into normalized data."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal


_AMOUNT = re.compile(r"(?:KSh|KES)\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.I)
_REF = re.compile(r"(?:M-PESA\s+Ref|MPESA\s+Ref|Reference)\s*[:#-]?\s*([A-Z0-9]+)", re.I)
_STUDENT = re.compile(r"#\s*([A-Za-z0-9-]+)")
_DATE_TIME = re.compile(r"(\d{1,2}/\d{1,2}/\d{4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)", re.I)
_ACCOUNT = re.compile(r"(?:account|a/c)\s+(.+?)(?:\s+has\s+been\s+received|\s+received|\s+on\s+\d)", re.I)


def decode_payment_message(message: str) -> dict:
    """Decode amount, external reference, student identifier and timestamp.

    The parser is intentionally conservative: it extracts evidence but does not
    decide whether a payment is safe to post. Matching and posting belong to the
    finance service layer.
    """
    amount_match = _AMOUNT.search(message)
    ref_match = _REF.search(message)
    student_match = _STUDENT.search(message)
    dt_match = _DATE_TIME.search(message)
    account_match = _ACCOUNT.search(message)

    received_at = None
    if dt_match:
        try:
            received_at = datetime.strptime(
                f"{dt_match.group(1)} {dt_match.group(2).upper()}", "%d/%m/%Y %I:%M %p"
            )
        except ValueError:
            received_at = None

    bank = None
    for candidate in ("KCB", "Equity", "Co-operative", "NCBA", "Absa", "Stanbic", "DTB", "I&M"):
        if re.search(rf"\b{re.escape(candidate)}\b", message, re.I):
            bank = candidate
            break

    return {
        "amount": Decimal(amount_match.group(1).replace(",", "")) if amount_match else None,
        "external_reference": ref_match.group(1).upper() if ref_match else None,
        "student_identifier": student_match.group(1) if student_match else None,
        "received_at": received_at,
        "account_name": account_match.group(1).strip() if account_match else None,
        "bank": bank,
        "payment_channel": "M-PESA → Bank" if re.search(r"M-PESA|MPESA", message, re.I) and bank else None,
        "raw_message": message,
    }
