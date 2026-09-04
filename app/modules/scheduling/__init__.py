"""Scheduling package bootstrap."""
from __future__ import annotations
import inspect
from . import engine as _engine
from . import solver as _solver
from . import jobs as _jobs


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
        if old not in source: raise RuntimeError(f"Scheduling compatibility patch could not find expected source in {function.__name__}.")
        source = source.replace(old, new, 1)
    namespace = _solver.__dict__
    exec(compile(source, inspect.getsourcefile(function) or "<scheduling>", "exec"), namespace, namespace)
    return namespace[function.__name__]

_solver.preflight = _replace_function_source(_solver.preflight, [('    hc={};ht={}\n','    hc={};ht={};hs={}\n'),('    for rule in data.avoid_rules:\n        if rule.is_hard:(hc if rule.scope=="class" else ht).setdefault(rule.target_id,set()).update(rule.slots)\n','    for rule in data.avoid_rules:\n        if not rule.is_hard:continue\n        if rule.scope=="class":hc.setdefault(rule.target_id,set()).update(rule.slots)\n        elif rule.scope=="teacher":ht.setdefault(rule.target_id,set()).update(rule.slots)\n        elif rule.scope=="subject":hs.setdefault(rule.target_id,set()).update(rule.slots)\n'),('    pt={}\n','    for sid,blocked in hs.items():\n        available=capacity-len(blocked)\n        for r in data.requirements:\n            if r.subject_id==sid and r.periods_per_week>available:\n                subject=data.subjects.get(sid);name=subject.name if subject else f"Subject {sid}"\n                problems.append(f"{name} needs {r.periods_per_week} lessons a week but only has {available} available slots after subject time-off is applied.")\n    pt={}\n')])
_solver.solve = _replace_function_source(_solver.solve, [('        for rule in data.avoid_rules:\n            if rule.is_hard and ((rule.scope=="class" and rule.target_id==r.class_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id)) and (d,p) in rule.slots:return False\n','        for rule in data.avoid_rules:\n            if not rule.is_hard or (d,p) not in rule.slots:continue\n            if (rule.scope=="class" and rule.target_id==r.class_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id) or (rule.scope=="subject" and rule.target_id==r.subject_id):return False\n'),('                match=(rule.scope=="class" and r.class_id==rule.target_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id)\n','                match=(rule.scope=="class" and r.class_id==rule.target_id) or (rule.scope=="teacher" and r.teacher_id==rule.target_id) or (rule.scope=="subject" and r.subject_id==rule.target_id)\n')])

# Project-aware persistence: generated versions belong to one project and never
# delete or overwrite versions belonging to another project. Teachers, learners,
# classes, subjects and rooms remain school-scoped shared master data.
def _persist_project(db, school_id, result, actor, config):
    project_id = config.get("project_id")
    if not project_id:
        return _jobs._persist_legacy(db, school_id, result, actor, config)
    project = db.query(_engine.m.TtProject).filter(_engine.m.TtProject.id == int(project_id), _engine.m.TtProject.school_id == school_id).first()
    if project is None: raise RuntimeError("Timetable project not found.")
    indexes=list(config.get('day_indexes') or []); names=config.get('day_names') or {}; display_mode=config.get('display_mode') or 'day'
    fallback={d.index:d.name for d in db.query(_engine.m.TtDay).filter(_engine.m.TtDay.school_id==school_id).all()}
    previous=db.query(_engine.m.TtVersion).filter(_engine.m.TtVersion.project_id==project.id, _engine.m.TtVersion.school_id==school_id).order_by(_engine.m.TtVersion.number.desc()).first()
    number=(previous.number+1) if previous else 1
    version=_engine.m.TtVersion(school_id=school_id,project_id=project.id,number=number,name=config.get('label') or project.name,label=config.get('label') or project.name,status='draft',timetable_type_id=config.get('timetable_type_id'),created_by=actor,day_indexes=indexes,day_names=[str(names.get(i,fallback.get(i,str(i)))) for i in indexes],display_mode=display_mode,quality=result.quality,stats=result.stats)
    db.add(version); db.flush()
    for p in result.placements:
        db.add(_engine.m.TtLesson(school_id=school_id,version_id=version.id,requirement_id=p.requirement_id,class_id=p.class_id,subject_id=p.subject_id,teacher_id=p.teacher_id,room_id=p.room_id,day_index=p.day,period_index=p.period,duration=p.duration))
    project.current_version_id=version.id
    db.commit(); _engine.assign_rooms_to_lessons(db,school_id,version.id); db.refresh(version); return version

# Preserve the previous implementation under a private name, then route jobs to
# the project-aware implementation above.
if not hasattr(_jobs, "_persist_legacy"):
    _jobs._persist_legacy = _jobs._persist
_jobs._persist = _persist_project
