"""Non-mutating timetable feasibility checks used before generation."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from .schemas import GenerateIn
from .engine import build_input
from .solver import ORTOOLS_AVAILABLE, preflight, solve
from .generation_rules import relax_next_rule
from .tenancy import Principal, require_role

router = APIRouter()


def _diagnostic_checks(data, problems: list[str], feasible: bool | None = None):
    text = " ".join(problems).lower()
    return [
        {"key": "calendar", "label": "Calendar and teaching periods", "state": "passed" if data.days and data.teaching_periods else "failed", "group": "hard"},
        {"key": "requirements", "label": "Lesson requirements", "state": "passed" if data.requirements else "failed", "group": "hard"},
        {"key": "class_capacity", "label": "Class weekly capacity", "state": "failed" if "available slots" in text and "needs" in text else "passed", "group": "hard"},
        {"key": "teacher_capacity", "label": "Teacher availability and daily limits", "state": "failed" if "can only teach" in text else "passed", "group": "hard"},
        {"key": "double_lessons", "label": "Double-lesson requirements", "state": "failed" if "double lesson" in text else "passed", "group": "hard"},
        {"key": "solver_feasibility", "label": "Solver feasibility", "state": "pending" if feasible is None else ("passed" if feasible else "failed"), "group": "hard"},
    ]


@router.post("/solver/test")
def test_generation(
    payload: GenerateIn,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_role("admin", "scheduler")),
):
    if not ORTOOLS_AVAILABLE:
        raise HTTPException(503, "The scheduling engine is not available on this server.")

    data = build_input(
        db,
        principal.school_id,
        max_seconds=min(10.0, payload.max_seconds),
        class_ids=payload.class_ids,
        teacher_ids=payload.teacher_ids,
        period_indexes=payload.period_indexes,
    )
    relaxed: list[str] = []

    if payload.mode == "draft":
        relaxed = [rule.note or f"{rule.scope} {rule.target_id} constraint" for rule in data.avoid_rules]
        data.avoid_rules = []
    elif payload.mode == "relax":
        while True:
            problems = preflight(data)
            if not problems:
                break
            rule = relax_next_rule(data.avoid_rules)
            if rule is None:
                checks = _diagnostic_checks(data, problems, False)
                return {"passed": False, "feasible": False, "mode": payload.mode, "checks": checks, "problems": problems, "relaxed_constraints": relaxed}
            relaxed.append(rule.note or f"{rule.scope} {rule.target_id} avoid constraint")
    problems = preflight(data)
    checks = _diagnostic_checks(data, problems)
    if problems:
        return {"passed": False, "feasible": False, "mode": payload.mode, "checks": checks, "problems": problems, "relaxed_constraints": relaxed}

    result = solve(data)
    feasible = result.solved
    checks = _diagnostic_checks(data, result.messages if not feasible else [], feasible)
    return {
        "passed": feasible,
        "feasible": feasible,
        "mode": payload.mode,
        "checks": checks,
        "problems": result.messages if not feasible else [],
        "relaxed_constraints": relaxed,
        "quality": result.quality,
        "stats": result.stats,
    }
