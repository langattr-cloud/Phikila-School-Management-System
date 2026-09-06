"""Microsoft 365 / Outlook delegated OAuth and report-card delivery."""
from __future__ import annotations

import base64
import hashlib
import html
import secrets
import time
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Session

from app.config import settings
from app.core.database import Base, get_db
from app.modules.platform.authz import Principal, require_active_access
from app.modules.scheduling.tenancy import TtMembership
from app.modules.students.models_v2 import Student

router = APIRouter()

MICROSOFT_AUTHORIZE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
MICROSOFT_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_SEND_MAIL = "https://graph.microsoft.com/v1.0/me/sendMail"
SCOPES = "openid profile email offline_access Mail.Send"


class OutlookConnection(Base):
    __tablename__ = "outlook_connections"
    __table_args__ = (UniqueConstraint("user_id", "school_id", name="uq_outlook_connection_user_school"), {"extend_existing": True})
    id = Column(Integer, primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    email = Column(String(320))
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class ReportCardRecipient(BaseModel):
    email: EmailStr


class ReportCardRow(BaseModel):
    subject: str = Field(max_length=160)
    max_marks: float = Field(ge=0)
    score: float | None = Field(default=None, ge=0)
    percentage: float | None = None
    grade: str | None = Field(default=None, max_length=40)
    remark: str | None = Field(default=None, max_length=500)


class SendReportCardRequest(BaseModel):
    recipient: ReportCardRecipient
    student_name: str = Field(min_length=1, max_length=200)
    admission_number: str = Field(min_length=1, max_length=80)
    examination: str = Field(min_length=1, max_length=200)
    exam_date: str | None = Field(default=None, max_length=40)
    school_name: str = Field(min_length=1, max_length=200)
    total_score: float = Field(ge=0)
    max_total: float = Field(ge=0)
    percentage: float = Field(ge=0)
    average_points: float = Field(ge=0)
    overall_band: str = Field(max_length=40)
    rows: list[ReportCardRow] = Field(max_length=100)


def _configured() -> bool:
    return bool(settings.microsoft_client_id and settings.microsoft_client_secret and settings.microsoft_redirect_uri)


def _require_configured() -> None:
    if not _configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Microsoft Outlook integration is not configured on the server.")


def _state_key(user_id: str, school_id: int) -> str:
    return hashlib.sha256(f"{user_id}:{school_id}:{settings.microsoft_client_secret}".encode()).hexdigest()


def _build_state(user_id: str, school_id: int) -> str:
    payload = f"{user_id}:{school_id}:{int(time.time())}:{secrets.token_urlsafe(24)}"
    signature = hashlib.sha256(f"{payload}:{_state_key(user_id, school_id)}".encode()).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{signature}".encode()).decode().rstrip("=")


def _verify_state(state: str, user_id: str, school_id: int) -> bool:
    try:
        raw = base64.urlsafe_b64decode(state + "=" * (-len(state) % 4)).decode()
        payload, signature = raw.rsplit(":", 1)
        parts = payload.split(":", 3)
        if len(parts) != 4 or parts[0] != user_id or int(parts[1]) != school_id:
            return False
        if abs(time.time() - int(parts[2])) > 600:
            return False
        expected = hashlib.sha256(f"{payload}:{_state_key(user_id, school_id)}".encode()).hexdigest()
        return secrets.compare_digest(signature, expected)
    except (ValueError, UnicodeDecodeError):
        return False


def _token_row(db: Session, principal: Principal) -> OutlookConnection | None:
    return db.query(OutlookConnection).filter(
        OutlookConnection.user_id == principal.user_id,
        OutlookConnection.school_id == principal.school_id,
    ).first()


def _refresh_if_needed(db: Session, row: OutlookConnection) -> str:
    from datetime import datetime, timedelta, timezone
    if row.expires_at.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc) + timedelta(minutes=2):
        return row.access_token
    response = requests.post(MICROSOFT_TOKEN, data={
        "client_id": settings.microsoft_client_id,
        "client_secret": settings.microsoft_client_secret,
        "grant_type": "refresh_token",
        "refresh_token": row.refresh_token,
        "scope": SCOPES,
    }, timeout=15)
    if not response.ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The Microsoft connection expired. Reconnect Outlook to continue.")
    token = response.json()
    row.access_token = token["access_token"]
    row.refresh_token = token.get("refresh_token", row.refresh_token)
    row.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(token.get("expires_in", 3600)))
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return row.access_token


@router.get("/status")
def outlook_status(principal: Principal = Depends(require_active_access), db: Session = Depends(get_db)):
    row = _token_row(db, principal)
    return {"configured": _configured(), "connected": row is not None, "email": row.email if row else None}


@router.get("/connect")
def outlook_connect(principal: Principal = Depends(require_active_access)):
    _require_configured()
    state = _build_state(principal.user_id, principal.school_id)
    query = urlencode({
        "client_id": settings.microsoft_client_id,
        "response_type": "code",
        "redirect_uri": settings.microsoft_redirect_uri,
        "response_mode": "query",
        "scope": SCOPES,
        "state": state,
        "prompt": "select_account",
    })
    from fastapi.responses import RedirectResponse
    return RedirectResponse(f"{MICROSOFT_AUTHORIZE}?{query}", status_code=302)


