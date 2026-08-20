"""Scheduling package bootstrap patches for subject-scoped time-off.

Subject time-off is persisted as an ``avoid_lessons`` constraint.  The
scheduler historically only understood teacher/class scopes, so this module
keeps the compatibility fix close to the scheduling package without replacing
large solver modules solely to add the missing scope.
"""

from __future__ import annotations

import inspect

from . import engine as _engine
from . import solver as _solver


def _replace_function_source(function, replacements: list[tuple[str, str]]):
    """Recompile one existing scheduling function with narrowly-scoped fixes."""
    source = inspect.getsource(function)
    for old, new in replacements:
        if old not in source:
            raise RuntimeError(
                f"Scheduling compatibility patch could not find expected source in {function.__name__}."
            )
        source = source.replace(old, new, 1)
    namespace = _solver.__dict__
    exec(compile(source, inspect.getsourcefile(function) or "<scheduling>", "exec"), namespace, namespace)
    return namespace[function.__name__]


# Preserve subject scope when translating database constraints.  The previous
# translator treated every non-teacher scope as a class rule, which made a
# subject time-off selection accidentally block the whole class.
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
                avoid.append(
                    _solver.AvoidRule(
                        scope=scope,
                        target_id=row.target_id,
                        slots=slots,
                        is_hard=bool(row.is_hard),
                        weight=int(row.weight or 25),
                        note=row.note or "",
                    )
                )
    return weights, avoid


_engine.load_constraints = _load_constraints


# Add subject scope to preflight capacity reasoning.
_solver.preflight = _replace_function_source(
    _solver.preflight,
    [
        (
            '    hard_blocked_teacher: dict[int, set[tuple[int, int]]] = {}\n',
            '    hard_blocked_teacher: dict[int, set[tuple[int, int]]] = {}\n'
            '    hard_blocked_subject: dict[int, set[tuple[int, int]]] = {}\n',
        ),
        (
            '        bucket = hard_blocked_class if rule.scope == "class" else hard_blocked_teacher\n'
            '        bucket.setdefault(rule.target_id, set()).update(rule.slots)\n',
            '        if rule.scope == "class":\n'
            '            bucket = hard_blocked_class\n'
            '        elif rule.scope == "teacher":\n'
            '            bucket = hard_blocked_teacher\n'
            '        elif rule.scope == "subject":\n'
            '            bucket = hard_blocked_subject\n'
            '        else:\n'
            '            continue\n'
            '        bucket.setdefault(rule.target_id, set()).update(rule.slots)\n',
        ),
        (
            '    # A required room type must exist.\n',
            '    # A subject-level hard block must still leave enough slots for each\n'
            '    # individual requirement using that subject.\n'
            '    for req in data.requirements:\n'
            '        blocked = hard_blocked_subject.get(req.subject_id, set())\n'
            '        if blocked:\n'
            '            available = sum(\n'
            '                1 for day in data.days for period in data.teaching_periods\n'
            '                if (day, period) not in blocked\n'
            '            )\n'
            '            if req.periods_per_week > available:\n'
            '                subject = data.subjects.get(req.subject_id)\n'
            '                name = subject.name if subject else f"Subject {req.subject_id}"\n'
            '                problems.append(\n'
            '                    f"{name} needs {req.periods_per_week} lessons but only "\n'
            '                    f"{available} slots remain after subject time-off is applied."\n'
            '                )\n'
            '\n'
            '    # A required room type must exist.\n',
        ),
    ],
)


# Add subject scope to the solver's hard availability filter and soft scoring.
_solver.solve = _replace_function_source(
    _solver.solve,
    [
        (
            '            if rule.scope == "teacher" and req.teacher_id == rule.target_id and (day, period) in rule.slots:\n'
            '                return False\n',
            '            if rule.scope == "teacher" and req.teacher_id == rule.target_id and (day, period) in rule.slots:\n'
            '                return False\n'
            '            if rule.scope == "subject" and req.subject_id == rule.target_id and (day, period) in rule.slots:\n'
            '                return False\n',
        ),
        (
            '                    rule.scope == "teacher" and req.teacher_id == rule.target_id\n'
            '                )\n',
            '                    rule.scope == "teacher" and req.teacher_id == rule.target_id\n'
            '                ) or (\n'
            '                    rule.scope == "subject" and req.subject_id == rule.target_id\n'
            '                )\n',
        ),
    ],
)
