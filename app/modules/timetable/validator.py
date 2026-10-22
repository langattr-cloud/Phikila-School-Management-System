"""Input validation for manual timetable assignments."""
from app.modules.timetable.constants import DAYS_OF_WEEK
from app.modules.timetable.schemas import TimetableEntryCreate


class TimetableValidator:
    @staticmethod
    def validate_entry_payload(data: TimetableEntryCreate) -> None:
        day = data.day_of_week.strip().title()
        allowed_days = {value.strip().title() for value in DAYS_OF_WEEK}
        if day not in allowed_days:
            raise ValueError(f"Invalid day of week: {data.day_of_week}")
        if data.period_id < 1:
            raise ValueError("Period ID must be a positive integer.")
        if data.class_register_id < 1 or data.teacher_id < 1 or data.subject_id < 1:
            raise ValueError("Class, teacher, and subject IDs must be positive integers.")
        if data.academic_year_id < 1:
            raise ValueError("Academic year ID must be a positive integer.")
