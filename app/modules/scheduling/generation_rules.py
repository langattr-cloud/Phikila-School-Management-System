"""Post-solve timetable rules that are easier to express on placements."""
from __future__ import annotations

from collections import defaultdict
from .solver import Placement, SolverInput


def enforce_double_lessons(data: SolverInput, placements: list[Placement]) -> list[str]:
    """Validate that required double lessons occupy adjacent teaching periods."""
    by_req: dict[int, list[Placement]] = defaultdict(list)
    for placement in placements:
        by_req[placement.requirement_id].append(placement)

    order = {period: index for index, period in enumerate(data.teaching_periods)}
    problems: list[str] = []
    for req in data.requirements:
        required = max(0, req.double_periods)
        if not required:
            continue
        current = by_req.get(req.id, [])
        if len(current) < req.periods_per_week:
            continue
        by_day: dict[int, list[int]] = defaultdict(list)
        for placement in current:
            by_day[placement.day].append(placement.period)

        double_blocks = 0
        for periods in by_day.values():
            positions = sorted(order[p] for p in periods if p in order)
            run = 0
            previous = None
            for position in positions:
                if previous is not None and position == previous + 1:
                    run += 1
                else:
                    if run:
                        double_blocks += run // 2
                    run = 1
                previous = position
            if run:
                double_blocks += run // 2

        if double_blocks < required:
            subject = data.subjects.get(req.subject_id)
            klass = data.classes.get(req.class_id)
            problems.append(
                f"{subject.name if subject else 'A subject'} for {klass.name if klass else 'a class'} "
                f"requires {required} double lesson(s), but the generated timetable only contains "
                f"{double_blocks} consecutive double block(s). Relax a constraint or add teaching periods."
            )
    return problems
