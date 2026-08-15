"""Email templates and rendering engine for Phikila School Management System.

Provides responsive, inline-styled HTML and plain-text templates for all core
school system transactional emails.
"""

from __future__ import annotations

import html
from typing import Any, Dict, List, Optional, Tuple


def _escape(val: Any) -> str:
    if val is None:
        return ""
    return html.escape(str(val))


def _base_layout(
    *,
    title: str,
    preheader: str,
    content_html: str,
    action_button: Optional[Tuple[str, str]] = None,
    footer_note: Optional[str] = None,
) -> str:
    """Standard responsive email wrapper with Phikila styling."""
    action_html = ""
    if action_button:
        btn_label, btn_url = action_button
        action_html = f"""
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 16px 0;">
          <tr>
            <td align="center">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #4f46e5;">
                    <a href="{_escape(btn_url)}" target="_blank" style="font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; display: inline-block; letter-spacing: 0.2px;">
                      {_escape(btn_label)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        """

    footer_text = footer_note or "You received this email because of your account on Phikila School Management System."

    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{_escape(title)}</title>
  <style type="text/css">
    body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
    table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
    img {{ -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }}
    body {{ height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }}
    @media screen and (max-width: 600px) {{
      .email-container {{ width: 100% !important; margin: auto !important; }}
      .fluid {{ max-width: 100% !important; height: auto !important; margin-left: auto !important; margin-right: auto !important; }}
      .stack-column {{ display: block !important; width: 100% !important; max-width: 100% !important; direction: ltr !important; }}
      .content-padding {{ padding: 24px 20px !important; }}
    }}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9;">
  <!-- Preheader text for email clients -->
  <div style="display: none; font-size: 1px; color: #fefefe; line-height: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    {_escape(preheader)}
  </div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px;" class="email-container">
          <!-- Brand Header -->
          <tr>
            <td align="left" style="padding: 0 0 20px 4px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="padding-right: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: #ffffff; font-weight: 800; font-size: 18px; line-height: 32px; text-align: center;">
                      P
                    </div>
                  </td>
                  <td valign="middle">
                    <span style="font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">
                      Phikila <span style="font-weight: 400; color: #64748b; font-size: 14px;">School System</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td bgcolor="#ffffff" style="background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); overflow: hidden;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <!-- Header Stripe -->
                <tr>
                  <td height="4" style="background: linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%); font-size: 1px; line-height: 4px;">&nbsp;</td>
                </tr>
                <tr>
                  <td class="content-padding" style="padding: 36px 32px;">
                    <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                      {_escape(title)}
                    </h1>

                    <div style="font-size: 15px; line-height: 1.6; color: #334155;">
                      {content_html}
                    </div>

                    {action_html}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 8px 12px 8px; text-align: center; font-size: 12px; line-height: 1.5; color: #64748b;">
              <p style="margin: 0 0 8px 0;">{_escape(footer_text)}</p>
              <p style="margin: 0; color: #94a3b8;">
                &copy; 2026 Phikila School Management System. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _info_card(rows: List[Tuple[str, str]]) -> str:
    """Helper to render a styled table of key-value attributes."""
    trs = []
    for label, val in rows:
        trs.append(
            f"""<tr>
                <td style="padding: 8px 12px; font-size: 13px; font-weight: 600; color: #64748b; width: 35%; border-bottom: 1px solid #f1f5f9;">{_escape(label)}</td>
                <td style="padding: 8px 12px; font-size: 14px; font-weight: 500; color: #0f172a; border-bottom: 1px solid #f1f5f9;">{_escape(val)}</td>
            </tr>"""
        )
    return f"""
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; border-collapse: separate; overflow: hidden;">
      {"".join(trs)}
    </table>
    """


# ---------------------------------------------------------------------------
# Template Definitions
# ---------------------------------------------------------------------------

