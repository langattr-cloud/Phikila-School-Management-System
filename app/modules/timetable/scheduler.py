"""Transactional operations for manually editing timetable entries."""
from sqlalchemy.orm import Session

from app.modules.timetable.clash_detector import ClashDetector
from app.modules.timetable.exceptions import TimetableNotFoundError
from app.modules.timetable.models import TimetableEntry


class TimetableScheduler:
    def __init__(self, db: Session):
        self.db = db
        self.clash_detector = ClashDetector(db)

    def move_lesson(self, entry_id: int, new_day: str, new_period_id: int) -> dict:
        entry = self.db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).first()
        if entry is None:
            raise TimetableNotFoundError(entry_id)
        self.clash_detector.validate_slot_assignment(
            teacher_id=entry.teacher_id, room_id=entry.room_id,
            class_register_id=entry.class_register_id, day_of_week=new_day,
            period_id=new_period_id, exclude_entry_id=entry.id,
            academic_year_id=entry.academic_year_id,
        )
        try:
            entry.day_of_week = new_day.strip().title()
            entry.period_id = new_period_id
            self.db.commit()
            self.db.refresh(entry)
        except Exception:
            self.db.rollback()
            raise
        return {"status": "Success", "message": f"Lesson {entry_id} moved to {entry.day_of_week} period {entry.period_id}."}

    def swap_lessons(self, entry_id_1: int, entry_id_2: int) -> dict:
        if entry_id_1 == entry_id_2:
            raise ValueError("Two different timetable entry IDs are required.")
        first = self.db.query(TimetableEntry).filter(TimetableEntry.id == entry_id_1).first()
        second = self.db.query(TimetableEntry).filter(TimetableEntry.id == entry_id_2).first()
        if first is None:
            raise TimetableNotFoundError(entry_id_1)
        if second is None:
            raise TimetableNotFoundError(entry_id_2)
        if first.academic_year_id != second.academic_year_id:
            raise ValueError("Lessons from different academic years cannot be swapped.")

        first_slot = (first.day_of_week, first.period_id)
        second_slot = (second.day_of_week, second.period_id)
        excluded = {first.id, second.id}
        try:
            self.clash_detector.validate_slot_assignment(
                teacher_id=first.teacher_id, room_id=first.room_id,
                class_register_id=first.class_register_id, day_of_week=second_slot[0],
                period_id=second_slot[1], academic_year_id=first.academic_year_id,
                exclude_entry_ids=excluded,
            )
            self.clash_detector.validate_slot_assignment(
                teacher_id=second.teacher_id, room_id=second.room_id,
                class_register_id=second.class_register_id, day_of_week=first_slot[0],
                period_id=first_slot[1], academic_year_id=second.academic_year_id,
                exclude_entry_ids=excluded,
            )
            first.day_of_week, first.period_id = second_slot
            second.day_of_week, second.period_id = first_slot
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return {"status": "Success", "message": f"Lessons {entry_id_1} and {entry_id_2} successfully swapped."}
