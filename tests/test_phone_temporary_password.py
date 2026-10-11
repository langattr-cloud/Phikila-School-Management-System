import pytest
from fastapi import HTTPException

from app.modules.platform.router import _phone_temporary_password


@pytest.mark.parametrize(
    ("phone", "expected"),
    [
        ("0712 345 678", "0712345678"),
        ("+254 (712) 345-678", "254712345678"),
        ("254-712-345-678", "254712345678"),
    ],
)
def test_phone_temporary_password_uses_digits_only(phone: str, expected: str) -> None:
    assert _phone_temporary_password(phone) == expected


def test_phone_temporary_password_rejects_too_few_digits() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _phone_temporary_password("+1 (23)-4")

    assert exc_info.value.status_code == 422
