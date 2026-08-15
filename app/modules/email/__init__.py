"""Email and transactional templates module."""

from app.modules.email.service import email_service
from app.modules.email.templates import get_templates_catalog, render_template

__all__ = ["email_service", "get_templates_catalog", "render_template"]