@router.get("/callback")
def outlook_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    from fastapi.responses import RedirectResponse
    frontend = settings.microsoft_frontend_redirect or settings.microsoft_redirect_uri.rsplit("/api/", 1)[0]
    if error or not code or not state:
        return RedirectResponse(f"{frontend}/examinations/report-card?outlook=error")
    # State carries only the verified application user/school identifiers; no bearer token is exposed to the browser.
    try:
        raw = base64.urlsafe_b64decode(state + "=" * (-len(state) % 4)).decode()
        payload = raw.rsplit(":", 1)[0]
        user_id, school_id_text, _, _ = payload.split(":", 3)
        school_id = int(school_id_text)
    except (ValueError, UnicodeDecodeError):
        return RedirectResponse(f"{frontend}/examinations/report-card?outlook=error")
    if not _verify_state(state, user_id, school_id):
        return RedirectResponse(f"{frontend}/examinations/report-card?outlook=error")
    response = requests.post(MICROSOFT_TOKEN, data={
        "client_id": settings.microsoft_client_id,
        "client_secret": settings.microsoft_client_secret,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.microsoft_redirect_uri,
        "scope": SCOPES,
    }, timeout=15)
    if not response.ok:
        return RedirectResponse(f"{frontend}/examinations/report-card?outlook=error")
    token = response.json()
    access_token = token.get("access_token")
    refresh_token = token.get("refresh_token")
    if not access_token or not refresh_token:
        return RedirectResponse(f"{frontend}/examinations/report-card?outlook=error")
    graph = requests.get("https://graph.microsoft.com/v1.0/me", headers={"Authorization": f"Bearer {access_token}"}, timeout=15)
    email = graph.json().get("mail") or graph.json().get("userPrincipalName") if graph.ok else None
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    row = db.query(OutlookConnection).filter(OutlookConnection.user_id == user_id, OutlookConnection.school_id == school_id).first()
    values = {"email": email, "access_token": access_token, "refresh_token": refresh_token, "expires_at": now + timedelta(seconds=int(token.get("expires_in", 3600))), "updated_at": now}
    if row:
        for key, value in values.items(): setattr(row, key, value)
    else:
        db.add(OutlookConnection(user_id=user_id, school_id=school_id, created_at=now, **values))
    db.commit()
    return RedirectResponse(f"{frontend}/examinations/report-card?outlook=connected")


@router.post("/send-report-card")
def send_report_card(payload: SendReportCardRequest, principal: Principal = Depends(require_active_access), db: Session = Depends(get_db)):
    row = _token_row(db, principal)
    if not row:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect a Microsoft 365 account before sending report cards.")
    token = _refresh_if_needed(db, row)
    recipient = str(payload.recipient.email)
    safe_school = html.escape(payload.school_name)
    safe_student = html.escape(payload.student_name)
    safe_exam = html.escape(payload.examination)
    rows_html = "".join(
        f"<tr><td>{html.escape(item.subject)}</td><td>{item.max_marks:g}</td><td>{'—' if item.score is None else f'{item.score:g}'}</td><td>{'—' if item.percentage is None else f'{item.percentage:.1f}%'}</td><td>{html.escape(item.grade or '—')}</td><td>{html.escape(item.remark or '—')}</td></tr>"
        for item in payload.rows
    )
    body = f"""<div style='font-family:Arial,sans-serif;color:#14231d;max-width:760px;margin:auto'>
    <div style='border-bottom:4px solid #0f5b58;padding:16px;text-align:center'><div style='font-size:12px;font-weight:700;letter-spacing:2px'>JUNIOR SECONDARY SCHOOL</div><h1 style='margin:6px 0;text-transform:uppercase'>{safe_school}</h1><div style='font-size:18px;font-weight:800'>STUDENT ASSESSMENT REPORT</div><div style='font-size:11px;color:#0f7f76'>CBC · KNEC 8-LEVEL SCALE</div></div>
    <p><strong>Examination:</strong> {safe_exam} &nbsp; <strong>Date:</strong> {html.escape(payload.exam_date or '—')}</p>
    <table style='width:100%;border-collapse:collapse;margin:14px 0'><tr><td style='border:1px solid #9aa9a4;padding:8px'><strong>Learner</strong><br>{safe_student}</td><td style='border:1px solid #9aa9a4;padding:8px'><strong>Admission No.</strong><br>{html.escape(payload.admission_number)}</td></tr></table>
    <table style='width:100%;border-collapse:collapse'><thead><tr style='background:#0f5b58;color:white'><th style='padding:7px'>Learning Area</th><th>Max</th><th>Score</th><th>%</th><th>Outcome</th><th>Remark</th></tr></thead><tbody>{rows_html}</tbody></table>
    <div style='margin-top:14px;padding:12px;background:#eef7f5'><strong>Total:</strong> {payload.total_score:g} / {payload.max_total:g} &nbsp; <strong>Percentage:</strong> {payload.percentage:.1f}% &nbsp; <strong>Average Points:</strong> {payload.average_points:.2f} &nbsp; <strong>Overall:</strong> {html.escape(payload.overall_band)}</div>
    <p style='font-size:12px;color:#49635b'>This report was generated securely by the Phikila School Management System.</p></div>"""
    graph = requests.post(GRAPH_SEND_MAIL, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, json={
        "message": {"subject": f"Report Card - {payload.examination}", "body": {"contentType": "HTML", "content": body}, "toRecipients": [{"emailAddress": {"address": recipient}}]},
        "saveToSentItems": True,
    }, timeout=20)
    if graph.status_code == 401:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Microsoft authorization expired. Reconnect Outlook and try again.")
    if not graph.ok:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Microsoft Graph could not send the report card.")
    return {"sent": True, "recipient": recipient}
