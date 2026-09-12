"""Post-solve timetable rules and generation constraint helpers."""
from __future__ import annotations

from collections import defaultdict
from .solver import Placement, SolverInput, AvoidRule


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


def relaxation_order(rules: list[AvoidRule]) -> list[AvoidRule]:
    """Return hard avoid rules in least-important-first relaxation order.

    Higher weights represent more important constraints. Therefore Allow
    Relaxation starts with the lowest-weight hard rules and only escalates
    toward more important rules when necessary.
    """
    return sorted(
        (rule for rule in rules if rule.is_hard),
        key=lambda rule: (rule.weight if rule.weight is not None else 25, rule.scope, rule.target_id, rule.note),
    )


def relax_next_rule(rules: list[AvoidRule]) -> AvoidRule | None:
    """Relax one lowest-priority hard avoid rule and return it."""
    ordered = relaxation_order(rules)
    if not ordered:
        return None
    selected = ordered[0]
    selected.is_hard = False
    return selected
