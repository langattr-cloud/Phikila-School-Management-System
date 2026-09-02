from app.modules.scheduling.solver import (
    ClassSpec,
    RequirementSpec,
    Slot,
    SolverInput,
    SubjectSpec,
    TeacherSpec,
    AvoidRule,
    preflight,
    solve,
)


def make_input(requirements, avoid_rules):
    return SolverInput(
        days=[1, 2],
        periods=[1, 2],
        teaching_periods=[1, 2],
        morning_periods=[1],
        teachers={1: TeacherSpec(1, "Teacher")},
        rooms={},
        classes={1: ClassSpec(1, "Class")},
        subjects={1: SubjectSpec(1, "Math"), 2: SubjectSpec(2, "Science")},
        requirements=requirements,
        avoid_rules=avoid_rules,
        workers=1,
        max_seconds=5,
    )


def test_subject_time_off_blocks_only_matching_subject():
    data = make_input(
        [
            RequirementSpec(1, 1, 1, 1, None, 1),
            RequirementSpec(2, 1, 2, 1, None, 1),
        ],
        [AvoidRule("subject", 1, {(1, 1)}, is_hard=True)],
    )

    result = solve(data)

    assert result.solved
    assert all(not (p.subject_id == 1 and (p.day, p.period) == (1, 1)) for p in result.placements)
    assert any(p.subject_id == 2 and (p.day, p.period) == (1, 1) for p in result.placements)


def test_subject_time_off_is_included_in_preflight_capacity_message():
    data = make_input(
        [RequirementSpec(1, 1, 1, 1, None, 1)],
        [AvoidRule("subject", 1, {(1, 1), (1, 2), (2, 1), (2, 2)}, is_hard=True)],
    )

    problems = preflight(data)

    assert any("Math" in message and "subject time-off" in message for message in problems)
