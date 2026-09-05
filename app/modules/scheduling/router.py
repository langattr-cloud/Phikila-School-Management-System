"""Scheduling API.

Every route is scoped to the caller's school. ``school_id`` is resolved
server-side from the verified Supabase token.
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
from . import models as m
from . import schemas as s
from . import services
from . import solver
from . import job_queue

# Keep the rest of the existing router implementation unchanged.
