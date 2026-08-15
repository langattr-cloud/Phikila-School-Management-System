"""Pydantic schemas for Email and Template endpoints."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmailSendRequest(BaseModel):
    """Request payload to send an email."""
    to: Union[EmailStr, List[EmailStr]]
    subject: Optional[str] = None
    template_id: Optional[str] = Field(None, description="Template identifier to render")
    context: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Variables for template")
    html: Optional[str] = Field(None, description="Raw HTML body if template_id is omitted")
    text: Optional[str] = Field(None, description="Raw Plain text body if template_id is omitted")
    from_email: Optional[str] = None
    reply_to: Optional[str] = None


class EmailTestRequest(BaseModel):
    """Request payload for sending a test email."""
    to: EmailStr
    template_id: Optional[str] = Field(None, description="Optional template to test")


class TemplatePreviewRequest(BaseModel):
    """Request payload for previewing a template."""
    template_id: str
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)


class TemplatePreviewResponse(BaseModel):
    """Rendered template preview."""
    template_id: str
    subject: str
    html: str
    text: str


class TemplateDescriptor(BaseModel):
    """Metadata describing a template."""
    id: str
    name: str
    category: str
    description: str
    default_subject: str
    sample_context: Dict[str, Any]


class EmailServiceStatusResponse(BaseModel):
    """Current email provider status."""
    provider: str = "Resend"
    configured: bool
    api_key_masked: str
    default_from: str
    templates_count: int
