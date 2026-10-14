"""Regression tests for shared supplier ORM registration."""
from app.modules.finance.operations_models import FinanceSupplier
from app.modules.finance.supplier_payments import Supplier, SupplierInvoice, SupplierPayment


def test_supplier_payment_api_reuses_finance_supplier_model():
    # Importing both modules must not declare finance_suppliers twice.
    assert Supplier is FinanceSupplier
    assert Supplier.__table__ is FinanceSupplier.__table__
    assert {"phone", "email", "address", "tax_identifier"} <= set(Supplier.__table__.columns.keys())


def test_supplier_payment_tables_have_expected_foreign_keys():
    assert SupplierInvoice.__table__.c.supplier_id.foreign_keys
    assert SupplierPayment.__table__.c.supplier_id.foreign_keys
    assert SupplierPayment.__table__.c.invoice_id.foreign_keys
