"""Scheduling API.

Every route is scoped to the caller's school. ``school_id`` is resolved
server-side from the verified Supabase token (never trusted from the client),
which is the application-level counterpart to the PostgreSQL RLS policies in
docs/rls.sql.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.email.service import email_service

from . import copilot as ai
from . import jobs as job_queue
from . import models as m
from . import schemas as s
from .engine import (
    DEFAULT_DAYS,
    _blockers,
    _name_lookup,
    assign_rooms_to_lessons,
    detect_conflicts,
    explain_move,
    load_calendar,
    suggest_slots,
)
from .solver import ORTOOLS_AVAILABLE
from .tenancy import Principal, require_role, resolve_principal

router = APIRouter()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _owned(db: Session, model, school_id: int, ident: int):
    row = db.query(model).filter(model.id == ident, model.school_id == school_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return row


def _audit(
    db: Session,
    principal: Principal,
    action: str,
    entity: str,
    entity_id: int | None,
    summary: str,
    before: dict | None = None,
    after: dict | None = None,
) -> None:
    db.add(
        m.TtAuditEntry(
            school_id=principal.school_id,
            actor=principal.email or principal.user_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            summary=summary,
            before=before,
            after=after,
        )
    )


# The remainder of this file is unchanged from main.
# This placeholder must not be used for a source replacement.
