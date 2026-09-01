"""Post-solve timetable rules that are easier to express on placements."""
from __future__ import annotations

from collections import defaultdict
from .solver import Placement, SolverInput


def apply_lesson_durations(data: SolverInput, placements: list[Placement]) -> list[str]:
    """Convert configured consecutive lesson periods into duration-aware placements.

    ``periods_per_week`` remains the amount of teaching time required, while
    ``double_periods`` controls how many two-period blocks that requirement must
    contain. The actual wall-clock duration is therefore inherited from the
    configured calendar periods; no minute value is introduced here.
    """
    by_req: dict[int, list[Placement]] = defaultdict(list)
    for placement in placements:
        by_req[placement.requirement_id].append(placement)

    order = {period: index for index, period in enumerate(data.teaching_periods)}
    problems: list[str] = []

    for req in data.requirements:
        required = max(0, req.double_periods)
        current = by_req.get(req.id, [])
        if not required:
            continue

        by_day: dict[int, list[Placement]] = defaultdict(list)
        for placement in current:
            by_day[placement.day].append(placement)

        pairs: list[tuple[Placement, Placement]] = []
        for day_placements in by_day.values():
            day_placements.sort(key=lambda item: order.get(item.period, 10**9))
            for first, second in zip(day_placements, day_placements[1:]):
                first_pos = order.get(first.period)
                second_pos = order.get(second.period)
                if first_pos is not None and second_pos == first_pos + 1:
                    pairs.append((first, second))

        if len(pairs) < required:
            subject = data.subjects.get(req.subject_id)
            klass = data.classes.get(req.class_id)
            problems.append(
                f"{subject.name if subject else 'A subject'} for {klass.name if klass else 'a class'} "
                f"requires {required} double lesson(s), but the generated timetable only contains "
                f"{len(pairs)} consecutive double block(s). Relax a constraint or add teaching periods."
            )
            continue

        selected_second_ids: set[int] = set()
        selected_first_ids: set[int] = set()
        for first, second in pairs:
            if len(selected_first_ids) >= required:
                break
            if first.id in selected_second_ids or second.id in selected_first_ids:
                continue
            first.duration = 2
            selected_first_ids.add(first.id)
            selected_second_ids.add(second.id)

        if len(selected_first_ids) < required:
            subject = data.subjects.get(req.subject_id)
            klass = data.classes.get(req.class_id)
            problems.append(
                f"{subject.name if subject else 'A subject'} for {klass.name if klass else 'a class'} "
                f"requires {required} double lesson(s), but the generated timetable could not "
                "form enough non-overlapping consecutive blocks."
            )
            continue

        placements[:] = [p for p in placements if p.id not in selected_second_ids]

    return problems


def enforce_double_lessons(data: SolverInput, placements: list[Placement]) -> list[str]:
    """Validate configured double lessons after duration conversion."""
    problems: list[str] = []
    for req in data.requirements:
        required = max(0, req.double_periods)
        if not required:
            continue
        current = [p for p in placements if p.requirement_id == req.id]
        double_blocks = sum(1 for p in current if p.duration >= 2)
        allocated_periods = sum(max(1, p.duration) for p in current)
        if double_blocks < required or allocated_periods != req.periods_per_week:
            subject = data.subjects.get(req.subject_id)
            klass = data.classes.get(req.class_id)
            problems.append(
                f"{subject.name if subject else 'A subject'} for {klass.name if klass else 'a class'} "
                f"requires {required} double lesson(s) and {req.periods_per_week} teaching period(s), "
                f"but the generated timetable allocated {allocated_periods} period(s) across "
                f"{double_blocks} double block(s)."
            )
    return problems