TEMPLATES_CATALOG: Dict[str, Dict[str, Any]] = {
    "welcome": {
        "id": "welcome",
        "name": "Welcome to Phikila",
        "category": "Onboarding",
        "description": "Sent to new users when their account is created.",
        "default_subject": "Welcome to Phikila School Management System",
        "sample_context": {
            "name": "Jane Mwangi",
            "email": "jane@example.com",
            "school_name": "Phikila Academy",
            "role": "Teacher",
            "login_url": "https://phikila.school/login",
        },
    },
    "access_request_submitted": {
        "id": "access_request_submitted",
        "name": "Access Request Submitted",
        "category": "Authentication",
        "description": "Sent when an applicant requests access to a school.",
        "default_subject": "Access Request Received - Phikila School System",
        "sample_context": {
            "name": "David Otieno",
            "school_name": "Phikila High School",
            "requested_role": "Teacher",
            "submitted_at": "Today",
        },
    },
    "access_request_approved": {
        "id": "access_request_approved",
        "name": "Access Request Approved",
        "category": "Authentication",
        "description": "Sent when a platform administrator approves a user's access request.",
        "default_subject": "Your Access Request Has Been Approved!",
        "sample_context": {
            "name": "David Otieno",
            "school_name": "Phikila High School",
            "role": "Teacher",
            "login_url": "https://phikila.school/login",
            "approver_name": "Platform Administrator",
        },
    },
    "access_request_rejected": {
        "id": "access_request_rejected",
        "name": "Access Request Update",
        "category": "Authentication",
        "description": "Sent when an access request could not be approved.",
        "default_subject": "Update regarding your access request",
        "sample_context": {
            "name": "David Otieno",
            "school_name": "Phikila High School",
            "reason": "Please register using your official staff email address.",
        },
    },
    "role_assigned": {
        "id": "role_assigned",
        "name": "Role Assignment / Invitation",
        "category": "Administration",
        "description": "Sent when an administrator assigns a role or grants access at a school.",
        "default_subject": "You have been granted access to {school_name}",
        "sample_context": {
            "name": "Grace Kimani",
            "school_name": "Phikila Secondary",
            "role": "Scheduler",
            "assigned_by": "Principal Office",
            "login_url": "https://phikila.school/login",
        },
    },
    "password_reset": {
        "id": "password_reset",
        "name": "Password Reset",
        "category": "Security",
        "description": "Sent when a user requests a password reset link.",
        "default_subject": "Reset your Phikila School System password",
        "sample_context": {
            "name": "Alex Mutua",
            "reset_url": "https://phikila.school/reset-password?token=sample-reset-token-12345",
            "expires_in": "30 minutes",
        },
    },
    "timetable_published": {
        "id": "timetable_published",
        "name": "New Timetable Published",
        "category": "Scheduling",
        "description": "Sent to school staff and students when an active timetable is published.",
        "default_subject": "New Timetable Published: Version {version_number} - {school_name}",
        "sample_context": {
            "name": "School Staff",
            "school_name": "Phikila Academy",
            "version_number": 2,
            "term": "Term 2 2026",
            "effective_date": "Monday, 18 Aug 2026",
            "timetable_url": "https://phikila.school/timetable",
            "notes": "Includes updated laboratory allocations and Friday afternoon activities.",
        },
    },
    "general_notification": {
        "id": "general_notification",
        "name": "General Notification / Alert",
        "category": "Notifications",
        "description": "Multipurpose notification template with custom message and actions.",
        "default_subject": "{title} - Phikila School System",
        "sample_context": {
            "name": "Staff Member",
            "title": "Scheduled System Maintenance",
            "message": "Phikila School System will undergo scheduled maintenance this Sunday from 02:00 to 04:00 EAT. All services will resume immediately after.",
            "school_name": "Phikila System",
            "action_label": "View Dashboard",
            "action_url": "https://phikila.school",
        },
    },
}


