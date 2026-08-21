"""Post-solve timetable rules that are easier to express on placements."""
from __future__ import annotations

from collections import defaultdict
from .solver import Placement, SolverInput


def enforce_double_lessons(data: SolverInput, placements: list[Placement]) -> list[str]:
    """Validate and locally repair required double lessons.

    A double lesson must occupy two adjacent *teaching* periods on the same
    day. The CP-SAT model already handles resource conflicts; this pass uses
    the solved placements to turn the existing ``double_periods`` input into
    an explicit generation rule without changing the persisted lesson shape.
    """
    by_req: dict[int, list[Placement]] = defaultdict(list)
    for placement in placements:
        by_req[placement.requirement_id].append(placement)

    teaching = list(data.teaching_periods)
    adjacent = {(teaching[i], teaching[i + 1]) for i in range(len(teaching) - 1)}
    occupied = {(p.class_id, p.day, p.period): p for p in placements}
    occupied_teacher = {(p.teacher_id, p.day, p.period): p for p in placements if p.teacher_id is not None}
    occupied_room = {(p.room_id, p.day, p.period): p for p in placements if p.room_id is not None}

    def free_for(req, day: int, period: int, ignore: Placement | None = None) -> bool:
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
        existing = occupied.get((req.class_id, day, period))
        if existing is not None and existing is not ignore:
            return False
        if req.teacher_id:
            existing = occupied_teacher.get((req.teacher_id, day, period))
            if existing is not None and existing is not ignore:
                return False
        if req.room_id:
            existing = occupied_room.get((req.room_id, day, period))
            if existing is not None and existing is not ignore:
                return False
        return True

    problems: list[str] = []
    for req in data.requirements:
        required = max(0, req.double_periods)
        if not required:
            continue
        current = by_req.get(req.id, [])
        pairs: set[tuple[int, int]] = set()
        for p in current:
            if (p.period - 1) in teaching and (p.day, p.period - 1) in {(q.day, q.period) for q in current}:
                pairs.add((p.day, p.period - 1))
            if (p.period, p.period + 1) in adjacent and (p.day, p.period + 1) in {(q.day, q.period) for q in current}:
                pairs.add((p.day, p.period))
        if len(pairs) >= required:
            continue

        # First repair by moving a single lesson into an adjacent empty slot.
        need = required - len(pairs)
        positions = {(p.day, p.period) for p in current}
        repaired = 0
        for placement in list(current):
            if repaired >= need:
                break
            for day in data.days:
                for left, right in adjacent:
                    if day != placement.day and (day, left) not in positions and (day, right) not in positions:
                        continue
                    for target in (left, right):
                        if (day, target) in positions:
                            continue
                        if not free_for(req, day, target, placement):
                            continue
                        # Only move when the source can form a pair at the new slot.
                        mate = right if target == left else left
                        if (day, mate) in positions or not free_for(req, day, mate, placement):
                            placement.day = day
                            placement.period = target
                            positions.discard((placement.day, placement.period))
                            positions.add((day, target))
                            occupied[(req.class_id, day, target)] = placement
                            if req.teacher_id:
                                occupied_teacher[(req.teacher_id, day, target)] = placement
                            if req.room_id:
                                occupied_room[(req.room_id, day, target)] = placement
                            repaired += 1
                            break
                    if repaired >= need:
                        break
                if repaired >= need:
                    break

        current_pairs = {(p.day, p.period) for p in current}
        actual = 0
        for p in current:
            if (p.day, p.period + 1) in adjacent and (p.day, p.period + 1) in current_pairs:
                actual += 1
        actual //= 1
        if actual < required:
            subject = data.subjects.get(req.subject_id)
            klass = data.classes.get(req.class_id)
            problems.append(
                f"{subject.name if subject else 'A subject'} for {klass.name if klass else 'a class'} "
                f"requires {required} double lesson(s), but the generated timetable could not "
                f"place them consecutively. Relax a constraint or add teaching periods."
            )
    return problems
