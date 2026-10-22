"""Application service for timetable creation and validation."""
from sqlalchemy.orm import Session

from app.modules.timetable.clash_detector import ClashDetector
from app.modules.timetable.repository import TimetableRepository
from app.modules.timetable.schemas import TimetableEntryCreate
from app.modules.timetable.validator import TimetableValidator


class TimetableService:
    def __init__(self, db: Session):
        self.db = db
        self.repository = TimetableRepository(db)
        self.clash_detector = ClashDetector(db)

    def schedule_lesson(self, entry_data: TimetableEntryCreate):
        """Validate and persist a lesson in one consistent service flow."""
        TimetableValidator.validate_entry_payload(entry_data)
        self.clash_detector.validate_slot_assignment(
            teacher_id=entry_data.teacher_id,
            room_id=entry_data.room_id,
            class_register_id=entry_data.class_register_id,
            day_of_week=entry_data.day_of_week,
            period_id=entry_data.period_id,
            academic_year_id=entry_data.academic_year_id,
        )
        return self.repository.create_entry(entry_data)
