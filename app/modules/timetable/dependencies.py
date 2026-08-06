from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.timetable.services import TimetableService


def get_timetable_service(db: Session = Depends(get_db)) -> TimetableService:
    """FastAPI dependency to inject TimetableService with an active DB session."""
    return TimetableService(db)