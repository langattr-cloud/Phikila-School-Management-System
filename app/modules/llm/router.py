"""LLM provider settings API.

Every route requires platform-administrator authority: provider credentials are
platform-level infrastructure, not school data. The browser never receives an
API key, and never talks to a provider directly — all provider traffic
originates from this server.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.platform.authz import Identity, audit, require_super_admin

from .credentials import EncryptionUnavailable, ProviderCredentialService, encryption_configured
from .models import TtLlmCredential, TtLlmModel, TtLlmSetting
from .providers import (
    ProviderError,
    available_providers,
    get_provider,
    is_known_provider,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ConnectIn(BaseModel):
    api_key: str = Field(min_length=8, max_length=400)

    @field_validator("api_key")
    @classmethod
    def clean(cls, value: str) -> str:
        return value.strip()


class ModelPatch(BaseModel):
    enabled: bool


class DefaultIn(BaseModel):
    provider: str | None = None
    model_id: str | None = None


class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: int
    provider: str
    model_id: str
    display_name: str | None
    context_window: int | None
    input_price: float | None
    output_price: float | None
    supports_tools: bool | None
    supports_vision: bool | None
    supports_reasoning: bool | None
    enabled: bool
    last_tested_at: datetime | None
    last_test_ok: bool | None
    last_test_ms: int | None
    last_test_error: str | None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _provider_or_404(slug: str) -> None:
    if not is_known_provider(slug):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown provider.")


def _safe_status(row: TtLlmCredential | None, db: Session, slug: str) -> dict[str, Any]:
    """Connection metadata only. Never includes key material."""
    enabled = (
        db.query(TtLlmModel)
        .filter(TtLlmModel.provider == slug, TtLlmModel.enabled.is_(True))
        .count()
    )
    catalogued = db.query(TtLlmModel).filter(TtLlmModel.provider == slug).count()
    return {
        "connected": bool(row) and row.status == "connected",
        "api_key_configured": bool(row),
        # Four characters is a recognition aid, not a usable secret.
        "api_key_hint": f"••••{row.last4}" if row and row.last4 else None,
        "status": row.status if row else "not_configured",
        "last_tested_at": row.last_tested_at if row else None,
        "last_error": row.last_error if row else None,
        "models_available": row.models_available if row else 0,
        "models_catalogued": catalogued,
        "models_enabled": enabled,
    }


def _settings_row(db: Session) -> TtLlmSetting:
    row = db.query(TtLlmSetting).first()
    if row is None:
        row = TtLlmSetting()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------
@router.get("/providers")
def list_providers(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    service = ProviderCredentialService(db)
    out = []
    for adapter in available_providers():
        row = service.record(adapter.slug)
        out.append(
            {
                "provider": adapter.slug,
                "label": adapter.label,
                "docs_url": adapter.docs_url,
                "key_hint": adapter.key_hint,
                **_safe_status(row, db, adapter.slug),
            }
        )
    return {"providers": out, "encryption_configured": encryption_configured()}


@router.post("/providers/{provider}/connect")
def connect_provider(
    provider: str,
    payload: ConnectIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Validate a key against the provider, then store it encrypted.

    The key is only persisted if the provider accepts it, so a typo never
    becomes a silently broken configuration.
    """
    _provider_or_404(provider)
    adapter = get_provider(provider)

    format_error = adapter.validate_key_format(payload.api_key)
    if format_error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, format_error)

    result = adapter.test_connection(payload.api_key)
    if not result.ok:
        # Nothing is stored on failure.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            {"category": result.category, "message": result.message},
        )

    service = ProviderCredentialService(db)
    try:
        service.save_credential(provider, payload.api_key, identity.email)
    except EncryptionUnavailable as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from None

    service.mark_tested(
        provider, status="connected", models_available=result.models_available or 0
    )
    audit(
        db,
        identity,
        "llm_provider_connected",
        f"Connected the {adapter.label} provider",
        entity="llm_provider",
        entity_id=provider,
    )
    db.commit()

    row = service.record(provider)
    return {"provider": provider, **_safe_status(row, db, provider)}


