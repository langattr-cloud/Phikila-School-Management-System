"""Unit tests for KCB statement upload parsing."""
from decimal import Decimal

from app.modules.finance.payment_statement_import import _reference, _rows_to_transactions


def test_statement_csv_rows_extract_reference_and_credit_only():
    rows = [
        ["Transaction Date", "Narration", "Debit", "Credit", "Balance"],
        ["07/10/2026", "M-PESA Ref UJ7AS90AE4 CHEPSEON COMPLEX PRIMARY SCHOOL", "0.00", "4000.00", "54000.00"],
        ["07/10/2026", "TRANSFER TO SUPPLIER", "1200.00", "0.00", "52800.00"],
    ]
    transactions, warnings = _rows_to_transactions(rows)
    assert len(transactions) == 1
    assert transactions[0].reference == "UJ7AS90AE4"
    assert transactions[0].amount == Decimal("4000.00")
    assert warnings


def test_reference_prefers_explicit_mpesa_reference_in_narration():
    assert _reference("M-PESA Ref UJ7AS90AE4 school account 8112631#3454") == "UJ7AS90AE4"


def test_amount_only_statement_requires_credit_debit_signal():
    rows = [
        ["Date", "Reference", "Amount"],
        ["07/10/2026", "UJ7AS90AE4", "4000.00"],
    ]
    try:
        _rows_to_transactions(rows)
    except Exception as exc:
        assert "does not identify credits versus debits" in str(exc)
    else:
        raise AssertionError("An ambiguous amount-only statement must not be imported.")
