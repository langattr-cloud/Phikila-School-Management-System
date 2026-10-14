"""Regression tests for school scoping in the existing finance API.

These tests deliberately exercise the route query construction without requiring
live Supabase credentials or a production database. They guard against removing
the school_id predicate from core finance read paths.
"""
from unittest.mock import Mock

import pytest

from app.modules.finance import models as finance_models
from app.modules.finance import router as finance_router
from app.modules.scheduling.tenancy import Principal


SCHOOL_ID = 27


def _principal(school_id=SCHOOL_ID):
    return Principal(
        user_id="finance-test-user",
        email="finance-test@example.test",
        school_id=school_id,
        role="admin",
    )


def _school_predicate(query_mock, model, school_id=SCHOOL_ID):
    """Assert one of the query's SQLAlchemy predicates pins the tenant id."""
    predicates = []
    for call in query_mock.filter.call_args_list:
        predicates.extend(call.args)
    matching = [
        predicate
        for predicate in predicates
        if getattr(predicate, "left", None) is getattr(model, "school_id", None)
        and getattr(predicate, "right", None) is not None
    ]
    assert matching, f"No {model.__tablename__}.school_id predicate found"
    assert any(school_id in predicate.compile().params.values() for predicate in matching)


@pytest.mark.parametrize(
    ("route", "model"),
    [
        (finance_router.list_invoices, finance_models.StudentInvoice),
        (finance_router.list_payments, finance_models.Payment),
        (finance_router.list_receipts, finance_models.FinanceReceipt),
    ],
)
def test_finance_list_routes_scope_queries_to_the_principals_school(route, model):
    db = Mock()
    query = db.query.return_value
    query.filter.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.all.return_value = []

    if route is finance_router.list_invoices:
        result = route(student_id=None, status_filter=None, db=db, principal=_principal())
    else:
        result = route(db=db, principal=_principal())

    assert result == []
    _school_predicate(query, model)


def test_invoice_lookup_requires_both_invoice_id_and_school_id():
    db = Mock()
    db.query.return_value.filter.return_value.first.return_value = None

    result = finance_router._invoice(db, _principal(school_id=81), invoice_id=123)

    assert result is None
    predicates = db.query.return_value.filter.call_args.args
    assert any(
        getattr(predicate, "left", None) is finance_models.StudentInvoice.school_id
        and 81 in predicate.compile().params.values()
        for predicate in predicates
    )
    assert any(
        getattr(predicate, "left", None) is finance_models.StudentInvoice.id
        and 123 in predicate.compile().params.values()
        for predicate in predicates
    )
