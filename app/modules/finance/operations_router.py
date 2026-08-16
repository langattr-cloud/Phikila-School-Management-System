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
@router.get('/finance/bank-accounts')
def bank_accounts(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))): return db.query(m.FinanceBankAccount).filter_by(school_id=principal.school_id).all()
@router.post('/finance/bank-accounts',status_code=201)
def create_bank_account(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    for k in ('bank_name','account_name','account_identifier'):
        if not payload.get(k): raise HTTPException(400,f'{k} is required')
    if db.query(m.FinanceBankAccount).filter_by(school_id=principal.school_id,account_identifier=payload['account_identifier']).first(): raise HTTPException(409,'Bank account identifier already exists')
    r=m.FinanceBankAccount(school_id=principal.school_id,bank_name=payload['bank_name'],branch_name=payload.get('branch_name'),account_name=payload['account_name'],account_identifier=payload['account_identifier'],currency=payload.get('currency','KES'),opening_balance=_money(payload.get('opening_balance')));db.add(r);_audit(db,principal,'create','bank_account',0,f'Created bank account {r.account_identifier}');db.commit();db.refresh(r);return r
@router.get('/finance/bank-transactions')
def bank_transactions(bank_account_id:int|None=Query(None),db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):
    q=db.query(m.FinanceBankTransaction).filter_by(school_id=principal.school_id)
    if bank_account_id:q=q.filter_by(bank_account_id=bank_account_id)
    return q.order_by(m.FinanceBankTransaction.transaction_date.desc()).limit(500).all()
@router.post('/finance/bank-transactions',status_code=201)
def import_bank_transaction(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    for k in ('bank_account_id','transaction_date','amount','transaction_type'):
        if payload.get(k) is None:raise HTTPException(400,f'{k} is required')
    a=db.query(m.FinanceBankAccount).filter_by(id=payload['bank_account_id'],school_id=principal.school_id).first()
    if not a:raise HTTPException(404,'Bank account not found')
    ref=payload.get('external_reference')
    if ref and db.query(m.FinanceBankTransaction).filter_by(school_id=principal.school_id,bank_account_id=a.id,external_reference=ref).first():raise HTTPException(409,'Bank transaction reference already exists')
    r=m.FinanceBankTransaction(school_id=principal.school_id,bank_account_id=a.id,transaction_date=payload['transaction_date'],value_date=payload.get('value_date'),amount=_money(payload['amount']),transaction_type=payload['transaction_type'],external_reference=ref,description=payload.get('description'),source=payload.get('source','manual'),raw_data=payload.get('raw_data'));db.add(r);_audit(db,principal,'create','bank_transaction',0,f'Imported bank transaction {ref or "without reference"}');db.commit();db.refresh(r);return r
@router.get('/finance/budgets')
def budgets(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):return db.query(m.FinanceBudget).filter_by(school_id=principal.school_id).order_by(m.FinanceBudget.created_at.desc()).all()
@router.post('/finance/budgets',status_code=201)
def create_budget(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    if not payload.get('name'):raise HTTPException(400,'Budget name is required')
    r=m.FinanceBudget(school_id=principal.school_id,name=payload['name'],fiscal_period_id=payload.get('fiscal_period_id'),total_amount=_money(payload.get('total_amount')));db.add(r);_audit(db,principal,'create','budget',0,f'Created budget {r.name}');db.commit();db.refresh(r);return r
@router.get('/finance/payment-vouchers')
def payment_vouchers(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):return db.query(m.FinancePaymentVoucher).filter_by(school_id=principal.school_id).order_by(m.FinancePaymentVoucher.created_at.desc()).all()
@router.post('/finance/payment-vouchers',status_code=201)
def create_payment_voucher(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    for k in ('voucher_number','payee','amount','description'):
        if not payload.get(k):raise HTTPException(400,f'{k} is required')
    if db.query(m.FinancePaymentVoucher).filter_by(school_id=principal.school_id,voucher_number=payload['voucher_number']).first():raise HTTPException(409,'Voucher number already exists')
    r=m.FinancePaymentVoucher(school_id=principal.school_id,voucher_number=payload['voucher_number'],payee=payload['payee'],amount=_money(payload['amount']),description=payload['description'],invoice_reference=payload.get('invoice_reference'),lpo_reference=payload.get('lpo_reference'),requested_by=principal.user_id);db.add(r);_audit(db,principal,'create','payment_voucher',0,f'Created voucher {r.voucher_number}');db.commit();db.refresh(r);return r
@router.post('/finance/payment-vouchers/{voucher_id}/approve')
def approve_payment_voucher(voucher_id:int,sequence:int=Query(1,ge=1,le=3),decision:str=Query('APPROVE'),db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    r=db.query(m.FinancePaymentVoucher).filter_by(id=voucher_id,school_id=principal.school_id).first()
    if not r:raise HTTPException(404,'Payment voucher not found')
    if r.requested_by==principal.user_id:raise HTTPException(403,'Requester cannot approve their own voucher')
    if decision not in {'APPROVE','REJECT'}:raise HTTPException(400,'decision must be APPROVE or REJECT')
    db.add(m.FinanceApproval(school_id=principal.school_id,entity_type='payment_voucher',entity_id=r.id,sequence=sequence,required_role='admin',approver=principal.user_id,decision=decision,amount_threshold=r.amount,reason='Voucher approval',decided_at=datetime.now(timezone.utc)));r.status='APPROVED' if decision=='APPROVE' else 'REJECTED';_audit(db,principal,'approve','payment_voucher',r.id,f'Voucher {r.voucher_number}: {decision}');db.commit();db.refresh(r);return r
@router.get('/finance/imprests')
def imprests(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):return db.query(m.FinanceImprest).filter_by(school_id=principal.school_id).order_by(m.FinanceImprest.created_at.desc()).all()
@router.post('/finance/imprests',status_code=201)
def create_imprest(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin','scheduler'))):
    if not payload.get('purpose') or not payload.get('amount'):raise HTTPException(400,'purpose and amount are required')
    r=m.FinanceImprest(school_id=principal.school_id,applicant=payload.get('applicant',principal.user_id),purpose=payload['purpose'],amount=_money(payload['amount']),due_date=payload.get('due_date'));db.add(r);_audit(db,principal,'create','imprest',0,f'Created imprest request {r.amount}');db.commit();db.refresh(r);return r
@router.get('/finance/suppliers')
def suppliers(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):return db.query(m.FinanceSupplier).filter_by(school_id=principal.school_id).all()
@router.post('/finance/suppliers',status_code=201)
def create_supplier(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    if not payload.get('name'):raise HTTPException(400,'Supplier name is required')
    r=m.FinanceSupplier(school_id=principal.school_id,name=payload['name'],contact=payload.get('contact'),tax_identifier=payload.get('tax_identifier'),bank_details=payload.get('bank_details'),payment_terms=payload.get('payment_terms'));db.add(r);_audit(db,principal,'create','supplier',0,f'Created supplier {r.name}');db.commit();db.refresh(r);return r
@router.get('/finance/assets')
def assets(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):return db.query(m.FinanceAsset).filter_by(school_id=principal.school_id).order_by(m.FinanceAsset.asset_number).all()
@router.post('/finance/assets',status_code=201)
def create_asset(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    for k in ('asset_number','category','description','cost'):
        if payload.get(k) is None:raise HTTPException(400,f'{k} is required')
    if db.query(m.FinanceAsset).filter_by(school_id=principal.school_id,asset_number=payload['asset_number']).first():raise HTTPException(409,'Asset number already exists')
    c=_money(payload['cost']);r=m.FinanceAsset(school_id=principal.school_id,asset_number=payload['asset_number'],category=payload['category'],description=payload['description'],purchase_date=payload.get('purchase_date'),cost=c,supplier_id=payload.get('supplier_id'),location=payload.get('location'),responsible_department=payload.get('responsible_department'),serial_number=payload.get('serial_number'),asset_tag=payload.get('asset_tag'),useful_life_months=payload.get('useful_life_months'),book_value=c);db.add(r);_audit(db,principal,'create','asset',0,f'Created asset {r.asset_number}');db.commit();db.refresh(r);return r
@router.get('/finance/capitation')
def capitation(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):return db.query(m.FinanceCapitationRecord).filter_by(school_id=principal.school_id).all()
@router.get('/finance/other-income')
def other_income(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):return db.query(m.FinanceOtherIncome).filter_by(school_id=principal.school_id).order_by(m.FinanceOtherIncome.received_date.desc()).all()
@router.post('/finance/other-income',status_code=201)
def create_other_income(payload:dict,db:Session=Depends(get_db),principal:Principal=Depends(require_role('admin'))):
    if not payload.get('income_type') or payload.get('amount') is None:raise HTTPException(400,'income_type and amount are required')
    r=m.FinanceOtherIncome(school_id=principal.school_id,income_type=payload['income_type'],description=payload.get('description'),amount=_money(payload['amount']),received_date=payload.get('received_date',datetime.now(timezone.utc)),reference=payload.get('reference'),account_id=payload.get('account_id'),created_by=principal.user_id);db.add(r);_audit(db,principal,'create','other_income',0,f'Recorded other income {r.amount}');db.commit();db.refresh(r);return r
@router.get('/finance/vote-book')
def vote_book(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):
    rows=db.query(m.FinanceBudgetLine).join(m.FinanceBudget,m.FinanceBudget.id==m.FinanceBudgetLine.budget_id).filter(m.FinanceBudget.school_id==principal.school_id).all();return [{'id':r.id,'budget_id':r.budget_id,'account_id':r.account_id,'budget':_money(r.budget_amount),'revised':_money(r.revised_amount),'committed':_money(r.committed_amount),'actual':_money(r.actual_amount),'available':_money(r.revised_amount or r.budget_amount)-_money(r.committed_amount)-_money(r.actual_amount),'variance':_money(r.revised_amount or r.budget_amount)-_money(r.actual_amount)} for r in rows]
