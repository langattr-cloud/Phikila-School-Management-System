"""Finance operations API for treasury, budgeting, procurement and receipts."""
from __future__ import annotations
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from . import operations_models as m
router = APIRouter()
def _audit(db,p,a,e,i,s):
    from app.modules.scheduling.models import TtAuditEntry
    db.add(TtAuditEntry(school_id=p.school_id,actor=p.email or p.user_id,action=a,entity=e,entity_id=i,summary=s))
def _money(v): return Decimal(str(v or 0))
def _required_approvals(amount: Decimal) -> int:
    if amount <= Decimal("50000"): return 1
    if amount <= Decimal("250000"): return 2
    return 3
@router.get('/finance/bank-accounts')
def bank_accounts(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceBankAccount).filter_by(school_id=principal.school_id).all()
@router.get('/finance/cash-books')
def cash_books(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceCashBook).filter_by(school_id=principal.school_id).all()
@router.get('/finance/cash-books/{cash_book_id}/entries')
def cash_book_entries(cash_book_id:int,db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):
    book=db.query(m.FinanceCashBook).filter_by(id=cash_book_id,school_id=principal.school_id).first()
    if not book: raise HTTPException(404,'Cash book not found')
    return db.query(m.FinanceCashBookEntry).filter_by(cash_book_id=cash_book_id,school_id=principal.school_id).order_by(m.FinanceCashBookEntry.entry_date.desc()).all()
