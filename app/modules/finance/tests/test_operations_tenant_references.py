"""Cross-school foreign-key validation for finance operations."""
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.modules.finance import models as core
from app.modules.finance import operations_models as ops
from app.modules.finance import operations_router
from app.modules.scheduling.tenancy import Principal


def _principal(school_id=27):
    return Principal(
        user_id="finance-ops-test",
        email="finance-ops-test@example.test",
        school_id=school_id,
        role="admin",
    )


def test_budget_rejects_fiscal_period_from_another_school(db_session):
    period = ops.FinanceFiscalPeriod(
        school_id=81,
        name="Other school's period",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db_session.add(period)
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        operations_router.create_budget(
            {"name": "School 27 budget", "fiscal_period_id": period.id},
            db=db_session,
            principal=_principal(),
        )

    assert exc.value.status_code == 404
    assert db_session.query(ops.FinanceBudget).count() == 0


def test_asset_rejects_supplier_from_another_school(db_session):
    supplier = ops.FinanceSupplier(school_id=81, name="Other school's supplier")
    db_session.add(supplier)
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        operations_router.create_asset(
            {
                "asset_number": "ASSET-27-1",
                "category": "Equipment",
                "description": "Test asset",
                "cost": "100.00",
                "supplier_id": supplier.id,
            },
            db=db_session,
            principal=_principal(),
        )

    assert exc.value.status_code == 404
    assert db_session.query(ops.FinanceAsset).count() == 0


def test_other_income_rejects_ledger_account_from_another_school(db_session):
    account = core.ChartOfAccount(
        school_id=81,
        code="4000",
        name="Other school's income account",
        account_type="income",
    )
    db_session.add(account)
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        operations_router.create_other_income(
            {"income_type": "Grant", "amount": Decimal("100.00"), "account_id": account.id},
            db=db_session,
            principal=_principal(),
        )

    assert exc.value.status_code == 404
    assert db_session.query(ops.FinanceOtherIncome).count() == 0
