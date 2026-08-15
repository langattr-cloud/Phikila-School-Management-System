"""FastAPI router for Email and Template endpoints."""

from __future__ import annotations

from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.modules.email.schemas import (
    EmailSendRequest,
    EmailServiceStatusResponse,
    EmailTestRequest,
    TemplateDescriptor,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
)
from app.modules.email.service import email_service
from app.modules.email.templates import get_templates_catalog, render_template
from app.modules.platform.authz import Identity, require_active_access, require_super_admin

router = APIRouter()


@router.get("/status", response_model=EmailServiceStatusResponse)
def get_email_status(
    identity: Identity = Depends(require_active_access),
):
    """Check current email service configuration and templates count."""
    api_key = email_service.api_key or ""
    masked = ""
    if len(api_key) > 8:
        masked = f"{api_key[:6]}...{api_key[-4:]}"
    elif api_key:
        masked = "configured"
    else:
        masked = "not configured"

    catalog = get_templates_catalog()
    return {
        "provider": "Resend",
        "configured": email_service.is_configured(),
        "api_key_masked": masked,
        "default_from": email_service.default_from,
        "templates_count": len(catalog),
    }


@router.get("/templates", response_model=List[TemplateDescriptor])
def list_templates(
    identity: Identity = Depends(require_active_access),
):
    """List all available email templates with sample variables."""
    return get_templates_catalog()


@router.get("/templates/{template_id}")
def get_template(
    template_id: str,
    identity: Identity = Depends(require_active_access),
):
    """Get metadata and default preview for a single template."""
    catalog = {t["id"]: t for t in get_templates_catalog()}
    if template_id not in catalog:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template '{template_id}' not found.",
        )
    descriptor = catalog[template_id]
    preview = render_template(template_id, descriptor.get("sample_context", {}))
    return {
        **descriptor,
        "preview": preview,
    }


@router.post("/preview", response_model=TemplatePreviewResponse)
def preview_template(
    payload: TemplatePreviewRequest,
    identity: Identity = Depends(require_active_access),
):
    """Render a template with supplied context variables for live preview."""
    try:
        result = render_template(payload.template_id, payload.context or {})
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/test")
def send_test_email(
    payload: EmailTestRequest,
    identity: Identity = Depends(require_super_admin),
):
    """Send a test email using Resend to verify configuration."""
    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resend API key is not configured.",
        )

    result = email_service.send_test_email(to=payload.to, template_id=payload.template_id)
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.get("error", "Failed to send test email."),
        )
    return result


@router.post("/send")
def send_email(
    payload: EmailSendRequest,
    identity: Identity = Depends(require_super_admin),
):
    """Send a transactional or custom email."""
    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resend API key is not configured.",
        )

    if payload.template_id:
        result = email_service.send_templated_email(
            to=payload.to,
            template_id=payload.template_id,
            context=payload.context,
            custom_subject=payload.subject,
            from_email=payload.from_email,
        )
    elif payload.html or payload.text:
        if not payload.subject:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Subject is required when sending raw email content.",
            )
        result = email_service.send_email(
            to=payload.to,
            subject=payload.subject,
            html=payload.html,
            text=payload.text,
            from_email=payload.from_email,
            reply_to=payload.reply_to,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either template_id or html/text must be provided.",
        )

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=result.get("error", "Failed to deliver email via Resend."),
        )

    return result