@router.post("/providers/{provider}/test")
def test_provider(
    provider: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Re-test the stored credential."""
    _provider_or_404(provider)
    service = ProviderCredentialService(db)
    api_key = service.get_credential(provider)
    if not api_key:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "No API key is configured for this provider."
        )

    adapter = get_provider(provider)
    result = adapter.test_connection(api_key)
    service.mark_tested(
        provider,
        status="connected" if result.ok else _status_for(result.category),
        models_available=result.models_available,
        error=None if result.ok else result.message,
    )
    row = service.record(provider)
    return {
        "provider": provider,
        "ok": result.ok,
        "category": result.category,
        "message": result.message,
        "latency_ms": result.latency_ms,
        **_safe_status(row, db, provider),
    }


def _status_for(category: str) -> str:
    if category == "invalid_api_key":
        return "invalid_credential"
    if category in {"provider_unavailable", "rate_limited"}:
        return "provider_unavailable"
    return "connection_failed"


@router.delete("/providers/{provider}/credential", status_code=204)
def delete_credential(
    provider: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    _provider_or_404(provider)
    service = ProviderCredentialService(db)
    if not service.delete_credential(provider):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No credential to remove.")

    # A disconnected provider must not remain the platform default.
    row = _settings_row(db)
    if row.default_provider == provider:
        row.default_provider = None
        row.default_model_id = None

    db.query(TtLlmModel).filter(TtLlmModel.provider == provider).update(
        {"enabled": False}
    )
    audit(
        db,
        identity,
        "llm_provider_disconnected",
        f"Removed the {provider} provider credential",
        entity="llm_provider",
        entity_id=provider,
    )
    db.commit()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
@router.get("/providers/{provider}/models", response_model=list[ModelOut])
def list_models(
    provider: str,
    search: str | None = Query(default=None, max_length=120),
    enabled_only: bool = False,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    _provider_or_404(provider)
    query = db.query(TtLlmModel).filter(TtLlmModel.provider == provider)
    if enabled_only:
        query = query.filter(TtLlmModel.enabled.is_(True))
    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.filter(TtLlmModel.model_id.ilike(pattern))
    return query.order_by(TtLlmModel.enabled.desc(), TtLlmModel.model_id).all()


@router.post("/providers/{provider}/models/refresh")
def refresh_models(
    provider: str,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Re-fetch the catalogue. Local enable/disable choices are preserved."""
    _provider_or_404(provider)
    service = ProviderCredentialService(db)
    api_key = service.get_credential(provider)
    if not api_key:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Connect the provider before refreshing models."
        )

    adapter = get_provider(provider)
    try:
        discovered = adapter.list_models(api_key)
    except ProviderError as error:
        service.mark_tested(
            provider, status=_status_for(error.category), error=error.message
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            {"category": error.category, "message": error.message},
        ) from None

    existing = {
        row.model_id: row
        for row in db.query(TtLlmModel).filter(TtLlmModel.provider == provider)
    }
    seen: set[str] = set()
    added = 0

    for model in discovered:
        seen.add(model.model_id)
        row = existing.get(model.model_id)
        if row is None:
            db.add(
                TtLlmModel(
                    provider=provider,
                    model_id=model.model_id,
                    display_name=model.display_name,
                    context_window=model.context_window,
                    input_price=model.input_price,
                    output_price=model.output_price,
                    supports_tools=model.supports_tools,
                    supports_vision=model.supports_vision,
                    supports_reasoning=model.supports_reasoning,
                    enabled=False,
                )
            )
            added += 1
        else:
            # Refresh metadata but never override the admin's enable choice.
            row.display_name = model.display_name
            row.context_window = model.context_window
            row.input_price = model.input_price
            row.output_price = model.output_price
            row.supports_tools = model.supports_tools
            row.supports_vision = model.supports_vision
            row.supports_reasoning = model.supports_reasoning

    # Models the provider withdrew are disabled, not deleted, so history and
    # the default-model reference stay intact.
    removed = 0
    for model_id, row in existing.items():
        if model_id not in seen and row.enabled:
            row.enabled = False
            removed += 1

    service.mark_tested(provider, status="connected", models_available=len(discovered))
    audit(
        db,
        identity,
        "llm_models_refreshed",
        f"Refreshed {provider} models ({len(discovered)} available, {added} new)",
        entity="llm_provider",
        entity_id=provider,
    )
    db.commit()
    return {
        "provider": provider,
        "models_available": len(discovered),
        "added": added,
        "withdrawn": removed,
    }


@router.patch("/models/{model_pk}", response_model=ModelOut)
def update_model(
    model_pk: int,
    payload: ModelPatch,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    row = db.query(TtLlmModel).filter(TtLlmModel.id == model_pk).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown model.")

    row.enabled = payload.enabled
    if not payload.enabled:
        settings_row = _settings_row(db)
        if (
            settings_row.default_provider == row.provider
            and settings_row.default_model_id == row.model_id
        ):
            settings_row.default_provider = None
            settings_row.default_model_id = None

    audit(
        db,
        identity,
        "llm_model_updated",
        f"{'Enabled' if payload.enabled else 'Disabled'} {row.provider}/{row.model_id}",
        entity="llm_model",
        entity_id=row.model_id,
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/models/{model_pk}/test")
def test_model(
    model_pk: int,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    """Run one minimal generation against a model, on explicit request only."""
    row = db.query(TtLlmModel).filter(TtLlmModel.id == model_pk).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown model.")

    service = ProviderCredentialService(db)
    api_key = service.get_credential(row.provider)
    if not api_key:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "No API key is configured for this provider."
        )

    adapter = get_provider(row.provider)
    result = adapter.test_completion(api_key, row.model_id)

    row.last_tested_at = datetime.utcnow()
    row.last_test_ok = result.ok
    row.last_test_ms = result.latency_ms
    row.last_test_error = None if result.ok else result.message[:300]
    db.commit()

    return {
        "ok": result.ok,
        "category": result.category,
        "message": result.message,
        "latency_ms": result.latency_ms,
        "provider": row.provider,
        "model_id": row.model_id,
        "sample": result.sample,
    }


# ---------------------------------------------------------------------------
# Default model
# ---------------------------------------------------------------------------
@router.get("/default")
def get_default(
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    row = _settings_row(db)
    return {
        "provider": row.default_provider,
        "model_id": row.default_model_id,
        "updated_at": row.updated_at,
    }


@router.put("/default")
def set_default(
    payload: DefaultIn,
    db: Session = Depends(get_db),
    identity: Identity = Depends(require_super_admin),
):
    row = _settings_row(db)

    if payload.provider is None or payload.model_id is None:
        row.default_provider = None
        row.default_model_id = None
    else:
        _provider_or_404(payload.provider)
        model = (
            db.query(TtLlmModel)
            .filter(
                TtLlmModel.provider == payload.provider,
                TtLlmModel.model_id == payload.model_id,
            )
            .first()
        )
        if model is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown model.")
        if not model.enabled:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Enable the model before making it the default.",
            )
        row.default_provider = payload.provider
        row.default_model_id = payload.model_id

    row.updated_by = identity.email
    audit(
        db,
        identity,
        "llm_default_changed",
        f"Default model set to {row.default_provider or 'none'}/{row.default_model_id or 'none'}",
        entity="llm_settings",
    )
    db.commit()
    db.refresh(row)
    return {"provider": row.default_provider, "model_id": row.default_model_id}
