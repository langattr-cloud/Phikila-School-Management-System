"""Runtime Copilot service: real school insights through the configured LLM."""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.modules.llm.credentials import ProviderCredentialService
from app.modules.llm.models import TtLlmModel, TtLlmSetting
from app.modules.llm.providers import ProviderError, get_provider

from app.modules.scheduling import models as m


class CopilotRateLimitError(Exception):
    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__("Copilot rate limit reached.")


def _setting(db: Session) -> TtLlmSetting | None:
    return db.query(TtLlmSetting).first()


def configured_model(db: Session) -> tuple[str, str] | None:
    row = _setting(db)
    if not row or not row.default_provider or not row.default_model_id:
        return None
    model = (
        db.query(TtLlmModel)
        .filter(
            TtLlmModel.provider == row.default_provider,
            TtLlmModel.model_id == row.default_model_id,
            TtLlmModel.enabled.is_(True),
        )
        .first()
    )
    return (row.default_provider, row.default_model_id) if model else None


def consume_rate_limit(db: Session, school_id: int, user_id: str) -> int:
    """Atomic-ish short-window limiter without adding a new infrastructure dependency.

    The existing audit table is deliberately not used as a counter. A small
    in-process bucket is sufficient for the default deployment; production
    multi-instance deployments can move this function to Redis without changing
    the Copilot API.
    """
    now = time.monotonic()
    key = (school_id, user_id)
    bucket = _BUCKETS.get(key)
    limit, window = current_rate_limit(db)
    if bucket is None or now - bucket[0] >= window:
        _BUCKETS[key] = (now, 1)
        return limit - 1
    count = bucket[1]
    if count >= limit:
        retry = max(1, int(window - (now - bucket[0])))
        raise CopilotRateLimitError(retry)
    _BUCKETS[key] = (bucket[0], count + 1)
    return limit - count - 1


_BUCKETS: dict[tuple[int, str], tuple[float, int]] = {}


def current_rate_limit(db: Session) -> tuple[int, int]:
    row = _setting(db)
    requests = getattr(row, "copilot_rate_limit", None) if row else None
    window = getattr(row, "copilot_rate_window_seconds", None) if row else None
    return max(1, int(requests or 20)), max(10, int(window or 3600))


def build_school_context(db: Session, school_id: int) -> dict[str, Any]:
    teachers = db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id, m.TtTeacher.is_active.is_(True)).all()
    classes = db.query(m.TtClass).filter(m.TtClass.school_id == school_id).all()
    subjects = db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id).all()
    requirements = db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id == school_id).all()
    versions = db.query(m.TtVersion).filter(m.TtVersion.school_id == school_id).order_by(m.TtVersion.number.desc()).limit(3).all()
    jobs = db.query(m.TtSolverJob).filter(m.TtSolverJob.school_id == school_id).order_by(m.TtSolverJob.id.desc()).limit(5).all()

    return {
        "teachers": len(teachers),
        "classes": len(classes),
        "subjects": len(subjects),
        "lesson_requirements": len(requirements),
        "timetable_versions": [
            {"number": v.number, "status": v.status} for v in versions
        ],
        "recent_solver_jobs": [
            {"status": j.status, "progress": j.progress} for j in jobs
        ],
        "teacher_capacity": [
            {"name": t.name, "max_per_day": t.max_lessons_per_day, "max_consecutive": t.max_consecutive}
            for t in teachers[:50]
        ],
    }


def _fallback_insight(context: dict[str, Any]) -> dict[str, Any]:
    actions: list[str] = []
    if context["lesson_requirements"] == 0:
        actions.append("Add lesson requirements before generating a timetable.")
    if context["classes"] == 0:
        actions.append("Configure classes before scheduling lessons.")
    if not context["timetable_versions"]:
        actions.append("Generate the first timetable draft when setup is complete.")
    if not actions:
        actions.append("Review the latest timetable and scheduling constraints.")
    return {
        "headline": "Your school workspace is ready for review",
        "summary": "No language-model insight was available, so this operational guidance was generated locally.",
        "actions": actions[:3],
        "source": "rules",
    }


def generate_insight(db: Session, school_id: int, user_id: str) -> dict[str, Any]:
    context = build_school_context(db, school_id)
    selected = configured_model(db)
    if not selected:
        return _fallback_insight(context)

    provider_slug, model_id = selected
    credentials = ProviderCredentialService(db)
    api_key = credentials.get_credential(provider_slug)
    if not api_key:
        return _fallback_insight(context)

    prompt = (
        "You are Phikila Copilot, a school operations assistant. Analyze only the supplied "
        "school context. Do not invent attendance, student, teacher or timetable facts. "
        "Return JSON with headline, summary, actions (maximum 3 strings). Keep it concise "
        "and actionable for a school administrator.\n\n"
        + json.dumps(context, separators=(",", ":"))
    )
    adapter = get_provider(provider_slug)
    try:
        result = adapter.generate_text(
            api_key,
            model_id,
            prompt,
            max_tokens=280,
        )
        data = json.loads(result)
        if not isinstance(data, dict):
            raise ValueError("invalid response")
        headline = str(data.get("headline", "Copilot insight"))[:140]
        summary = str(data.get("summary", ""))[:500]
        actions = [str(x)[:180] for x in (data.get("actions") or [])][:3]
        if not summary or not actions:
            raise ValueError("incomplete response")
        return {"headline": headline, "summary": summary, "actions": actions, "source": provider_slug, "model": model_id}
    except (ProviderError, ValueError, TypeError, json.JSONDecodeError):
        return _fallback_insight(context)
