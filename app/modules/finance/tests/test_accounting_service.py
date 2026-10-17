from decimal import Decimal
import pytest
from fastapi import HTTPException
from app.modules.finance.accounting_service import post_journal
from app.modules.finance.models import ChartOfAccount, JournalEntry


def test_post_journal_rejects_unbalanced(db_session):
    db_session.add_all([
        ChartOfAccount(school_id=1, code="1000", name="Cash", account_type="asset"),
        ChartOfAccount(school_id=1, code="4000", name="Income", account_type="income"),
    ])
    db_session.commit()
    accounts = db_session.query(ChartOfAccount).filter_by(school_id=1).all()
    with pytest.raises(HTTPException):
        post_journal(db_session, school_id=1, journal_number="J-1", description="Bad", entries=[
            {"account_id": accounts[0].id, "debit": Decimal("100")},
            {"account_id": accounts[1].id, "credit": Decimal("90")},
        ])


def test_post_journal_creates_balanced_entries(db_session):
    db_session.add_all([
        ChartOfAccount(school_id=1, code="1000", name="Cash", account_type="asset"),
        ChartOfAccount(school_id=1, code="4000", name="Income", account_type="income"),
    ])
    db_session.commit()
    accounts = db_session.query(ChartOfAccount).filter_by(school_id=1).order_by(ChartOfAccount.id).all()
    journal = post_journal(db_session, school_id=1, journal_number="J-2", description="Good", entries=[
        {"account_id": accounts[0].id, "debit": Decimal("100")},
        {"account_id": accounts[1].id, "credit": Decimal("100")},
    ], created_by="tester")
    db_session.commit()
    assert journal.id
    lines = db_session.query(JournalEntry).filter(JournalEntry.journal_id == journal.id).all()
    assert sum(x.debit for x in lines) == sum(x.credit for x in lines)



def test_post_journal_rejects_account_from_another_school(db_session):
    db_session.add_all([
        ChartOfAccount(school_id=27, code="1000", name="School 27 Cash", account_type="asset"),
        ChartOfAccount(school_id=81, code="4000", name="School 81 Income", account_type="income"),
    ])
    db_session.commit()
    school_27_account = db_session.query(ChartOfAccount).filter_by(school_id=27).one()
    school_81_account = db_session.query(ChartOfAccount).filter_by(school_id=81).one()

    with pytest.raises(HTTPException) as exc:
        post_journal(
            db_session,
            school_id=27,
            journal_number="TENANT-LEAK-1",
            description="Must reject cross-school account",
            entries=[
                {"account_id": school_27_account.id, "debit": Decimal("100")},
                {"account_id": school_81_account.id, "credit": Decimal("100")},
            ],
        )

    assert exc.value.status_code == 400
    assert db_session.query(JournalEntry).count() == 0
