"""Database-backed timetable conflict detection."""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.timetable.exceptions import ClassClashError, RoomClashError, TeacherClashError
from app.modules.timetable.models import TimetableEntry


class ClashDetector:
    def __init__(self, db: Session):
        self.db = db

    def _is_available(
        self, field, value, day_of_week: str, period_id: int,
        academic_year_id: int | None = None,
        exclude_entry_id: int | None = None,
        exclude_entry_ids: set[int] | None = None,
    ) -> bool:
        query = self.db.query(TimetableEntry.id).filter(
            field == value,
            func.lower(TimetableEntry.day_of_week) == day_of_week.strip().lower(),
            TimetableEntry.period_id == period_id,
        )
        if academic_year_id is not None:
            query = query.filter(TimetableEntry.academic_year_id == academic_year_id)
        excluded = set(exclude_entry_ids or ())
        if exclude_entry_id is not None:
            excluded.add(exclude_entry_id)
        if excluded:
            query = query.filter(~TimetableEntry.id.in_(excluded))
        return query.first() is None

    def check_teacher_availability(self, teacher_id: int, day_of_week: str, period_id: int,
                                   exclude_entry_id: int | None = None,
                                   academic_year_id: int | None = None,
                                   exclude_entry_ids: set[int] | None = None) -> bool:
        return self._is_available(TimetableEntry.teacher_id, teacher_id, day_of_week, period_id,
                                  academic_year_id, exclude_entry_id, exclude_entry_ids)

    def check_room_availability(self, room_id: str, day_of_week: str, period_id: int,
                                 exclude_entry_id: int | None = None,
                                 academic_year_id: int | None = None,
                                 exclude_entry_ids: set[int] | None = None) -> bool:
        return self._is_available(TimetableEntry.room_id, room_id, day_of_week, period_id,
                                  academic_year_id, exclude_entry_id, exclude_entry_ids)

    def check_class_availability(self, class_register_id: int, day_of_week: str, period_id: int,
                                 exclude_entry_id: int | None = None,
                                 academic_year_id: int | None = None,
                                 exclude_entry_ids: set[int] | None = None) -> bool:
        return self._is_available(TimetableEntry.class_register_id, class_register_id, day_of_week,
                                  period_id, academic_year_id, exclude_entry_id, exclude_entry_ids)

    def validate_slot_assignment(self, teacher_id: int, room_id: str | None,
                                 class_register_id: int, day_of_week: str, period_id: int,
                                 exclude_entry_id: int | None = None,
                                 academic_year_id: int | None = None,
                                 exclude_entry_ids: set[int] | None = None) -> None:
        if not day_of_week or not day_of_week.strip():
            raise ValueError("day_of_week is required.")
        if period_id <= 0:
            raise ValueError("period_id must be a positive integer.")
        args = {"day_of_week": day_of_week, "period_id": period_id,
                "exclude_entry_id": exclude_entry_id, "academic_year_id": academic_year_id,
                "exclude_entry_ids": exclude_entry_ids}
        if not self.check_teacher_availability(teacher_id, **args):
            raise TeacherClashError(f"Teacher (ID: {teacher_id}) is already booked for this period.")
        if not self.check_class_availability(class_register_id, **args):
            raise ClassClashError(f"Class register (ID: {class_register_id}) already has a lesson at this time.")
        if room_id is not None and str(room_id).strip() and not self.check_room_availability(str(room_id), **args):
            raise RoomClashError(f"Room '{room_id}' is already occupied during this period.")