@router.post('/finance/cash-books/{cash_book_id}/entries')
def create_cash_book_entry(cash_book_id:int,payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    book=db.query(m.FinanceCashBook).filter_by(id=cash_book_id,school_id=principal.school_id).first()
    if not book: raise HTTPException(404,'Cash book not found')
    entry=m.FinanceCashBookEntry(school_id=principal.school_id,cash_book_id=cash_book_id,entry_date=datetime.now(timezone.utc),entry_type=payload.get('entry_type','RECEIPT'),amount=_money(payload.get('amount')),reference=payload.get('reference'),description=payload.get('description'))
    db.add(entry); _audit(db,principal,'CREATE','FINANCE_CASH_BOOK_ENTRY',entry.id or 0,'Cash book entry created'); db.commit(); db.refresh(entry); return entry
@router.get('/finance/bank-reconciliations')
def bank_reconciliations(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceBankReconciliation).filter_by(school_id=principal.school_id).order_by(m.FinanceBankReconciliation.id.desc()).all()
@router.post('/finance/bank-reconciliations')
def create_bank_reconciliation(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    rec=m.FinanceBankReconciliation(school_id=principal.school_id,bank_account_id=payload.get('bank_account_id'),statement_date=datetime.now(timezone.utc),status='PENDING',notes=payload.get('notes'))
    db.add(rec); _audit(db,principal,'CREATE','FINANCE_BANK_RECONCILIATION',rec.id or 0,'Bank reconciliation created'); db.commit(); db.refresh(rec); return rec
@router.post('/finance/bank-statements/import')
def import_bank_statement(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    rows=payload.get('rows') or []
    created=[]; duplicates=0
    for row in rows:
        ref=(row.get('external_reference') or row.get('reference') or '').strip()
        if ref and db.query(m.FinanceBankTransaction).filter_by(school_id=principal.school_id,external_reference=ref).first(): duplicates += 1; continue
        tx=m.FinanceBankTransaction(school_id=principal.school_id,bank_account_id=row.get('bank_account_id'),transaction_date=row.get('transaction_date') or datetime.now(timezone.utc),amount=_money(row.get('amount')),transaction_type=row.get('transaction_type','CREDIT'),external_reference=ref or None,description=row.get('description'))
        db.add(tx); created.append(tx)
    _audit(db,principal,'IMPORT','FINANCE_BANK_STATEMENT',None,f'Imported {len(created)} bank transactions; skipped {duplicates} duplicates'); db.commit(); return {'created':len(created),'duplicates':duplicates}
@router.post('/finance/payment-vouchers')
def create_payment_voucher(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    voucher=m.FinancePaymentVoucher(school_id=principal.school_id,voucher_number=payload['voucher_number'],payee=payload['payee'],amount=_money(payload['amount']),description=payload.get('description'),invoice_reference=payload.get('invoice_reference'),lpo_reference=payload.get('lpo_reference'),requested_by=principal.email)
    db.add(voucher); _audit(db,principal,'CREATE','FINANCE_PAYMENT_VOUCHER',voucher.id or 0,'Payment voucher requested'); db.commit(); db.refresh(voucher); return voucher
@router.get('/finance/payment-vouchers')
def list_payment_vouchers(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinancePaymentVoucher).filter_by(school_id=principal.school_id).order_by(m.FinancePaymentVoucher.id.desc()).all()
@router.post('/finance/payment-vouchers/{voucher_id}/approve')
def approve_payment_voucher(voucher_id:int,sequence:int=Query(1,ge=1,le=3),decision:str=Query('APPROVE'),reason:str|None=Query(None),db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    voucher=db.query(m.FinancePaymentVoucher).filter_by(id=voucher_id,school_id=principal.school_id).first()
    if not voucher: raise HTTPException(404,'Payment voucher not found')
    if voucher.requested_by == (principal.email or principal.user_id): raise HTTPException(400,'Requester cannot approve own voucher')
    required=_required_approvals(_money(voucher.amount))
    if sequence>required: raise HTTPException(400,f'Approval sequence {sequence} is not required for this voucher')
    existing=db.query(m.FinanceApproval).filter_by(school_id=principal.school_id,entity_type='PAYMENT_VOUCHER',entity_id=voucher_id,sequence=sequence).first()
    if existing: raise HTTPException(409,'Approval sequence already recorded')
    if decision not in ('APPROVE','REJECT'): raise HTTPException(400,'Decision must be APPROVE or REJECT')
    if decision=='APPROVE' and sequence>1:
        prior=db.query(m.FinanceApproval).filter_by(school_id=principal.school_id,entity_type='PAYMENT_VOUCHER',entity_id=voucher_id,sequence=sequence-1,decision='APPROVE').first()
        if not prior: raise HTTPException(409,'Previous approval sequence is required first')
    approval=m.FinanceApproval(school_id=principal.school_id,entity_type='PAYMENT_VOUCHER',entity_id=voucher_id,sequence=sequence,required_role='admin',approver=principal.email or principal.user_id,decision=decision,amount_threshold=voucher.amount,reason=reason,decided_at=datetime.now(timezone.utc))
    db.add(approval)
    if decision=='REJECT': voucher.status='REJECTED'
    else:
        count=db.query(m.FinanceApproval).filter_by(school_id=principal.school_id,entity_type='PAYMENT_VOUCHER',entity_id=voucher_id,decision='APPROVE').count()+1
        if count>=required: voucher.status='APPROVED'
        else: voucher.status='PENDING_APPROVAL'
    _audit(db,principal,decision,'FINANCE_PAYMENT_VOUCHER_APPROVAL',voucher_id,f'{decision} sequence {sequence}; required {required}')
    db.commit(); db.refresh(voucher); return voucher
@router.post('/finance/imprests')
def create_imprest(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    item=m.FinanceImprest(school_id=principal.school_id,applicant=payload['applicant'],purpose=payload['purpose'],amount=_money(payload['amount']),due_date=payload.get('due_date'))
    db.add(item); _audit(db,principal,'CREATE','FINANCE_IMPREST',item.id or 0,'Imprest requested'); db.commit(); db.refresh(item); return item
@router.get('/finance/imprests')
def list_imprests(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceImprest).filter_by(school_id=principal.school_id).order_by(m.FinanceImprest.id.desc()).all()
@router.get('/finance/suppliers')
def suppliers(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceSupplier).filter_by(school_id=principal.school_id).all()
@router.post('/finance/suppliers')
def create_supplier(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    item=m.FinanceSupplier(school_id=principal.school_id,name=payload['name'],contact=payload.get('contact'),tax_pin=payload.get('tax_pin'),bank_details=payload.get('bank_details'),status='ACTIVE')
    db.add(item); _audit(db,principal,'CREATE','FINANCE_SUPPLIER',item.id or 0,'Supplier created'); db.commit(); db.refresh(item); return item
@router.get('/finance/assets')
def assets(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceAsset).filter_by(school_id=principal.school_id).all()
@router.get('/finance/capitation')
def capitation(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceCapitationRecord).filter_by(school_id=principal.school_id).all()
@router.get('/finance/other-income')
def other_income(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceOtherIncome).filter_by(school_id=principal.school_id).all()