def render_welcome(ctx: Dict[str, Any]) -> Tuple[str, str, str]:
    name = ctx.get("name", "there")
    school_name = ctx.get("school_name", "Phikila School")
    role = ctx.get("role", "Member")
    login_url = ctx.get("login_url", "https://phikila.school/login")

    subject = f"Welcome to Phikila School System - {school_name}"
    preheader = f"Your account has been set up as {role} at {school_name}."

    content = f"""
    <p>Hello <strong>{_escape(name)}</strong>,</p>
    <p>Welcome to <strong>Phikila School Management System</strong>! Your account has been registered and is ready to use.</p>
    {_info_card([
        ("School", school_name),
        ("Assigned Role", role),
        ("Username / Email", ctx.get("email", name)),
    ])}
    <p>You can now sign in to view and manage your timetable, classes, and school operations.</p>
    """

    html_out = _base_layout(
        title="Welcome to Phikila",
        preheader=preheader,
        content_html=content,
        action_button=("Sign in to Phikila", login_url),
    )

    text_out = f"""Welcome to Phikila School System - {school_name}

Hello {name},

Welcome to Phikila School Management System! Your account has been registered and is ready to use.

School: {school_name}
Role: {role}
Login: {login_url}

Sign in here: {login_url}
"""
    return subject, html_out, text_out


def render_access_request_submitted(ctx: Dict[str, Any]) -> Tuple[str, str, str]:
    name = ctx.get("name", "Applicant")
    school_name = ctx.get("school_name", "your school")
    role = ctx.get("requested_role", "Member")

    subject = f"Access request received - {school_name}"
    preheader = f"Your request to join {school_name} has been received and is awaiting approval."

    content = f"""
    <p>Hello <strong>{_escape(name)}</strong>,</p>
    <p>We have received your request to join <strong>{_escape(school_name)}</strong> on Phikila School System.</p>
    {_info_card([
        ("School", school_name),
        ("Requested Role", role),
        ("Status", "Pending Review"),
    ])}
    <p style="color: #475569;">A school or platform administrator will review your application shortly. You will receive an email as soon as your access has been decided.</p>
    """

    html_out = _base_layout(
        title="Access Request Received",
        preheader=preheader,
        content_html=content,
        footer_note="If you did not request this access, please ignore this email.",
    )

    text_out = f"""Access Request Received - {school_name}

Hello {name},

We have received your request to join {school_name} on Phikila School System.

School: {school_name}
Requested Role: {role}
Status: Pending Review

An administrator will review your application shortly.
"""
    return subject, html_out, text_out


def render_access_request_approved(ctx: Dict[str, Any]) -> Tuple[str, str, str]:
    name = ctx.get("name", "there")
    school_name = ctx.get("school_name", "your school")
    role = ctx.get("role", "Member")
    login_url = ctx.get("login_url", "https://phikila.school/login")

    subject = f"Access Approved: Welcome to {school_name}"
    preheader = f"Your access request to join {school_name} as {role} has been approved."

    content = f"""
    <p>Hello <strong>{_escape(name)}</strong>,</p>
    <p style="color: #16a34a; font-weight: 600; font-size: 16px;">Great news! Your access request has been approved.</p>
    <p>You can now access <strong>{_escape(school_name)}</strong> with the following permissions:</p>
    {_info_card([
        ("School", school_name),
        ("Approved Role", role),
        ("Status", "Active"),
    ])}
    <p>Click below to sign in and begin:</p>
    """

    html_out = _base_layout(
        title="Access Request Approved",
        preheader=preheader,
        content_html=content,
        action_button=("Sign in Now", login_url),
    )

    text_out = f"""Access Approved: Welcome to {school_name}

Hello {name},

Great news! Your access request has been approved.

School: {school_name}
Approved Role: {role}
Status: Active

Sign in here: {login_url}
"""
    return subject, html_out, text_out


