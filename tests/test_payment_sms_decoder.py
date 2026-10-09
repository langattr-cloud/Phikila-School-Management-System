from decimal import Decimal

from app.modules.finance.payment_decoder import decode_payment_message


def test_decodes_kcb_mpesa_school_fee_sms():
    message = (
        "Ksh 4000.00 sent to KCB account CHEPSEON COMPLEX PRIMARY SCHOOL "
        "8112631#3454 has been received on 07/10/2026 at 01:49 PM. "
        "M-PESA Ref UJ7AS90AE4. To reverse this transaction, SMS this message to 16120."
    )

    decoded = decode_payment_message(message)

    assert decoded["amount"] == Decimal("4000.00")
    assert decoded["external_reference"] == "UJ7AS90AE4"
    assert decoded["student_identifier"] == "3454"
    assert decoded["school_account_identifier"] == "8112631"
    assert decoded["bank"] == "KCB"
    assert decoded["received_at"].strftime("%d/%m/%Y %I:%M %p") == "07/10/2026 01:49 PM"
    assert decoded["account_name"] == "CHEPSEON COMPLEX PRIMARY SCHOOL 8112631#3454"
