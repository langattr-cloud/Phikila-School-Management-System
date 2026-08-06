from sqlalchemy.orm import Session
from app.modules.timetable.repository import TimetableRepository
from app.modules.timetable.clash_detector import ClashDetector
from app.modules.timetable.validator import TimetableValidator
from app.modules.timetable.schemas import TimetableEntryCreate


class TimetableService:

    def __init__(self, db: Session):
        self.db = db
        self.repository = TimetableRepository(db)
        self.clash_detector = ClashDetector(db)

    def schedule_lesson(self, entry_data: TimetableEntryCreate):
        """Validates payload format, checks for clashes, and persists the entry."""
        TimetableValidator.validate_entry_payload(entry_data)
        
        self.clash_detector.validate_slot_assignment(
            teacher_id=entry_data.teacher_id,
            room_id=entry_data.room_id,
            class_register_id=entry_data.class_register_id,
            day_of_week=entry_data.day_of_week,
            period_id=entry_data.period_id,
        )
        return self.repository.create_entry(entry_data)