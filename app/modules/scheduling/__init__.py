"""Scheduling package bootstrap."""
from __future__ import annotations
import inspect
from . import engine as _engine
from . import solver as _solver


def _load_constraints(db, school_id):
    weights = _solver.Weights(); avoid = []
    rows = db.query(_engine.m.TtConstraint).filter(_engine.m.TtConstraint.school_id == school_id, _engine.m.TtConstraint.enabled.is_(True))
    for row in rows:
        params = row.params if isinstance(row.params, dict) else {}
        if row.kind == "weight":
            key = params.get("key")
            if key and hasattr(weights, key): setattr(weights, key, int(row.weight))
        elif row.kind == "avoid_lessons" and row.target_id:
            slots = _engine._slots_from_json(params.get("slots"))
            if slots:
                scope = row.scope if row.scope in {"class", "teacher", "subject"} else "class"
                avoid.append(_solver.AvoidRule(scope=scope,target_id=row.target_id,slots=slots,is_hard=bool(row.is_hard),weight=int(row.weight or 25),note=row.note or ""))
    return weights, avoid
_engine.load_constraints = _load_constraints

_original_build_input = _engine.build_input

def _scoped_build_input(db, school_id, *, max_seconds=30.0, class_ids=None, teacher_ids=None, period_indexes=None):
    data = _original_build_input(db, school_id, max_seconds=max_seconds)
    selected_classes = set(int(v) for v in class_ids or []) or None
    selected_teachers = set(int(v) for v in teacher_ids or []) or None
    selected_periods = set(int(v) for v in period_indexes or []) or None
    if selected_classes is not None:
        data.classes = {ident: row for ident, row in data.classes.items() if ident in selected_classes}
        data.requirements = [r for r in data.requirements if r.class_id in selected_classes]
    if selected_teachers is not None:
        data.teachers = {ident: row for ident, row in data.teachers.items() if ident in selected_teachers}
        data.requirements = [r for r in data.requirements if r.teacher_id in selected_teachers]
    if selected_periods is not None:
        data.periods = [p for p in data.periods if p in selected_periods]
        data.teaching_periods = [p for p in data.teaching_periods if p in selected_periods]
        data.morning_periods = [p for p in data.morning_periods if p in selected_periods]
    data.avoid_rules = [r for r in data.avoid_rules if (r.scope == 'class' and r.target_id in data.classes) or (r.scope == 'teacher' and r.target_id in data.teachers) or (r.scope == 'subject' and r.target_id in data.subjects)]
    return data

_engine.build_input = _scoped_build_input


def _replace_function_source(function, replacements):
    source = inspect.getsource(function)
    for old, new in replacements:
        if old not in source:
            raise RuntimeError(f"Scheduling compatibility patch could not find expected source in {function.__name__}.")
        source = source.replace(old, new, 1)
    namespace = _solver.__dict__
    exec(compile(source, inspect.getsourcefile(function) or "<scheduling>", "exec"), namespace, namespace)
    return namespace[function.__name__]


_solver.preflight = _replace_function_source(
    _solver.preflight,
    [
        (
            '    hc={};ht={}\n',
            '    hc={};ht={};hs={}\n',
        ),
        (
            '    for rule in data.avoid_rules:\n        if rule.is_hard:(hc if rule.scope=="class" else ht).setdefault(rule.target_id,set()).update(rule.slots)\n',
            '    for rule in data.avoid_rules:\n'
            '        if not rule.is_hard:continue\n'
            '        if rule.scope=="class":hc.setdefault(rule.target_id,set()).update(rule.slots)\n'
            '        elif rule.scope=="teacher":ht.setdefault(rule.target_id,set()).update(rule.slots)\n'
            '        elif rule.scope=="subject":hs.setdefault(rule.target_id,set()).update(rule.slots)\n',
        ),
        (
            '    pt={}\n',
            '    for sid,blocked in hs.items():\n'
            '        available=capacity-len(blocked)\n'
            '        for r in data.requirements:\n'
            '            if r.subject_id==sid and r.periods_per_week>available:\n'
            '                subject=data.subjects.get(sid);name=subject.name if subject else f"Subject {sid}"\n'
            '                problems.append(f"{name} needs {r.periods_per_week} lessons a week but only has {available} available slots after subject time-off is applied.")\n'
            '    pt={}\n',
        ),
    ],
)

_solver.solve = _replace_function_source(
    _solver.solve,
    [
        (
            '        for rule in data.avoid_rules:\n            if rule.is_hard and ((rule.scope=="class" and rule.target_id==r.class_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id)) and (d,p) in rule.slots:return False\n',
            '        for rule in data.avoid_rules:\n'
            '            if not rule.is_hard or (d,p) not in rule.slots:continue\n'
            '            if (rule.scope=="class" and rule.target_id==r.class_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id) or (rule.scope=="subject" and rule.target_id==r.subject_id):return False\n',
        ),
        (
            '                match=(rule.scope=="class" and r.class_id==rule.target_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id)\n',
            '                match=(rule.scope=="class" and r.class_id==rule.target_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id) or (rule.scope=="subject" and r.subject_id==rule.target_id)\n',
        ),
    ],
)
