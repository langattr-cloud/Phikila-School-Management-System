"""Persistence operations for timetable entries."""
from sqlalchemy.orm import Session

from app.modules.timetable.models import TimetableEntry
from app.modules.timetable.schemas import TimetableEntryCreate


class TimetableRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, entry_id: int) -> TimetableEntry | None:
        return self.db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).first()

    def get_entries_for_class(
        self, class_register_id: int, academic_year_id: int
    ) -> list[TimetableEntry]:
        return (
            self.db.query(TimetableEntry)
            .filter(
                TimetableEntry.class_register_id == class_register_id,
                TimetableEntry.academic_year_id == academic_year_id,
            )
            .order_by(TimetableEntry.day_of_week, TimetableEntry.period_id)
            .all()
        )

    def create_entry(self, entry_data: TimetableEntryCreate) -> TimetableEntry:
        payload = entry_data.model_dump() if hasattr(entry_data, "model_dump") else entry_data.dict()
        payload["day_of_week"] = payload["day_of_week"].strip().title()
        db_entry = TimetableEntry(**payload)
        try:
            self.db.add(db_entry)
            self.db.commit()
            self.db.refresh(db_entry)
        except Exception:
            self.db.rollback()
            raise
        return db_entry

    def delete_entry(self, entry_id: int) -> bool:
        db_entry = self.get_by_id(entry_id)
        if db_entry is None:
            return False
        try:
            self.db.delete(db_entry)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return True
