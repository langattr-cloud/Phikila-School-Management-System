import os
import logging
from typing import List, Optional

logger = logging.getLogger("phikila.email")

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL", "Phikila School System <notifications@phikila.com>")

def send_email(
    to: str | List[str],
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """Send an email using Resend API.

    If RESEND_API_KEY is not set, logs the email details to console for development.
    """
    recipients = [to] if isinstance(to, str) else to

    if not RESEND_API_KEY:
        logger.info("[Resend Dev Mode] Email dispatch skipped (RESEND_API_KEY missing).")
        logger.info(f"To: {recipients} | Subject: {subject}\nContent: {html_content}")
        return True

    try:
        import resend
        resend.api_key = RESEND_API_KEY

        params = {
            "from": FROM_EMAIL,
            "to": recipients,
            "subject": subject,
            "html": html_content,
        }
        if text_content:
            params["text"] = text_content

        resend.Emails.send(params)
        logger.info(f"Successfully sent email to {recipients} via Resend.")
        return True
    except Exception as e:
        logger.error(f"Failed to send email via Resend to {recipients}: {e}")
        return False


def send_access_approval_email(email: str, school_name: str, role: str) -> bool:
    """Send approval confirmation email to an access applicant."""
    subject = f"Access Approved: {school_name} on Phikila"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #14231d;">
      <h2 style="color: #0f2a47;">Your Access Request has been Approved!</h2>
      <p>Hello,</p>
      <p>Your request to join <strong>{school_name}</strong> as an <strong>{role.capitalize()}</strong> has been approved by a platform administrator.</p>
      <p>You can now sign in to your dashboard and start managing schedules, classes, and records.</p>
      <p><a href="https://app.phikila.com/login" style="background-color: #0f2a47; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">Sign In to Phikila</a></p>
      <hr style="border: 0; border-top: 1px solid #dcd8cc; margin: 20px 0;" />
      <p style="font-size: 0.85em; color: #5a6660;">Phikila School Management System</p>
    </div>
    """
    return send_email(to=email, subject=subject, html_content=html_content)


def send_access_rejection_email(email: str, note: Optional[str] = None) -> bool:
    """Send rejection notification email to an access applicant."""
    subject = "Update regarding your Phikila Access Request"
    reason = f"<p><em>Note from administrator:</em> {note}</p>" if note else ""
    html_content = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #14231d;">
      <h2 style="color: #9a2f24;">Access Request Update</h2>
      <p>Hello,</p>
      <p>Thank you for submitting an access request to Phikila. Unfortunately, your request could not be approved at this time.</p>
      {reason}
      <p>If you believe this was in error, please contact your school administrator or support team.</p>
      <hr style="border: 0; border-top: 1px solid #dcd8cc; margin: 20px 0;" />
      <p style="font-size: 0.85em; color: #5a6660;">Phikila School Management System</p>
    </div>
    """
    return send_email(to=email, subject=subject, html_content=html_content)


def send_feature_announcement_email(
    recipients: List[str],
    feature_title: str,
    feature_description: str
) -> bool:
    """Send feature announcement broadcast individually to each user to preserve privacy."""
    subject = f"New Feature: {feature_title} on Phikila"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #14231d;">
      <h2 style="color: #0f2a47;">🚀 New Feature Release: {feature_title}</h2>
      <p>Hello Phikila User,</p>
      <p>We are excited to announce a new feature upgrade to the Phikila School Management System:</p>
      <div style="background-color: #faf9f5; border-left: 4px solid #12a47c; padding: 15px; margin: 15px 0;">
        <h3 style="margin-top: 0; color: #0f2a47;">{feature_title}</h3>
        <p style="margin-bottom: 0;">{feature_description}</p>
      </div>
      <p><a href="https://app.phikila.com" style="background-color: #12a47c; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">Try it now on Phikila</a></p>
      <hr style="border: 0; border-top: 1px solid #dcd8cc; margin: 20px 0;" />
      <p style="font-size: 0.85em; color: #5a6660;">Phikila School Management System</p>
    </div>
    """

    success_count = 0
    for recipient in set(recipients):
        if send_email(to=recipient, subject=subject, html_content=html_content):
            success_count += 1

    return success_count > 0
