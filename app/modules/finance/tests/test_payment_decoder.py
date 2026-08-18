from decimal import Decimal

from app.modules.finance.payment_decoder import decode_payment_message
from app.modules.finance.payment_matching import normalize_admission_number


def test_mpesa_bank_message_extracts_admission_number_after_hash():
    message = (
        "Ksh 24000.00 sent to KCB account CHEPSEON COMPLEX PRIMARY SCHOOL "
        "8112631#3448 has been received on 22/07/2026 at 09:18 AM. "
        "M-PESA Ref UGMQ504KZS. To reverse this transaction, SMS this message to 16120."
    )
    decoded = decode_payment_message(message)

    assert decoded["amount"] == Decimal("24000.00")
    assert decoded["student_identifier"] == "3448"
    assert decoded["external_reference"] == "UGMQ504KZS"
    assert decoded["account_name"] == "CHEPSEON COMPLEX PRIMARY SCHOOL 8112631#3448"
    assert decoded["bank"] == "KCB"
    assert decoded["payment_channel"] == "M-PESA → Bank"


def test_admission_number_normalization_accepts_hash():
    assert normalize_admission_number("#3448") == "3448"
    assert normalize_admission_number(" 3448 ") == "3448"
