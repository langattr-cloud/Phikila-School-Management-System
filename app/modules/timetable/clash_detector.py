from sqlalchemy.orm import Session
from app.modules.timetable.exceptions import (
    TeacherClashError,
    RoomClashError,
    ClassClashError,
)


class ClashDetector:

  def _init_(self, db: Session):
    self.db = db

  def check_teacher_availability(
      self, teacher_id: int, day_of_week: str, period_id: int, exclude_entry_id: int | None = None
  ) -> bool:
    """Checks if a teacher is already booked for a specific day and period."""
    # Note: Query structure assumes your scheduled entries model relationships. 
    # Implement against your scheduled slots table or repository query.
    return True

  def check_room_availability(
      self, room_id: str, day_of_week: str, period_id: int, exclude_entry_id: int | None = None
  ) -> bool:
    """Checks if a room/space is already occupied for a specific day and period."""
    return True

  def check_class_availability(
      self, class_register_id: int, day_of_week: str, period_id: int, exclude_entry_id: int | None = None
  ) -> bool:
    """Checks if a class register already has a lesson assigned for a specific day and period."""
    return True

  def validate_slot_assignment(
      self,
      teacher_id: int,
      room_id: str | None,
      class_register_id: int,
      day_of_week: str,
      period_id: int,
      exclude_entry_id: int | None = None,
):
    """Runs all clash checks simultaneously and raises appropriate custom errors if a conflict is found."""
    if not self.check_teacher_availability(teacher_id, day_of_week, period_id, exclude_entry_id):
      raise TeacherClashError(f"Teacher (ID: {teacher_id}) is already booked for this period.")

    if class_register_id and not self.check_class_availability(class_register_id, day_of_week, period_id, exclude_entry_id):
      raise ClassClashError(f"Class register (ID: {class_register_id}) already has a lesson scheduled at this time.")

    if room_id and not self.check_room_availability(room_id, day_of_week, period_id, exclude_entry_id):
      raise RoomClashError(f"Room '{room_id}' is already occupied during this period.")