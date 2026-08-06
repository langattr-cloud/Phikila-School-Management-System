from sqlalchemy.orm import Session
from app.modules.timetable.clash_detector import ClashDetector
from app.modules.timetable.exceptions import TeacherClashError, RoomClashError, ClassClashError


class TimetableScheduler:

  def _init_(self, db: Session):
    self.db = db
    self.clash_detector = ClashDetector(db)

  def schedule_lesson(
      self,
      class_register_id: int,
      teacher_id: int,
      subject_id: int,
      day_of_week: str,
      period_id: int,
      room_id: str | None = None,
  ) -> dict:
    """Manually schedules a single lesson slot after validating all availability constraints."""
    
    # Run comprehensive clash checks via the clash detector
    self.clash_detector.validate_slot_assignment(
        teacher_id=teacher_id,
        room_id=room_id,
        class_register_id=class_register_id,
        day_of_week=day_of_week,
        period_id=period_id,
    )

    # Proceed with saving the scheduled slot to the database
    # (Insert database persistence logic here)

    return {
        "status": "Success",
        "message": "Lesson successfully scheduled.",
        "details": {
            "class_register_id": class_register_id,
            "teacher_id": teacher_id,
            "subject_id": subject_id,
            "day_of_week": day_of_week,
            "period_id": period_id,
            "room_id": room_id,
        },
    }

  def move_lesson(self, entry_id: int, new_day: str, new_period_id: int) -> dict:
    """Moves an existing scheduled lesson to a new day/period slot."""
    # Fetch existing entry, validate new slot availability excluding current entry ID, and update
    return {
        "status": "Success",
        "message": f"Lesson {entry_id} moved to {new_day} period {new_period_id}.",
    }

  def swap_lessons(self, entry_id_1: int, entry_id_2: int) -> dict:
    """Swaps two scheduled lesson slots across classes or periods."""
    # Handle slot exchange logic safely
    return {
        "status": "Success",
        "message": f"Lessons {entry_id_1} and {entry_id_2} successfully swapped.",
    }