def render_access_request_rejected(ctx: Dict[str, Any]) -> Tuple[str, str, str]:
    name = ctx.get("name", "there")
    school_name = ctx.get("school_name", "the requested school")
    reason = ctx.get("reason", "The administrator was unable to verify your affiliation with this school.")

    subject = f"Update on your access request - {school_name}"
    preheader = f"Update regarding your request to access {school_name}."

    content = f"""
    <p>Hello <strong>{_escape(name)}</strong>,</p>
    <p>Thank you for your interest in Phikila School System. An administrator has reviewed your request to join <strong>{_escape(school_name)}</strong>.</p>
    <div style="background-color: #fff1f2; border-left: 4px solid #f43f5e; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: #9f1239;"><strong>Reason / Note:</strong> {_escape(reason)}</p>
    </div>
    <p style="color: #475569; font-size: 14px;">If you believe this was in error, please contact your school administrator or reach out to support.</p>
    """

    html_out = _base_layout(
        title="Access Request Update",
        preheader=preheader,
        content_html=content,
    )

    text_out = f"""Update on your access request - {school_name}

Hello {name},

An administrator has reviewed your request to join {school_name}.

Note: {reason}

If you believe this was in error, please contact your school administrator.
"""
    return subject, html_out, text_out


def render_role_assigned(ctx: Dict[str, Any]) -> Tuple[str, str, str]:
    name = ctx.get("name", "there")
    school_name = ctx.get("school_name", "Phikila School")
    role = ctx.get("role", "Member")
    assigned_by = ctx.get("assigned_by", "A school administrator")
    login_url = ctx.get("login_url", "https://phikila.school/login")

    subject = f"You have been assigned the {role} role at {school_name}"
    preheader = f"You were granted the {role} role at {school_name}."

    content = f"""
    <p>Hello <strong>{_escape(name)}</strong>,</p>
    <p><strong>{_escape(assigned_by)}</strong> has assigned you a new role in <strong>{_escape(school_name)}</strong> on Phikila.</p>
    {_info_card([
        ("School", school_name),
        ("Role", role),
        ("Granted By", assigned_by),
    ])}
    <p>You can now manage school data and features according to your assigned role.</p>
    """

    html_out = _base_layout(
        title="Role Assignment",
        preheader=preheader,
        content_html=content,
        action_button=("Go to School Dashboard", login_url),
    )

    text_out = f"""You have been assigned the {role} role at {school_name}

Hello {name},

{assigned_by} has assigned you the {role} role in {school_name}.

School: {school_name}
Role: {role}

Access your dashboard here: {login_url}
"""
    return subject, html_out, text_out


def render_password_reset(ctx: Dict[str, Any]) -> Tuple[str, str, str]:
    name = ctx.get("name", "there")
    reset_url = ctx.get("reset_url", "https://phikila.school/reset-password")
    expires_in = ctx.get("expires_in", "30 minutes")

    subject = "Reset your Phikila School System password"
    preheader = "Follow the link inside to set a new password for your account."

    content = f"""
    <p>Hello <strong>{_escape(name)}</strong>,</p>
    <p>We received a request to reset the password for your account on <strong>Phikila School System</strong>.</p>
    <p>Click the button below to choose a new password. For security, this link will expire in <strong>{_escape(expires_in)}</strong>.</p>
    """

    html_out = _base_layout(
        title="Reset Your Password",
        preheader=preheader,
        content_html=content,
        action_button=("Reset Password", reset_url),
        footer_note="If you did not request a password reset, no action is needed. Your account remains secure.",
    )

    text_out = f"""Reset your Phikila School System password

Hello {name},

We received a request to reset your password. Use the link below:

{reset_url}

This link will expire in {expires_in}. If you did not make this request, please ignore this email.
"""
    return subject, html_out, text_out


