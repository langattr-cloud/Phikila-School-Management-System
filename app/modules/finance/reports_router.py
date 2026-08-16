"""Finance reporting endpoints built from the canonical accounting and fee ledgers."""
from __future__ import annotations
from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, require_role
from . import models as m
from . import operations_models as o
router = APIRouter()
def money(v): return Decimal(str(v or 0))
@router.get('/finance/reports/trial-balance')
def trial_balance(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):
    rows=db.query(m.ChartOfAccount.id,m.ChartOfAccount.code,m.ChartOfAccount.name,m.ChartOfAccount.account_type,func.coalesce(func.sum(m.JournalEntry.debit),0),func.coalesce(func.sum(m.JournalEntry.credit),0)).outerjoin(m.JournalEntry,m.JournalEntry.account_id==m.ChartOfAccount.id).join(m.Journal,m.Journal.id==m.JournalEntry.journal_id,isouter=True).filter(m.ChartOfAccount.school_id==principal.school_id).group_by(m.ChartOfAccount.id).order_by(m.ChartOfAccount.code).all()
    return [{'account_id':r[0],'code':r[1],'name':r[2],'account_type':r[3],'debit':money(r[4]),'credit':money(r[5]),'balance':money(r[4])-money(r[5])} for r in rows]
@router.get('/finance/reports/general-ledger')
def general_ledger(account_id:int|None=None,db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):
    q=db.query(m.Journal,m.JournalEntry,m.ChartOfAccount).join(m.JournalEntry,m.JournalEntry.journal_id==m.Journal.id).join(m.ChartOfAccount,m.ChartOfAccount.id==m.JournalEntry.account_id).filter(m.Journal.school_id==principal.school_id)
    if account_id:q=q.filter(m.JournalEntry.account_id==account_id)
    rows=q.order_by(m.Journal.transaction_date,m.Journal.id,m.JournalEntry.id).limit(2000).all()
    return [{'journal_id':j.id,'journal_number':j.journal_number,'date':j.transaction_date,'reference':j.reference,'account_id':a.id,'account_code':a.code,'account_name':a.name,'debit':money(e.debit),'credit':money(e.credit),'description':e.description} for j,e,a in rows]
@router.get('/finance/reports/income-expenditure')
def income_expenditure(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):
    rows=trial_balance(db,principal)
    income=sum((r['credit']-r['debit'] for r in rows if str(r['account_type']).upper()=='INCOME'),Decimal('0'))
    expenditure=sum((r['debit']-r['credit'] for r in rows if str(r['account_type']).upper() in {'EXPENSE','EXPENDITURE'}),Decimal('0'))
    return {'income':income,'expenditure':expenditure,'surplus_deficit':income-expenditure,'accounts':rows}
@router.get('/finance/reports/fee-collection')
def fee_collection(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','teacher','admin'))):
    rows=db.query(m.StudentInvoice.student_id,func.sum(m.StudentInvoice.amount),func.sum(m.StudentInvoice.balance)).filter(m.StudentInvoice.school_id==principal.school_id).group_by(m.StudentInvoice.student_id).all()
    return [{'student_id':r[0],'billed':money(r[1]),'outstanding':money(r[2]),'collected':money(r[1])-money(r[2]),'collection_rate':float(((money(r[1])-money(r[2]))/money(r[1])*100) if money(r[1]) else 0)} for r in rows]
@router.get('/finance/reports/debtors')
def debtors(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','teacher','admin'))):
    rows=fee_collection(db,principal); return sorted([r for r in rows if r['outstanding']>0],key=lambda x:x['outstanding'],reverse=True)
@router.get('/finance/reports/budget-vs-actual')
def budget_vs_actual(db:Session=Depends(get_db),principal:Principal=Depends(require_role('viewer','admin'))):
    rows=db.query(o.FinanceBudgetLine).join(o.FinanceBudget,o.FinanceBudget.id==o.FinanceBudgetLine.budget_id).filter(o.FinanceBudget.school_id==principal.school_id).all()
    return [{'id':r.id,'budget_id':r.budget_id,'account_id':r.account_id,'budget':money(r.budget_amount),'revised':money(r.revised_amount or r.budget_amount),'committed':money(r.committed_amount),'actual':money(r.actual_amount),'available':money(r.revised_amount or r.budget_amount)-money(r.committed_amount)-money(r.actual_amount),'variance':money(r.revised_amount or r.budget_amount)-money(r.actual_amount)} for r in rows]
