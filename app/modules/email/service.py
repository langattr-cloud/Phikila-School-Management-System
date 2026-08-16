"""Resend email service implementation for Phikila School Management System."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Union

from app.config import settings
from app.modules.email.templates import get_templates_catalog, render_template

logger = logging.getLogger("phikila.email")

# Try importing official resend library
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    resend = None  # type: ignore
    RESEND_AVAILABLE = False


class ResendEmailService:
    """Service to send emails using the Resend API with template rendering support."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        default_from: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or getattr(settings, "resend_api_key", "")
        self.default_from = default_from or getattr(
            settings, "resend_from_email", "Phikila School System <onboarding@resend.dev>"
        )

        if RESEND_AVAILABLE and self.api_key:
            resend.api_key = self.api_key

    def is_configured(self) -> bool:
        """Returns True if a valid API key is present."""
        return bool(self.api_key and self.api_key.startswith("re_"))

    def send_email(
        self,
        to: Union[str, List[str]],
        subject: str,
        html: Optional[str] = None,
        text: Optional[str] = None,
        from_email: Optional[str] = None,
        reply_to: Optional[str] = None,
        tags: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Send an email using Resend API.

        Falls back to direct HTTPS call if the SDK encounters an environment issue.
        """
        if not self.is_configured():
            logger.warning("Resend API key is not configured. Email not sent.")
            return {
                "success": False,
                "error": "Resend API key is not configured.",
                "to": to,
                "subject": subject,
            }

        recipients = [to] if isinstance(to, str) else to
        sender = from_email or self.default_from

        payload: Dict[str, Any] = {
            "from": sender,
            "to": recipients,
            "subject": subject,
        }
        if html:
            payload["html"] = html
        if text:
            payload["text"] = text
        if reply_to:
            payload["reply_to"] = reply_to
        if tags:
            payload["tags"] = tags

        if RESEND_AVAILABLE:
            try:
                resend.api_key = self.api_key
                response = resend.Emails.send(payload)
                email_id = getattr(response, "id", None) or (
                    response.get("id") if isinstance(response, dict) else str(response)
                )
                logger.info(f"Email sent successfully via Resend SDK to {recipients}: {email_id}")
                return {
                    "success": True,
                    "id": email_id,
                    "to": recipients,
                    "subject": subject,
                }
            except Exception as exc:
                logger.warning(
                    f"Resend SDK send attempt failed: {exc}. Attempting direct HTTP fallback..."
                )

        try:
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=req_data,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Phikila-School-System/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                email_id = resp_data.get("id", "sent")
                logger.info(f"Email sent via Resend HTTP API to {recipients}: {email_id}")
                return {
                    "success": True,
                    "id": email_id,
                    "to": recipients,
                    "subject": subject,
                }
        except urllib.error.HTTPError as http_err:
            error_body = http_err.read().decode("utf-8", errors="replace")
            logger.error(f"Resend HTTP error {http_err.code}: {error_body}")
            return {
                "success": False,
                "error": f"Resend API error ({http_err.code}): {error_body}",
                "to": recipients,
                "subject": subject,
            }
        except Exception as err:
            logger.error(f"Failed to deliver email to {recipients}: {err}")
            return {
                "success": False,
                "error": str(err),
                "to": recipients,
                "subject": subject,
            }

    def send_templated_email(
        self,
        to: Union[str, List[str]],
        template_id: str,
        context: Optional[Dict[str, Any]] = None,
        custom_subject: Optional[str] = None,
        from_email: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Render a registered template and send it to recipient(s)."""
        rendered = render_template(template_id, context or {})
        subject = custom_subject or rendered["subject"]

        return self.send_email(
            to=to,
            subject=subject,
            html=rendered["html"],
            text=rendered["text"],
            from_email=from_email,
            tags=[{"name": "template", "value": template_id}],
        )

    def send_welcome_email(self, to: str, name: str, role: str = "Member", school_name: str = "Phikila School", login_url: Optional[str] = None) -> Dict[str, Any]:
        return self.send_templated_email(to=to, template_id="welcome", context={"name": name, "email": to, "role": role, "school_name": school_name, "login_url": login_url or "https://phikila.school/login"})

    def send_access_request_submitted_email(self, to: str, school_name: Optional[str] = None, requested_role: Optional[str] = None, name: Optional[str] = None) -> Dict[str, Any]:
        return self.send_templated_email(to=to, template_id="access_request_submitted", context={"name": name or to.split("@")[0].capitalize(), "school_name": school_name or "Phikila School", "requested_role": requested_role or "Member"})

    def send_access_request_approved_email(self, to: str, school_name: str, role: str, name: Optional[str] = None, login_url: Optional[str] = None) -> Dict[str, Any]:
        return self.send_templated_email(to=to, template_id="access_request_approved", context={"name": name or to.split("@")[0].capitalize(), "school_name": school_name, "role": role.capitalize(), "login_url": login_url or "https://phikila.school/login"})

    def send_access_request_rejected_email(self, to: str, school_name: Optional[str] = None, reason: Optional[str] = None, name: Optional[str] = None) -> Dict[str, Any]:
        return self.send_templated_email(to=to, template_id="access_request_rejected", context={"name": name or to.split("@")[0].capitalize(), "school_name": school_name or "the requested school", "reason": reason or "The administrator was unable to approve this request."})

    def send_role_assigned_email(self, to: str, school_name: str, role: str, assigned_by: Optional[str] = None, name: Optional[str] = None, login_url: Optional[str] = None) -> Dict[str, Any]:
        return self.send_templated_email(to=to, template_id="role_assigned", context={"name": name or to.split("@")[0].capitalize(), "school_name": school_name, "role": role.capitalize(), "assigned_by": assigned_by or "School Administrator", "login_url": login_url or "https://phikila.school/login"})

    def send_password_reset_email(self, to: str, reset_url: str, name: Optional[str] = None, expires_in: str = "30 minutes") -> Dict[str, Any]:
        return self.send_templated_email(to=to, template_id="password_reset", context={"name": name or to.split("@")[0].capitalize(), "reset_url": reset_url, "expires_in": expires_in})

    def send_timetable_published_email(self, to: Union[str, List[str]], school_name: str, version_number: Union[int, str], term: Optional[str] = None, effective_date: Optional[str] = None, timetable_url: Optional[str] = None, notes: Optional[str] = None) -> Dict[str, Any]:
        return self.send_templated_email(to=to, template_id="timetable_published", context={"school_name": school_name, "version_number": version_number, "term": term or "Current Academic Term", "effective_date": effective_date or "Immediately", "timetable_url": timetable_url or "https://phikila.school/timetable", "notes": notes})

    def send_test_email(self, to: str, template_id: Optional[str] = None) -> Dict[str, Any]:
        if template_id:
            catalog = {t["id"]: t for t in get_templates_catalog()}
            tmpl = catalog.get(template_id)
            sample_ctx = tmpl["sample_context"] if tmpl else {}
            return self.send_templated_email(to=to, template_id=template_id, context=sample_ctx)
        return self.send_templated_email(to=to, template_id="general_notification", context={"name": to.split("@")[0].capitalize(), "title": "Phikila Resend Integration Test", "message": "This is a test email sent from Phikila School Management System verifying your Resend email configuration and API key.", "school_name": "Phikila System", "action_label": "Go to Dashboard", "action_url": "https://phikila.school", "details_table": {"Provider": "Resend", "API Key Status": "Active", "Environment": getattr(settings, "environment", "production")}})


# Global singleton instance
email_service = ResendEmailService()
