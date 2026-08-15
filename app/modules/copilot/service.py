"""Real, school-scoped Copilot insights using the configured LLM provider."""
from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy.orm import Session

from app.modules.llm.credentials import ProviderCredentialService
from app.modules.llm.models import TtLlmModel, TtLlmSetting
from app.modules.llm.providers import ProviderError, get_provider
from app.modules.scheduling import models as m

_BUCKETS: dict[tuple[int, str], tuple[float, int]] = {}

class CopilotRateLimitError(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__("Copilot rate limit reached.")

def settings_row(db: Session) -> TtLlmSetting:
    row = db.query(TtLlmSetting).first()
    if row is None:
        row = TtLlmSetting(copilot_rate_limit=20, copilot_rate_window_seconds=3600)
        db.add(row); db.commit(); db.refresh(row)
    return row

def consume_rate_limit(db: Session, school_id: int, user_id: str) -> int:
    row = settings_row(db)
    limit = max(1, min(10000, int(row.copilot_rate_limit or 20)))
    window = max(10, min(86400, int(row.copilot_rate_window_seconds or 3600)))
    now = time.monotonic(); key = (school_id, user_id); bucket = _BUCKETS.get(key)
    if bucket is None or now - bucket[0] >= window:
        _BUCKETS[key] = (now, 1); return limit - 1
    if bucket[1] >= limit:
        raise CopilotRateLimitError(max(1, int(window - (now - bucket[0]))))
    _BUCKETS[key] = (bucket[0], bucket[1] + 1)
    return limit - bucket[1] - 1

def build_school_context(db: Session, school_id: int) -> dict[str, Any]:
    teachers = db.query(m.TtTeacher).filter(m.TtTeacher.school_id == school_id, m.TtTeacher.is_active.is_(True)).all()
    classes = db.query(m.TtClass).filter(m.TtClass.school_id == school_id).all()
    subjects = db.query(m.TtSubject).filter(m.TtSubject.school_id == school_id).all()
    requirements = db.query(m.TtLessonRequirement).filter(m.TtLessonRequirement.school_id == school_id).all()
    versions = db.query(m.TtVersion).filter(m.TtVersion.school_id == school_id).order_by(m.TtVersion.number.desc()).limit(3).all()
    return {
        "teachers": len(teachers), "classes": len(classes), "subjects": len(subjects),
        "lesson_requirements": len(requirements),
        "timetable_versions": [{"number": v.number, "status": v.status} for v in versions],
        "teacher_capacity": [{"name": t.name, "max_per_day": t.max_lessons_per_day, "max_consecutive": t.max_consecutive} for t in teachers[:50]],
    }

def fallback(context: dict[str, Any]) -> dict[str, Any]:
    actions = []
    if context["lesson_requirements"] == 0: actions.append("Add lesson requirements before generating a timetable.")
    if context["classes"] == 0: actions.append("Configure classes before scheduling lessons.")
    if not context["timetable_versions"]: actions.append("Generate the first timetable draft when setup is complete.")
    if not actions: actions.append("Review the latest timetable and scheduling constraints.")
    return {"headline": "School workspace needs review", "summary": "No configured language model was available, so this guidance was generated locally.", "actions": actions[:3], "source": "rules"}

def configured_model(db: Session) -> tuple[str, str] | None:
    row = settings_row(db)
    if not row.default_provider or not row.default_model_id: return None
    model = db.query(TtLlmModel).filter(TtLlmModel.provider == row.default_provider, TtLlmModel.model_id == row.default_model_id, TtLlmModel.enabled.is_(True)).first()
    return (row.default_provider, row.default_model_id) if model else None

def generate_insight(db: Session, school_id: int) -> dict[str, Any]:
    context = build_school_context(db, school_id)
    selected = configured_model(db)
    if not selected: return fallback(context)
    provider_slug, model_id = selected
    api_key = ProviderCredentialService(db).get_credential(provider_slug)
    if not api_key: return fallback(context)
    prompt = (
        "You are Phikila Copilot, a school operations assistant. Analyze ONLY the supplied "
        "school context. Never invent facts. Return JSON with headline, summary, actions "
        "(maximum 3 strings). Keep it concise and actionable.\n\n" +
        json.dumps(context, separators=(",", ":"))
    )
    adapter = get_provider(provider_slug)
    try:
        data = adapter._request(
            f"{adapter.base_url}/chat/completions", api_key,
            {"model": model_id, "messages": [{"role": "system", "content": "Return valid JSON only."}, {"role": "user", "content": prompt}], "temperature": 0, "max_tokens": 280},
            method="POST",
        )
        content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content", "")
        parsed = json.loads(content)
        actions = [str(x)[:180] for x in (parsed.get("actions") or [])][:3]
        summary = str(parsed.get("summary", ""))[:500]
        if not summary or not actions: raise ValueError("incomplete response")
        return {"headline": str(parsed.get("headline", "Copilot insight"))[:140], "summary": summary, "actions": actions, "source": provider_slug, "model": model_id}
    except (ProviderError, ValueError, TypeError, json.JSONDecodeError, KeyError, IndexError):
        return fallback(context)
