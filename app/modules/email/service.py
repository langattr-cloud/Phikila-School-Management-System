"""Email delivery interface. Delivery is disabled until a supported provider is configured."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

from app.modules.email.templates import get_templates_catalog, render_template

logger = logging.getLogger("phikila.email")


class EmailDeliveryService:
    """Keep template rendering available without a configured delivery provider."""

    api_key = ""
    default_from = ""

    def is_configured(self) -> bool:
        return False

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
        logger.warning("Email delivery is disabled; no message was sent.")
        return {
            "success": False,
            "error": "Email delivery is disabled. Configure a supported provider before sending email.",
            "to": to,
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
        return self.send_templated_email(to=to, template_id="general_notification", context={"name": to.split("@")[0].capitalize(), "title": "Phikila Email Delivery Test", "message": "Email delivery is currently disabled in this deployment.", "school_name": "Phikila System", "action_label": "Go to Dashboard", "action_url": "https://phikila.school", "details_table": {"Provider": "Disabled", "Delivery Status": "Disabled", "Environment": getattr(settings, "environment", "production")}})


# Global singleton instance
email_service = EmailDeliveryService()
