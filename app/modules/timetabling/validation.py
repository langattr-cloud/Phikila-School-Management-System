"""Pure validation helpers shared by API and solver tests."""
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class Placement:
    lesson_id: int
    day: int
    period: int
    duration: int
    class_id: int
    teacher_ids: tuple[int, ...]
    room_id: int | None = None
    week: str = "every_week"


def find_placement_conflicts(placements: Iterable[Placement]) -> list[dict[str, object]]:
    """Report overlaps on shared resources; same lesson never conflicts with itself.

    A placement occupies [period, period + duration). Week A/B placements do not
    overlap each other; an every-week placement overlaps either alternating week.
    """
    items = list(placements)
    conflicts: list[dict[str, object]] = []

    def weeks_overlap(a: str, b: str) -> bool:
        return a == "every_week" or b == "every_week" or a == b

    for i, left in enumerate(items):
        for right in items[i + 1:]:
            if left.lesson_id == right.lesson_id or left.day != right.day:
                continue
            if not weeks_overlap(left.week, right.week):
                continue
            if left.period >= right.period + right.duration or right.period >= left.period + left.duration:
                continue
            shared = []
            if left.class_id == right.class_id:
                shared.append("class")
            if set(left.teacher_ids) & set(right.teacher_ids):
                shared.append("teacher")
            if left.room_id is not None and left.room_id == right.room_id:
                shared.append("room")
            if shared:
                conflicts.append({"left_lesson_id": left.lesson_id, "right_lesson_id": right.lesson_id,
                                  "day": left.day, "resources": shared})
    return conflicts
