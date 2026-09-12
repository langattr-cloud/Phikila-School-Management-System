"""Non-mutating timetable feasibility checks used before generation."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from . import models as m
from .schemas import GenerateIn
from .engine import build_input
from .solver import ORTOOLS_AVAILABLE, preflight, solve
from .tenancy import Principal, require_role

router = APIRouter()

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
    problems = preflight(data)
    relaxed: list[str] = []

    if payload.mode == "relax":
        for rule in data.avoid_rules:
            if rule.is_hard:
                relaxed.append(rule.note or f"{rule.scope} {rule.target_id} avoid constraint")
                rule.is_hard = False
        problems = preflight(data)

    checks = [
        {"key": "calendar", "label": "Calendar and teaching periods", "state": "passed" if data.days and data.teaching_periods else "failed"},
        {"key": "requirements", "label": "Lesson requirements", "state": "passed" if data.requirements else "failed"},
        {"key": "availability", "label": "Availability and hard constraints", "state": "passed" if not problems else "failed"},
    ]
    if problems:
        return {"passed": False, "feasible": False, "mode": payload.mode, "checks": checks, "problems": problems, "relaxed_constraints": relaxed}

    result = solve(data)
    feasible = result.solved
    checks.append({"key": "solver_feasibility", "label": "Solver feasibility", "state": "passed" if feasible else "failed"})
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
