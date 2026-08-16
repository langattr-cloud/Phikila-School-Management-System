"""Invariant-preserving helpers for Finance double-entry posting."""
from __future__ import annotations
from decimal import Decimal
from sqlalchemy.orm import Session
from fastapi import HTTPException
from .models import ChartOfAccount, Journal, JournalEntry


def post_journal(db: Session, *, school_id: int, journal_number: str, description: str,
                 entries: list[dict], created_by: str | None = None,
                 reference: str | None = None) -> Journal:
    if not entries:
        raise HTTPException(400, "A journal requires at least two entries")
    debit = sum((Decimal(str(x.get("debit", 0))) for x in entries), Decimal("0"))
    credit = sum((Decimal(str(x.get("credit", 0))) for x in entries), Decimal("0"))
    if debit <= 0 or debit != credit:
        raise HTTPException(400, "Journal debits and credits must be equal and greater than zero")
    account_ids = {int(x["account_id"]) for x in entries if x.get("account_id") is not None}
    accounts = db.query(ChartOfAccount).filter(
        ChartOfAccount.school_id == school_id,
        ChartOfAccount.id.in_(account_ids),
        ChartOfAccount.is_active == 1,
    ).all()
    if len(accounts) != len(account_ids):
        raise HTTPException(400, "Every journal account must belong to the school and be active")
    existing = db.query(Journal).filter(Journal.school_id == school_id, Journal.journal_number == journal_number).first()
    if existing:
        raise HTTPException(409, "Journal number already exists")
    journal = Journal(school_id=school_id, journal_number=journal_number, description=description,
                     reference=reference, status="posted", created_by=created_by)
    db.add(journal)
    db.flush()
    for item in entries:
        d, c = Decimal(str(item.get("debit", 0))), Decimal(str(item.get("credit", 0)))
        if d < 0 or c < 0 or (d > 0 and c > 0):
            raise HTTPException(400, "Each journal line must contain either a debit or a credit")
        db.add(JournalEntry(journal_id=journal.id, account_id=int(item["account_id"]),
                            debit=d, credit=c, description=item.get("description")))
    return journal
