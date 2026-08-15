"""Timetable optimisation with Google OR-Tools CP-SAT.

The model is deterministic and explainable: hard constraints are expressed as
CP-SAT constraints (so a returned solution is always feasible), while soft
constraints become weighted penalty terms in a single objective. Nothing here
touches the database — callers hand in a plain :class:`SolverInput` and get a
:class:`SolverOutput` back, which keeps the engine unit-testable and lets it be
lifted into a standalone worker process unchanged.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Iterable, Sequence

try:  # pragma: no cover - exercised implicitly by the API
    from ortools.sat.python import cp_model

    ORTOOLS_AVAILABLE = True
except ImportError:  # pragma: no cover
    cp_model = None  # type: ignore[assignment]
    ORTOOLS_AVAILABLE = False


# --------------------------------------------------------------------------
# Inputs
# --------------------------------------------------------------------------
@dataclass(frozen=True)
class Slot:
    day: int
    period: int


@dataclass
class TeacherSpec:
    id: int
    name: str
    max_per_day: int = 7
    max_consecutive: int = 4
    unavailable: set[tuple[int, int]] = field(default_factory=set)


@dataclass
class RoomSpec:
    id: int
    name: str
    capacity: int = 40
    room_type: str = "classroom"
    unavailable: set[tuple[int, int]] = field(default_factory=set)


@dataclass
class ClassSpec:
    id: int
    name: str
    student_count: int = 40
    unavailable: set[tuple[int, int]] = field(default_factory=set)


@dataclass
class SubjectSpec:
    id: int
    name: str
    prefers_morning: bool = False
    spread_across_week: bool = True
    required_room_type: str | None = None


@dataclass
class RequirementSpec:
    """One class/subject/teacher pairing needing N periods a week."""

    id: int
    class_id: int
    subject_id: int
    teacher_id: int | None
    room_id: int | None
    periods_per_week: int
    double_periods: int = 0


@dataclass
class Weights:
    teacher_gaps: int = 20
    subject_distribution: int = 15
    morning_preference: int = 10
    consecutive_lessons: int = 30
    workload_balance: int = 15
    room_utilisation: int = 5
    avoid_slots: int = 25

    @classmethod
    def from_mapping(cls, data: dict | None) -> "Weights":
        base = cls()
        if not data:
            return base
        for key, value in data.items():
            if hasattr(base, key) and isinstance(value, (int, float)):
                setattr(base, key, int(value))
        return base


@dataclass
class AvoidRule:
    """A soft/hard request to keep slots free for a class or teacher."""

    scope: str  # "class" | "teacher"
    target_id: int
    slots: set[tuple[int, int]]
    is_hard: bool = False
    weight: int = 25
    note: str = ""


@dataclass
class SolverInput:
    days: list[int]
    periods: list[int]
    teaching_periods: list[int]
    morning_periods: list[int]
    teachers: dict[int, TeacherSpec]
    rooms: dict[int, RoomSpec]
    classes: dict[int, ClassSpec]
    subjects: dict[int, SubjectSpec]
    requirements: list[RequirementSpec]
    weights: Weights = field(default_factory=Weights)
    avoid_rules: list[AvoidRule] = field(default_factory=list)
    # Lessons the user pinned: requirement_id -> [(day, period), ...]
    locked: dict[int, list[tuple[int, int]]] = field(default_factory=dict)
    max_seconds: float = 30.0
    workers: int = 8


# --------------------------------------------------------------------------
# Outputs
# --------------------------------------------------------------------------
@dataclass
class Placement:
    requirement_id: int
    class_id: int
    subject_id: int
    teacher_id: int | None
    room_id: int | None
    day: int
    period: int
    duration: int = 1


@dataclass
class SolverOutput:
    status: str  # optimal | feasible | infeasible | error
    placements: list[Placement]
    quality: dict
    stats: dict
    messages: list[str]

    @property
    def solved(self) -> bool:
        return self.status in {"optimal", "feasible"}


class InfeasibleError(RuntimeError):
    """Raised with a human-readable reason when no timetable can exist."""


# --------------------------------------------------------------------------
# Pre-flight checks — catch impossible inputs before the solver runs
# --------------------------------------------------------------------------
def preflight(data: SolverInput) -> list[str]:
    """Return human-readable reasons the input cannot possibly be scheduled."""
    problems: list[str] = []
    capacity = len(data.days) * len(data.teaching_periods)

    if not data.requirements:
        problems.append("No lesson requirements have been defined yet.")
    if capacity == 0:
        problems.append("The timetable has no teaching periods. Add periods first.")
        return problems

    # Hard "keep free" rules reduce availability just like unavailability does,
    # so fold them in before checking demand — otherwise the solver would come
    # back with a generic "infeasible" and no explanation.
    hard_blocked_class: dict[int, set[tuple[int, int]]] = {}
    hard_blocked_teacher: dict[int, set[tuple[int, int]]] = {}
    for rule in data.avoid_rules:
        if not rule.is_hard:
            continue
        bucket = hard_blocked_class if rule.scope == "class" else hard_blocked_teacher
        bucket.setdefault(rule.target_id, set()).update(rule.slots)

    # Per-class demand must fit the week.
    per_class: dict[int, int] = {}
    for req in data.requirements:
        per_class[req.class_id] = per_class.get(req.class_id, 0) + req.periods_per_week
    for class_id, total in per_class.items():
        spec = data.classes.get(class_id)
        name = spec.name if spec else f"Class {class_id}"
        blocked = set(spec.unavailable) if spec else set()
        blocked |= hard_blocked_class.get(class_id, set())
        free = capacity - len(blocked)
        if total > free:
            detail = (
                f"{name} needs {total} lessons a week but only has {free} available "
                f"slots"
            )
            if hard_blocked_class.get(class_id):
                detail += (
                    f" ({len(hard_blocked_class[class_id])} blocked by a required "
                    f"keep-free rule)"
                )
            problems.append(
                detail + ". Reduce its lessons, add periods, or make that rule a preference."
            )

    # Per-teacher demand must fit the week and their daily cap.
    per_teacher: dict[int, int] = {}
    for req in data.requirements:
        if req.teacher_id:
            per_teacher[req.teacher_id] = per_teacher.get(req.teacher_id, 0) + req.periods_per_week
    for teacher_id, total in per_teacher.items():
        spec = data.teachers.get(teacher_id)
        if not spec:
            continue
        blocked = set(spec.unavailable) | hard_blocked_teacher.get(teacher_id, set())
        available = capacity - len(blocked)
        cap = spec.max_per_day * len(data.days)
        limit = min(available, cap)
        if total > limit:
            problems.append(
                f"{spec.name} is assigned {total} lessons a week but can only teach "
                f"{limit} (availability and daily limit). Reassign some lessons."
            )

    # A required room type must exist.
    for req in data.requirements:
        subject = data.subjects.get(req.subject_id)
        if subject and subject.required_room_type and not req.room_id:
            matches = [r for r in data.rooms.values() if r.room_type == subject.required_room_type]
            if not matches:
                problems.append(
                    f"{subject.name} requires a '{subject.required_room_type}' room "
                    f"but no such room exists."
                )
    return problems


# --------------------------------------------------------------------------
# The model
# --------------------------------------------------------------------------
def solve(
    data: SolverInput,
    on_progress: Callable[[int, str], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> SolverOutput:
    """Build and solve the timetable model."""
    if not ORTOOLS_AVAILABLE:  # pragma: no cover
        return SolverOutput("error", [], {}, {}, ["OR-Tools is not installed on the server."])

    report = on_progress or (lambda pct, stage: None)

    problems = preflight(data)
    if problems:
        return SolverOutput("infeasible", [], {}, {}, problems)

    report(8, "Building model")
    model = cp_model.CpModel()

    slots = [(d, p) for d in data.days for p in data.teaching_periods]
    # x[(req_id, day, period)] == 1 when that requirement occupies that slot.
    x: dict[tuple[int, int, int], "cp_model.IntVar"] = {}

    def allowed(req: RequirementSpec, day: int, period: int) -> bool:
        """Hard availability filter, applied by simply not creating the var."""
        klass = data.classes.get(req.class_id)
        if klass and (day, period) in klass.unavailable:
            return False
        if req.teacher_id:
            teacher = data.teachers.get(req.teacher_id)
            if teacher and (day, period) in teacher.unavailable:
                return False
        if req.room_id:
            room = data.rooms.get(req.room_id)
            if room and (day, period) in room.unavailable:
                return False
        for rule in data.avoid_rules:
            if not rule.is_hard:
                continue
            if rule.scope == "class" and rule.target_id == req.class_id and (day, period) in rule.slots:
                return False
            if rule.scope == "teacher" and req.teacher_id == rule.target_id and (day, period) in rule.slots:
                return False
        return True

    for req in data.requirements:
        for day, period in slots:
            if allowed(req, day, period):
                x[(req.id, day, period)] = model.NewBoolVar(f"x_{req.id}_{day}_{period}")

    # --- HARD: each requirement gets exactly its weekly quota ---------------
    for req in data.requirements:
        vars_for_req = [x[(req.id, d, p)] for d, p in slots if (req.id, d, p) in x]
        if len(vars_for_req) < req.periods_per_week:
            klass = data.classes.get(req.class_id)
            subject = data.subjects.get(req.subject_id)
            return SolverOutput(
                "infeasible",
                [],
                {},
                {},
                [
                    f"{subject.name if subject else 'A subject'} for "
                    f"{klass.name if klass else 'a class'} needs {req.periods_per_week} "
                    f"periods but only {len(vars_for_req)} slots are available after "
                    f"applying availability rules."
                ],
            )
        model.Add(sum(vars_for_req) == req.periods_per_week)

    # --- HARD: a class is in at most one lesson per slot --------------------
    for class_id in data.classes:
        reqs = [r for r in data.requirements if r.class_id == class_id]
        for day, period in slots:
            overlapping = [x[(r.id, day, period)] for r in reqs if (r.id, day, period) in x]
            if len(overlapping) > 1:
                model.AddAtMostOne(overlapping)

    # --- HARD: a teacher teaches at most one class per slot -----------------
    for teacher_id in data.teachers:
        reqs = [r for r in data.requirements if r.teacher_id == teacher_id]
        for day, period in slots:
            overlapping = [x[(r.id, day, period)] for r in reqs if (r.id, day, period) in x]
            if len(overlapping) > 1:
                model.AddAtMostOne(overlapping)

    # --- HARD: a room hosts at most one lesson per slot ---------------------
    for room_id in data.rooms:
        reqs = [r for r in data.requirements if r.room_id == room_id]
        for day, period in slots:
            overlapping = [x[(r.id, day, period)] for r in reqs if (r.id, day, period) in x]
            if len(overlapping) > 1:
                model.AddAtMostOne(overlapping)

    # --- HARD: capacity of special room types (labs, computer rooms) --------
    # Lessons whose subject requires a specific room type may never exceed the
    # number of rooms of that type in any one slot. The post-solve room
    # allocator then always finds a concrete room.
    rooms_by_type: dict[str, int] = {}
    for room in data.rooms.values():
        if room.room_type and room.room_type != "classroom":
            rooms_by_type[room.room_type] = rooms_by_type.get(room.room_type, 0) + 1
    for room_type, count in rooms_by_type.items():
        for day, period in slots:
            demand = [
                x[(r.id, day, period)]
                for r in data.requirements
                if (r.id, day, period) in x
                and data.subjects.get(r.subject_id) is not None
                and data.subjects[r.subject_id].required_room_type == room_type
            ]
            if len(demand) > count:
                model.Add(sum(demand) <= count)

    # --- HARD: respect locked (pinned) lessons ------------------------------
    for req_id, pinned in data.locked.items():
        for day, period in pinned:
            if (req_id, day, period) in x:
                model.Add(x[(req_id, day, period)] == 1)

    # --- HARD: teacher daily limit -----------------------------------------
    for teacher_id, spec in data.teachers.items():
        reqs = [r for r in data.requirements if r.teacher_id == teacher_id]
        if not reqs:
            continue
        for day in data.days:
            per_day = [
                x[(r.id, day, p)] for r in reqs for p in data.teaching_periods if (r.id, day, p) in x
            ]
            if per_day:
                model.Add(sum(per_day) <= spec.max_per_day)

    # --- HARD: at most one lesson of a subject per class per day ------------
    # Spreading a subject is a preference, but two of the same subject in one
    # day is almost always wrong unless it is explicitly a double period.
    for req in data.requirements:
        subject = data.subjects.get(req.subject_id)
        if not subject or not subject.spread_across_week:
            continue
        if req.periods_per_week > len(data.days):
            continue  # cannot fit one-per-day; leave it to the objective
        per_day_cap = 2 if req.double_periods else 1
        for day in data.days:
            same_day = [x[(req.id, day, p)] for p in data.teaching_periods if (req.id, day, p) in x]
            if len(same_day) > per_day_cap:
                model.Add(sum(same_day) <= per_day_cap)

    report(26, "Applying constraints")
    if should_cancel and should_cancel():
        return SolverOutput("cancelled", [], {}, {}, ["Generation cancelled."])

    # ----------------------------------------------------------------------
    # SOFT constraints -> weighted penalties
    # ----------------------------------------------------------------------
    penalties: list[tuple["cp_model.IntVar | cp_model.LinearExpr", int]] = []
    w = data.weights

    # Teacher busy indicator per slot, reused by gap/consecutive terms.
    busy: dict[tuple[int, int, int], "cp_model.IntVar"] = {}
    for teacher_id in data.teachers:
        reqs = [r for r in data.requirements if r.teacher_id == teacher_id]
        if not reqs:
            continue
        for day in data.days:
            for period in data.teaching_periods:
                terms = [x[(r.id, day, period)] for r in reqs if (r.id, day, period) in x]
                var = model.NewBoolVar(f"busy_{teacher_id}_{day}_{period}")
                if terms:
                    model.AddMaxEquality(var, terms)
                else:
                    model.Add(var == 0)
                busy[(teacher_id, day, period)] = var

    # Soft: avoid teacher gaps (a free period sandwiched between two lessons).
    if w.teacher_gaps > 0:
        for teacher_id in data.teachers:
            for day in data.days:
                row = [busy.get((teacher_id, day, p)) for p in data.teaching_periods]
                row = [v for v in row if v is not None]
                for i in range(1, len(row) - 1):
                    gap = model.NewBoolVar(f"gap_{teacher_id}_{day}_{i}")
                    # gap = 1 when busy before AND after AND free now.
                    model.Add(gap <= row[i - 1])
                    model.Add(gap <= row[i + 1])
                    model.Add(gap <= 1 - row[i])
                    model.Add(gap >= row[i - 1] + row[i + 1] - row[i] - 1)
                    penalties.append((gap, w.teacher_gaps))

    # Soft: discourage long unbroken runs beyond each teacher's comfort limit.
    if w.consecutive_lessons > 0:
        for teacher_id, spec in data.teachers.items():
            run = max(1, spec.max_consecutive)
            for day in data.days:
                row = [busy.get((teacher_id, day, p)) for p in data.teaching_periods]
                row = [v for v in row if v is not None]
                for start in range(0, max(0, len(row) - run)):
                    window = row[start : start + run + 1]
                    if len(window) <= run:
                        continue
                    over = model.NewBoolVar(f"run_{teacher_id}_{day}_{start}")
                    model.Add(sum(window) - run <= over * len(window))
                    model.Add(over * 1 <= sum(window))
                    penalties.append((over, w.consecutive_lessons))

    # Soft: morning preference for subjects that ask for it.
    if w.morning_preference > 0 and data.morning_periods:
        afternoon = [p for p in data.teaching_periods if p not in data.morning_periods]
        for req in data.requirements:
            subject = data.subjects.get(req.subject_id)
            if not subject or not subject.prefers_morning:
                continue
            for day in data.days:
                for period in afternoon:
                    if (req.id, day, period) in x:
                        penalties.append((x[(req.id, day, period)], w.morning_preference))

    # Soft: spread a subject across distinct days.
    if w.subject_distribution > 0:
        for req in data.requirements:
            subject = data.subjects.get(req.subject_id)
            if not subject or not subject.spread_across_week or req.periods_per_week < 2:
                continue
            for day in data.days:
                same_day = [x[(req.id, day, p)] for p in data.teaching_periods if (req.id, day, p) in x]
                if len(same_day) < 2:
                    continue
                excess = model.NewIntVar(0, len(same_day), f"clump_{req.id}_{day}")
                model.Add(excess >= sum(same_day) - 1)
                penalties.append((excess, w.subject_distribution))

    # Soft: honour "keep these slots free" requests (the AI copilot writes these).
    if w.avoid_slots > 0:
        for rule in data.avoid_rules:
            if rule.is_hard:
                continue
            for req in data.requirements:
                match = (rule.scope == "class" and req.class_id == rule.target_id) or (
                    rule.scope == "teacher" and req.teacher_id == rule.target_id
                )
                if not match:
                    continue
                for day, period in rule.slots:
                    if (req.id, day, period) in x:
                        penalties.append((x[(req.id, day, period)], rule.weight or w.avoid_slots))

    # Soft: balance teacher workload across days (avoid 6-lesson/0-lesson days).
    if w.workload_balance > 0:
        for teacher_id, spec in data.teachers.items():
            reqs = [r for r in data.requirements if r.teacher_id == teacher_id]
            total = sum(r.periods_per_week for r in reqs)
            if total < 2 or not data.days:
                continue
            fair = math.ceil(total / len(data.days))
            for day in data.days:
                per_day = [
                    x[(r.id, day, p)] for r in reqs for p in data.teaching_periods if (r.id, day, p) in x
                ]
                if not per_day:
                    continue
                over = model.NewIntVar(0, len(per_day), f"load_{teacher_id}_{day}")
                model.Add(over >= sum(per_day) - fair)
                penalties.append((over, w.workload_balance))

    if penalties:
        model.Minimize(sum(var * weight for var, weight in penalties))

    # ----------------------------------------------------------------------
    report(38, "Optimising")
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(data.max_seconds)
    solver.parameters.num_search_workers = int(data.workers)

    callback = _ProgressCallback(report, should_cancel)
    status = solver.Solve(model, callback)

    if should_cancel and should_cancel():
        return SolverOutput("cancelled", [], {}, {}, ["Generation cancelled."])

    if status == cp_model.OPTIMAL:
        label = "optimal"
    elif status == cp_model.FEASIBLE:
        label = "feasible"
    else:
        return SolverOutput(
            "infeasible",
            [],
            {},
            {},
            [
                "No timetable satisfies every hard constraint. Relax an "
                "availability rule, reduce weekly lessons, or add rooms/periods."
            ],
        )

    report(84, "Validating")
    placements: list[Placement] = []
    for req in data.requirements:
        for day, period in slots:
            key = (req.id, day, period)
            if key in x and solver.Value(x[key]):
                placements.append(
                    Placement(
                        requirement_id=req.id,
                        class_id=req.class_id,
                        subject_id=req.subject_id,
                        teacher_id=req.teacher_id,
                        room_id=req.room_id,
                        day=day,
                        period=period,
                    )
                )

    quality = score(data, placements)
    stats = {
        "placed": len(placements),
        "required": sum(r.periods_per_week for r in data.requirements),
        "conflicts": 0,  # hard constraints are guaranteed by construction
        "penalty": int(solver.ObjectiveValue()) if penalties else 0,
        "wall_time": round(solver.WallTime(), 2),
        "status": label,
    }
    report(100, "Completed")
    return SolverOutput(label, placements, quality, stats, [])


class _ProgressCallback(cp_model.CpSolverSolutionCallback if ORTOOLS_AVAILABLE else object):  # type: ignore[misc]
    """Feeds incremental progress to the UI and honours cancellation."""

    def __init__(self, report, should_cancel):
        if ORTOOLS_AVAILABLE:
            cp_model.CpSolverSolutionCallback.__init__(self)
        self._report = report
        self._should_cancel = should_cancel
        self._count = 0

    def on_solution_callback(self):  # pragma: no cover - timing dependent
        self._count += 1
        # Improvement curve flattens quickly; approach 80% asymptotically.
        pct = min(80, 40 + self._count * 6)
        self._report(pct, f"Improving solution ({self._count})")
        if self._should_cancel and self._should_cancel():
            self.StopSearch()


# --------------------------------------------------------------------------
# Quality scoring — the same metrics the UI shows
# --------------------------------------------------------------------------
def score(data: SolverInput, placements: Sequence[Placement]) -> dict:
    """Score a timetable 0-100 across the dimensions shown in the UI."""
    required = sum(r.periods_per_week for r in data.requirements)
    placed = len(placements)

    hard = 100.0 if placed == required else round(100.0 * placed / max(1, required), 1)

    # Teacher gaps
    by_teacher_day: dict[tuple[int, int], list[int]] = {}
    for p in placements:
        if p.teacher_id is None:
            continue
        by_teacher_day.setdefault((p.teacher_id, p.day), []).append(p.period)
    gaps = 0
    spans = 0
    for periods in by_teacher_day.values():
        periods.sort()
        if len(periods) > 1:
            span = periods[-1] - periods[0] + 1
            spans += span
            gaps += span - len(periods)
    gap_score = 100.0 if spans == 0 else round(100.0 * (1 - gaps / spans), 1)

    # Subject distribution: penalise repeats of a subject on the same day.
    per_class_subject_day: dict[tuple[int, int, int], int] = {}
    for p in placements:
        key = (p.class_id, p.subject_id, p.day)
        per_class_subject_day[key] = per_class_subject_day.get(key, 0) + 1
    repeats = sum(v - 1 for v in per_class_subject_day.values() if v > 1)
    dist_score = 100.0 if placed == 0 else round(max(0.0, 100.0 * (1 - repeats / placed)), 1)

    # Morning preference adherence
    morning = set(data.morning_periods)
    wants_morning = [
        p for p in placements
        if (s := data.subjects.get(p.subject_id)) is not None and s.prefers_morning
    ]
    if wants_morning:
        hit = sum(1 for p in wants_morning if p.period in morning)
        morning_score = round(100.0 * hit / len(wants_morning), 1)
    else:
        morning_score = 100.0

    # Room utilisation across the teaching week
    capacity = len(data.days) * len(data.teaching_periods) * max(1, len(data.rooms))
    used = sum(1 for p in placements if p.room_id is not None)
    room_score = round(min(100.0, 100.0 * used / capacity), 1) if data.rooms else 100.0

    # Workload balance: spread of lessons per teacher vs the mean
    loads: dict[int, int] = {}
    for p in placements:
        if p.teacher_id is not None:
            loads[p.teacher_id] = loads.get(p.teacher_id, 0) + 1
    if len(loads) > 1:
        mean = sum(loads.values()) / len(loads)
        spread = sum(abs(v - mean) for v in loads.values()) / len(loads)
        workload_score = round(max(0.0, 100.0 - (spread / max(1.0, mean)) * 100.0), 1)
    else:
        workload_score = 100.0

    # Class distribution: even lessons per day
    per_class_day: dict[tuple[int, int], int] = {}
    for p in placements:
        per_class_day[(p.class_id, p.day)] = per_class_day.get((p.class_id, p.day), 0) + 1
    if per_class_day:
        mean = sum(per_class_day.values()) / len(per_class_day)
        spread = sum(abs(v - mean) for v in per_class_day.values()) / len(per_class_day)
        class_score = round(max(0.0, 100.0 - (spread / max(1.0, mean)) * 100.0), 1)
    else:
        class_score = 100.0

    breakdown = {
        "hard_constraints": hard,
        "teacher_workload": workload_score,
        "subject_distribution": dist_score,
        "room_utilisation": room_score,
        "teacher_gaps": gap_score,
        "class_distribution": class_score,
        "morning_preference": morning_score,
    }
    # Hard constraints dominate; preferences share the remainder.
    overall = (
        hard * 0.40
        + workload_score * 0.12
        + dist_score * 0.14
        + gap_score * 0.14
        + class_score * 0.10
        + morning_score * 0.06
        + room_score * 0.04
    )
    return {"overall": round(overall), "breakdown": breakdown}
