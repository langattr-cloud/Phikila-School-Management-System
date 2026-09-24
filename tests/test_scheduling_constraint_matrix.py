"""Constraint matrix for the pure timetable solver.

These tests exercise hard constraints independently of the ORM and API layers.
"""
from app.modules.scheduling.solver import (
    AvoidRule,
    ClassSpec,
    RequirementSpec,
    RoomSpec,
    SolverInput,
    SubjectSpec,
    TeacherSpec,
    preflight,
    solve,
)


def make_input(requirements, *, teachers=None, rooms=None, classes=None, subjects=None, avoid_rules=None, locked=None):
    return SolverInput(
        days=[0, 1],
        periods=[0, 1, 2],
        teaching_periods=[0, 1, 2],
        morning_periods=[0, 1],
        teachers=teachers or {1: TeacherSpec(1, "Teacher")},
        rooms=rooms or {},
        classes=classes or {1: ClassSpec(1, "Class", student_count=30)},
        subjects=subjects or {1: SubjectSpec(1, "Subject")},
        requirements=requirements,
        avoid_rules=avoid_rules or [],
        locked=locked or {},
        workers=1,
        max_seconds=5,
    )


def test_class_conflict_is_prevented():
    data = make_input([
        RequirementSpec(1, 1, 1, None, None, 1),
        RequirementSpec(2, 1, 1, None, None, 1),
    ])
    result = solve(data)
    assert result.solved
    slots = {(p.day, p.period) for p in result.placements}
    assert len(slots) == 2


def test_teacher_conflict_is_prevented():
    data = make_input(
        [
            RequirementSpec(1, 1, 1, 1, None, 1),
            RequirementSpec(2, 2, 1, 1, None, 1),
        ],
        classes={1: ClassSpec(1, "Class A"), 2: ClassSpec(2, "Class B")},
    )
    result = solve(data)
    assert result.solved
    slots = [(p.day, p.period) for p in result.placements]
    assert len(slots) == len(set(slots))


def test_room_conflict_is_prevented():
    data = make_input(
        [
            RequirementSpec(1, 1, 1, None, 1, 1),
            RequirementSpec(2, 2, 1, None, 1, 1),
        ],
        rooms={1: RoomSpec(1, "Room 1")},
        classes={1: ClassSpec(1, "Class A"), 2: ClassSpec(2, "Class B")},
    )
    result = solve(data)
    assert result.solved
    slots = [(p.day, p.period) for p in result.placements]
    assert len(slots) == len(set(slots))


def test_class_unavailable_slot_is_respected():
    data = make_input(
        [RequirementSpec(1, 1, 1, None, None, 1)],
        classes={1: ClassSpec(1, "Class", unavailable={(0, 0)})},
    )
    result = solve(data)
    assert result.solved
    assert all((p.day, p.period) != (0, 0) for p in result.placements)


def test_teacher_unavailable_slot_is_respected():
    data = make_input(
        [RequirementSpec(1, 1, 1, 1, None, 1)],
        teachers={1: TeacherSpec(1, "Teacher", unavailable={(0, 0)})},
    )
    result = solve(data)
    assert result.solved
    assert all((p.day, p.period) != (0, 0) for p in result.placements)


def test_room_unavailable_slot_is_respected():
    data = make_input(
        [RequirementSpec(1, 1, 1, None, 1, 1)],
        rooms={1: RoomSpec(1, "Room", unavailable={(0, 0)})},
    )
    result = solve(data)
    assert result.solved
    assert all((p.day, p.period) != (0, 0) for p in result.placements)


def test_room_capacity_and_type_are_hard_constraints():
    data = make_input(
        [RequirementSpec(1, 1, 1, None, 1, 1)],
        rooms={1: RoomSpec(1, "Lab", capacity=20, room_type="laboratory")},
        subjects={1: SubjectSpec(1, "Science", required_room_type="laboratory")},
        classes={1: ClassSpec(1, "Class", student_count=30)},
    )
    result = solve(data)
    assert not result.solved


def test_hard_avoid_rule_is_respected_for_class():
    data = make_input(
        [RequirementSpec(1, 1, 1, None, None, 1)],
        avoid_rules=[AvoidRule("class", 1, {(0, 0)}, is_hard=True)],
    )
    result = solve(data)
    assert result.solved
    assert all((p.day, p.period) != (0, 0) for p in result.placements)


def test_locked_lesson_is_preserved():
    data = make_input(
        [RequirementSpec(1, 1, 1, None, None, 1)],
        locked={1: [(1, 2)]},
    )
    result = solve(data)
    assert result.solved
    assert [(p.day, p.period) for p in result.placements] == [(1, 2)]


def test_teacher_daily_limit_is_hard():
    data = make_input(
        [
            RequirementSpec(1, 1, 1, 1, None, 1),
            RequirementSpec(2, 1, 1, 1, None, 1),
        ],
        teachers={1: TeacherSpec(1, "Teacher", max_per_day=1)},
    )
    result = solve(data)
    assert result.solved
    days = {p.day for p in result.placements}
    assert len(days) == 2


def test_preflight_rejects_invalid_double_period_request():
    data = make_input(
        [RequirementSpec(1, 1, 1, None, None, 1, double_periods=1)]
    )
    problems = preflight(data)
    assert any("double lesson" in message for message in problems)
