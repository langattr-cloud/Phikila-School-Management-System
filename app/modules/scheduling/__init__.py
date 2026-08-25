"""Scheduling package bootstrap.

Constraint translation is kept here so the solver module remains importable on
its own.  Time preferences are intentionally not part of the scheduler.
"""

from __future__ import annotations

from . import engine as _engine
from . import solver as _solver


def _load_constraints(db, school_id):
    weights = _solver.Weights()
    avoid = []
    rows = db.query(_engine.m.TtConstraint).filter(
        _engine.m.TtConstraint.school_id == school_id,
        _engine.m.TtConstraint.enabled.is_(True),
    )
    for row in rows:
        params = row.params if isinstance(row.params, dict) else {}
        if row.kind == "weight":
            key = params.get("key")
            if key and hasattr(weights, key):
                setattr(weights, key, int(row.weight))
        elif row.kind == "avoid_lessons" and row.target_id:
            slots = _engine._slots_from_json(params.get("slots"))
            if slots:
                scope = row.scope if row.scope in {"class", "teacher", "subject"} else "class"
                avoid.append(_solver.AvoidRule(
                    scope=scope,
                    target_id=row.target_id,
                    slots=slots,
                    is_hard=bool(row.is_hard),
                    weight=int(row.weight or 25),
                    note=row.note or "",
                ))
    return weights, avoid


_engine.load_constraints = _load_constraints

# Subject-scoped availability is handled directly by the solver.  No runtime
# source rewriting/monkey-patching is required; keeping package import side
# effects to a minimum also allows Alembic migrations to start reliably.
