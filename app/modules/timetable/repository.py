from sqlalchemy.orm import Session
from app.modules.timetable.models import TimetableEntry
from app.modules.timetable.schemas import TimetableEntryCreate


class TimetableRepository:

  def _init_(self, db: Session):
    self.db = db

  def get_by_id(self, entry_id: int) -> TimetableEntry | None:
    """Fetch a single timetable entry by its ID."""
    return (
        self.db.query(TimetableEntry)
        .filter(TimetableEntry.id == entry_id)
        .first()
    )

  def get_entries_for_class(
      self, class_register_id: int, academic_year_id: int
  ) -> list[TimetableEntry]:
    """Retrieve all scheduled timetable slots for a specific class."""
    return (
        self.db.query(TimetableEntry)
        .filter(
            TimetableEntry.class_register_id == class_register_id,
            TimetableEntry.academic_year_id == academic_year_id,
        )
        .all()
    )

  def create_entry(self, entry_data: TimetableEntryCreate) -> TimetableEntry:
    """Persist a new scheduled lesson entry into the database."""
    db_entry = TimetableEntry(**entry_data.dict())
    self.db.add(db_entry)
    self.db.commit()
    self.db.refresh(db_entry)
    return db_entry

  def delete_entry(self, entry_id: int) -> bool:
    """Delete a timetable entry by ID."""
    db_entry = self.get_by_id(entry_id)
    if db_entry:
      self.db.delete(db_entry)
      self.db.commit()
      return True
    return False