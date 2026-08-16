"""Additional Finance workflows: bank reconciliation, statement import and cash books."""
from __future__ import annotations
import csv
import io
from datetime import datetime, date, timezone
from decimal import Decimal, InvalidOperation
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from . import operations_models as o

router = APIRouter()

def money(value) -> Decimal:
    return Decimal(str(value or 0))

def dt(value):
    if value is None: return datetime.now(timezone.utc)
    if isinstance(value, datetime): return value
    try: return datetime.fromisoformat(str(value).replace('Z','+00:00'))
    except ValueError: raise HTTPException(400, 'Invalid datetime; use ISO-8601 format')

def day(value):
    if isinstance(value, date) and not isinstance(value, datetime): return value
    try: return date.fromisoformat(str(value))
    except ValueError: raise HTTPException(400, 'Invalid date; use YYYY-MM-DD')

def audit(db, principal, action, entity, entity_id, summary):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(school_id=principal.school_id, actor=principal.email or principal.user_id,
                        action=action, entity=entity, entity_id=entity_id, summary=summary))

@router.get('/finance/cash-books')
def list_cash_books(db: Session = Depends(get_db), principal: Principal = Depends(require_role('viewer','admin'))):
    return db.query(o.FinanceCashBook).filter_by(school_id=principal.school_id).all()

