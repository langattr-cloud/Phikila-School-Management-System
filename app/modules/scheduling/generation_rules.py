"""Post-solve timetable rules that are easier to express on placements."""
from __future__ import annotations

from collections import defaultdict
from .solver import Placement, SolverInput


def enforce_double_lessons(data: SolverInput, placements: list[Placement]) -> list[str]:
    """Apply and validate configured double-period lesson durations.

    A double lesson is represented by one lesson row with ``duration=2`` and
    consumes two consecutive configured teaching periods. The second solver
    placement is removed so weekly teaching-period allocation is preserved.
    No clock duration is hardcoded; the calendar period rows determine the
    actual start/end times.
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

        selected_first: set[int] = set()
        selected_second: set[int] = set()
        for first, second in pairs:
            if len(selected_first) >= required:
                break
            first_key = id(first)
            second_key = id(second)
            if first_key in selected_second or second_key in selected_first:
                continue
            first.duration = 2
            selected_first.add(first_key)
            selected_second.add(second_key)

        if len(selected_first) < required:
            subject = data.subjects.get(req.subject_id)
            klass = data.classes.get(req.class_id)
            problems.append(
                f"{subject.name if subject else 'A subject'} for {klass.name if klass else 'a class'} "
                f"requires {required} double lesson(s), but the generated timetable could not "
                "form enough non-overlapping consecutive blocks. Relax a constraint or add teaching periods."
            )
            continue

        placements[:] = [p for p in placements if id(p) not in selected_second]
        by_req[req.id] = [p for p in current if id(p) not in selected_second]

        allocated_periods = sum(max(1, p.duration) for p in by_req[req.id])
        if allocated_periods != req.periods_per_week:
            subject = data.subjects.get(req.subject_id)
            klass = data.classes.get(req.class_id)
            problems.append(
                f"{subject.name if subject else 'A subject'} for {klass.name if klass else 'a class'} "
                f"requires {req.periods_per_week} teaching period(s), but duration-aware generation "
                f"allocated {allocated_periods}."
            )

    return problems
