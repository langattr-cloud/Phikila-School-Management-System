from app.modules.timetable.schemas import TimetableEntryCreate
from app.modules.timetable.constants import DAYS_OF_WEEK


class TimetableValidator:

    @staticmethod
    def validate_entry_payload(data: TimetableEntryCreate):
        """Performs basic validation on slot creation payloads."""
        if data.day_of_week not in DAYS_OF_WEEK:
            raise ValueError(f"Invalid day of week: {data.day_of_week}")
        if data.period_id < 1:
            raise ValueError("Period ID must be a positive integer.")