@router.post('/finance/cash-books', status_code=201)
def create_cash_book(payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin'))):
    if not payload.get('name') or not payload.get('book_type'): raise HTTPException(400, 'name and book_type are required')
    book = o.FinanceCashBook(school_id=principal.school_id, name=payload['name'], book_type=payload['book_type'],
                             bank_account_id=payload.get('bank_account_id'), opening_balance=money(payload.get('opening_balance')))
    db.add(book); audit(db, principal, 'create', 'cash_book', 0, f'Created cash book {book.name}')
    db.commit(); db.refresh(book); return book

@router.get('/finance/cash-books/{cash_book_id}/entries')
def list_cash_book_entries(cash_book_id: int, db: Session = Depends(get_db), principal: Principal = Depends(require_role('viewer','admin'))):
    book = db.query(o.FinanceCashBook).filter_by(id=cash_book_id, school_id=principal.school_id).first()
    if not book: raise HTTPException(404, 'Cash book not found')
    return db.query(o.FinanceCashBookEntry).filter_by(cash_book_id=book.id, school_id=principal.school_id).order_by(o.FinanceCashBookEntry.entry_date, o.FinanceCashBookEntry.id).all()

@router.post('/finance/cash-books/{cash_book_id}/entries', status_code=201)
def add_cash_book_entry(cash_book_id: int, payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    book = db.query(o.FinanceCashBook).filter_by(id=cash_book_id, school_id=principal.school_id).first()
    if not book: raise HTTPException(404, 'Cash book not found')
    if payload.get('entry_type') not in {'RECEIPT','PAYMENT','TRANSFER'}: raise HTTPException(400, 'entry_type must be RECEIPT, PAYMENT or TRANSFER')
    if payload.get('amount') is None or money(payload['amount']) <= 0: raise HTTPException(400, 'amount must be positive')
    entry = o.FinanceCashBookEntry(school_id=principal.school_id, cash_book_id=book.id, entry_date=dt(payload.get('entry_date')),
        entry_type=payload['entry_type'], amount=money(payload['amount']), reference=payload.get('reference'),
        description=payload.get('description'), source_entity=payload.get('source_entity'), source_id=payload.get('source_id'), created_by=principal.user_id)
    db.add(entry); audit(db, principal, 'create', 'cash_book_entry', 0, f'{entry.entry_type} {entry.amount} in cash book {book.id}')
    db.commit(); db.refresh(entry); return entry

@router.get('/finance/bank-reconciliations')
def list_reconciliations(db: Session = Depends(get_db), principal: Principal = Depends(require_role('viewer','admin'))):
    return db.query(o.FinanceBankReconciliation).filter_by(school_id=principal.school_id).order_by(o.FinanceBankReconciliation.statement_date.desc()).all()

@router.post('/finance/bank-reconciliations', status_code=201)
def reconcile_bank(payload: dict, db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin'))):
    bank = db.query(o.FinanceBankAccount).filter_by(id=payload.get('bank_account_id'), school_id=principal.school_id).first()
    if not bank: raise HTTPException(404, 'Bank account not found')
    if payload.get('statement_date') is None or payload.get('statement_balance') is None: raise HTTPException(400, 'statement_date and statement_balance are required')
    book_balance = money(payload.get('book_balance')); statement_balance = money(payload['statement_balance'])
    matched = statement_balance == book_balance
    row = o.FinanceBankReconciliation(school_id=principal.school_id, bank_account_id=bank.id, statement_date=day(payload['statement_date']),
        statement_balance=statement_balance, book_balance=book_balance, difference=statement_balance-book_balance,
        status='RECONCILED' if matched else 'OPEN', reconciled_by=principal.user_id if matched else None,
        reconciled_at=datetime.now(timezone.utc) if matched else None, notes=payload.get('notes'))
    db.add(row); audit(db, principal, 'reconcile', 'bank_reconciliation', 0, f'Bank {bank.account_identifier}: difference {row.difference}')
    db.commit(); db.refresh(row); return row

@router.post('/finance/bank-accounts/{bank_account_id}/statement-import', status_code=201)
async def import_bank_statement(bank_account_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), principal: Principal = Depends(require_role('admin','scheduler'))):
    bank = db.query(o.FinanceBankAccount).filter_by(id=bank_account_id, school_id=principal.school_id).first()
    if not bank: raise HTTPException(404, 'Bank account not found')
    if not file.filename or not file.filename.lower().endswith('.csv'): raise HTTPException(400, 'Upload a CSV bank statement')
    raw = await file.read()
    try: text = raw.decode('utf-8-sig')
    except UnicodeDecodeError: raise HTTPException(400, 'CSV must be UTF-8 encoded')
    reader = csv.DictReader(io.StringIO(text)); required = {'date','amount','type'}
    headers = {str(h).strip().lower() for h in (reader.fieldnames or [])}
    if not required.issubset(headers): raise HTTPException(400, 'CSV must contain date, amount and type columns')
    imported = 0; duplicates = 0
    for row in reader:
        normalized = {str(k).strip().lower(): (v.strip() if isinstance(v, str) else v) for k,v in row.items()}
        ref = normalized.get('reference') or normalized.get('external_reference') or None
        if ref and db.query(o.FinanceBankTransaction).filter_by(school_id=principal.school_id, bank_account_id=bank.id, external_reference=ref).first(): duplicates += 1; continue
        try: amount = money(normalized['amount'])
        except (InvalidOperation, TypeError): raise HTTPException(400, f'Invalid amount for reference {ref or "unknown"}')
        try: tx_date = dt(normalized['date'])
        except HTTPException:
            try: tx_date = datetime.strptime(str(normalized['date']), '%Y-%m-%d')
            except ValueError: raise HTTPException(400, f'Invalid date for reference {ref or "unknown"}')
        tx = o.FinanceBankTransaction(school_id=principal.school_id, bank_account_id=bank.id, transaction_date=tx_date,
            value_date=tx_date, amount=amount, transaction_type=str(normalized['type']).upper(), external_reference=ref,
            description=normalized.get('description'), source='CSV', raw_data=str(normalized))
        db.add(tx); imported += 1
    audit(db, principal, 'import', 'bank_statement', bank.id, f'Imported {imported} transactions; skipped {duplicates} duplicates from {file.filename}')
    db.commit(); return {'bank_account_id': bank.id, 'filename': file.filename, 'imported': imported, 'duplicates': duplicates}
