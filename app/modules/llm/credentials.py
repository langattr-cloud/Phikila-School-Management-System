"""Encrypted storage for provider API keys.

All encryption and decryption lives here so no router, adapter or service ever
touches ciphertext or a raw key directly. The plaintext key exists only inside
:meth:`ProviderCredentialService.get_credential` callers, for the duration of a
single outbound provider request.

The encryption key comes from ``LLM_ENCRYPTION_KEY`` (a urlsafe base64 32-byte
Fernet key). It is server-side only and must never be a ``VITE_*`` variable.
Generate one with::

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

import base64
import hashlib
import os
from datetime import datetime

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.config import settings

from .models import TtLlmCredential


class EncryptionUnavailable(RuntimeError):
    """Raised when no usable encryption key is configured."""


def _derive_dev_key() -> bytes:
    """Deterministic development-only key.

    Production refuses to start without an explicit LLM_ENCRYPTION_KEY, so this
    path only ever runs locally and keeps `uvicorn app.main:app` working without
    extra setup. It is derived from a fixed, non-secret label, which is exactly
    why it is rejected in production.
    """
    digest = hashlib.sha256(b"phikila-local-development-llm-key").digest()
    return base64.urlsafe_b64encode(digest)


def _fernet() -> Fernet:
    raw = os.getenv("LLM_ENCRYPTION_KEY", "").strip()
    if not raw:
        if settings.is_production:
            raise EncryptionUnavailable(
                "LLM_ENCRYPTION_KEY is not configured. Provider credentials "
                "cannot be stored securely without it."
            )
        return Fernet(_derive_dev_key())

    try:
        return Fernet(raw.encode())
    except (ValueError, TypeError) as error:
        raise EncryptionUnavailable(
            "LLM_ENCRYPTION_KEY is not a valid Fernet key. Generate one with "
            "Fernet.generate_key()."
        ) from error


def encryption_configured() -> bool:
    """Whether credentials can currently be stored. Never raises."""
    try:
        _fernet()
        return True
    except EncryptionUnavailable:
        return False


class ProviderCredentialService:
    """The only component permitted to encrypt or decrypt provider keys."""

    def __init__(self, db: Session) -> None:
        self._db = db

    # -- queries ---------------------------------------------------------
    def has_credential(self, provider: str) -> bool:
        return self._row(provider) is not None

    def get_credential(self, provider: str) -> str | None:
        """Return the plaintext key for an outbound provider call.

        Callers must use the result only as an Authorization header value and
        must never log, echo or persist it.
        """
        row = self._row(provider)
        if row is None:
            return None
        try:
            return _fernet().decrypt(row.encrypted_api_key.encode()).decode()
        except (InvalidToken, EncryptionUnavailable):
            # A rotated or missing encryption key must not look like a valid
            # credential; treat it as unusable rather than crashing.
            return None

    def record(self, provider: str) -> TtLlmCredential | None:
        """The safe metadata row, for status display."""
        return self._row(provider)

    # -- mutations -------------------------------------------------------
    def save_credential(
        self, provider: str, api_key: str, actor: str | None
    ) -> TtLlmCredential:
        token = _fernet().encrypt(api_key.encode()).decode()
        row = self._row(provider)
        now = datetime.utcnow()

        if row is None:
            row = TtLlmCredential(
                provider=provider,
                encrypted_api_key=token,
                last4=api_key[-4:],
                created_by=actor,
                updated_by=actor,
                created_at=now,
            )
            self._db.add(row)
        else:
            row.encrypted_api_key = token
            row.last4 = api_key[-4:]
            row.updated_by = actor
        row.updated_at = now
        self._db.commit()
        self._db.refresh(row)
        return row

    def delete_credential(self, provider: str) -> bool:
        row = self._row(provider)
        if row is None:
            return False
        self._db.delete(row)
        self._db.commit()
        return True

    def mark_tested(
        self,
        provider: str,
        *,
        status: str,
        models_available: int | None = None,
        error: str | None = None,
    ) -> None:
        row = self._row(provider)
        if row is None:
            return
        row.status = status
        row.last_tested_at = datetime.utcnow()
        row.last_error = (error or "")[:300] or None
        if models_available is not None:
            row.models_available = models_available
        self._db.commit()

    # -- internals -------------------------------------------------------
    def _row(self, provider: str) -> TtLlmCredential | None:
        return (
            self._db.query(TtLlmCredential)
            .filter(TtLlmCredential.provider == provider)
            .first()
        )