def render_timetable_published(ctx: Dict[str, Any]) -> Tuple[str, str, str]:
    name = ctx.get("name", "there")
    school_name = ctx.get("school_name", "Phikila School")
    version_num = ctx.get("version_number", "1")
    term = ctx.get("term", "Current Term")
    effective_date = ctx.get("effective_date", "Immediately")
    timetable_url = ctx.get("timetable_url", "https://phikila.school/timetable")
    notes = ctx.get("notes")

    subject = f"New Timetable Published: Version {version_num} - {school_name}"
    preheader = f"A new timetable version ({term}) is now active for {school_name}."

    details = [
        ("School", school_name),
        ("Version", f"v{version_num} (Published)"),
        ("Term / Calendar", term),
        ("Effective From", effective_date),
    ]

    notes_html = ""
    if notes:
        notes_html = f"""
        <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Note from Scheduler:</strong> {_escape(notes)}</p>
        </div>
        """

    content = f"""
    <p>Hello <strong>{_escape(name)}</strong>,</p>
    <p>A new timetable version has been finalized and published for <strong>{_escape(school_name)}</strong>.</p>
    {_info_card(details)}
    {notes_html}
    <p>Please check your updated schedule to review your allocated periods, classrooms, and teaching times.</p>
    """

    html_out = _base_layout(
        title="New Timetable Published",
        preheader=preheader,
        content_html=content,
        action_button=("View Timetable", timetable_url),
    )

    text_out = f"""New Timetable Published: Version {version_num} - {school_name}

Hello {name},

A new timetable version has been published for {school_name}.

Version: v{version_num}
Term: {term}
Effective: {effective_date}
{f'Notes: {notes}' if notes else ''}

View timetable: {timetable_url}
"""
    return subject, html_out, text_out


def render_general_notification(ctx: Dict[str, Any]) -> Tuple[str, str, str]:
    name = ctx.get("name", "there")
    title = ctx.get("title", "School Notification")
    message = ctx.get("message", "")
    school_name = ctx.get("school_name", "Phikila School")
    action_label = ctx.get("action_label")
    action_url = ctx.get("action_url")

    subject = f"{title} - {school_name}"
    preheader = message[:120] if message else title

    details_table = ""
    if "details_table" in ctx and isinstance(ctx["details_table"], dict):
        details_table = _info_card(list(ctx["details_table"].items()))

    content = f"""
    <p>Hello <strong>{_escape(name)}</strong>,</p>
    <p style="font-size: 15px; line-height: 1.6; color: #334155;">{_escape(message).replace(chr(10), '<br/>')}</p>
    {details_table}
    """

    action_btn = (action_label, action_url) if action_label and action_url else None

    html_out = _base_layout(
        title=title,
        preheader=preheader,
        content_html=content,
        action_button=action_btn,
    )

    text_out = f"""{title} - {school_name}

Hello {name},

{message}

{f'{action_label}: {action_url}' if action_btn else ''}
"""
    return subject, html_out, text_out


# Registry of renderers
RENDERERS = {
    "welcome": render_welcome,
    "access_request_submitted": render_access_request_submitted,
    "access_request_approved": render_access_request_approved,
    "access_request_rejected": render_access_request_rejected,
    "role_assigned": render_role_assigned,
    "password_reset": render_password_reset,
    "timetable_published": render_timetable_published,
    "general_notification": render_general_notification,
}


def get_templates_catalog() -> List[Dict[str, Any]]:
    """Return list of all registered template descriptors."""
    return list(TEMPLATES_CATALOG.values())


def render_template(
    template_id: str, context: Optional[Dict[str, Any]] = None
) -> Dict[str, str]:
    """Render template by ID with given context dictionary.

    Returns dict containing subject, html, and text.
    """
    renderer = RENDERERS.get(template_id)
    if not renderer:
        raise ValueError(f"Unknown email template '{template_id}'. Available: {list(RENDERERS.keys())}")

    ctx = context or {}
    subject, html_content, text_content = renderer(ctx)

    # Allow context to override subject if explicitly provided
    if ctx.get("custom_subject"):
        subject = ctx["custom_subject"]

    return {
        "template_id": template_id,
        "subject": subject,
        "html": html_content,
        "text": text_content,
    }
