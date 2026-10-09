"""Tests for parsing bank/M-PESA payment messages."""
from decimal import Decimal

from app.modules.finance.payment_decoder import decode_payment_message


def test_kcb_school_payment_extracts_account_and_admission_separately():
    message = (
        "Ksh 4000.00 sent to KCB account CHEPSEON COMPLEX PRIMARY SCHOOL "
        "8112631#3454 has been received on 07/10/2026 at 01:49 PM. "
        "M-PESA Ref UJ7AS90AE4"
    )
    decoded = decode_payment_message(message)
    assert decoded["amount"] == Decimal("4000.00")
    assert decoded["external_reference"] == "UJ7AS90AE4"
    assert decoded["school_account_identifier"] == "8112631"
    assert decoded["student_identifier"] == "3454"
    assert decoded["account_name"] == "CHEPSEON COMPLEX PRIMARY SCHOOL"
    assert decoded["received_at"].isoformat() == "2026-10-07T13:49:00"
    assert decoded["bank"] == "KCB"


def test_two_digit_year_and_amount_without_space_are_supported():
    decoded = decode_payment_message(
        "UJ8P88XSLR Confirmed. Ksh10,500.00 sent to CHEPSEON GIRLS HIGH SCHOOL "
        "for account van on 8/10/26 at 11:47 AM."
    )
    assert decoded["amount"] == Decimal("10500.00")
    assert decoded["received_at"].isoformat() == "2026-10-08T11:47:00"


def test_message_without_structured_reference_does_not_invent_account_number():
    decoded = decode_payment_message("Ksh 500.00 received. M-PESA Ref ABC123")
    assert decoded["amount"] == Decimal("500.00")
    assert decoded["external_reference"] == "ABC123"
    assert decoded["school_account_identifier"] is None
    assert decoded["student_identifier"] is None
