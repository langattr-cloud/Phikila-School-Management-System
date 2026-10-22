from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.timetable.dependencies import get_timetable_service
from app.modules.timetable.generator import TimetableGenerator
from app.modules.timetable.schemas import TimetableEntryCreate, TimetableEntryResponse, TimetableSwapRequest
from app.modules.timetable.scheduler import TimetableScheduler
from app.modules.timetable.services import TimetableService

router = APIRouter(prefix="/timetable", tags=["Timetable Engine"])


@router.post("/generate/class/{class_register_id}", status_code=status.HTTP_201_CREATED)
def generate_class_timetable(
    class_register_id: int, academic_year_id: int, db: Session = Depends(get_db)
):
    """Trigger automated timetable generation for one class register."""
    return TimetableGenerator(db).generate_for_class(class_register_id, academic_year_id)


@router.post("/generate/school/{academic_year_id}", status_code=status.HTTP_201_CREATED)
def generate_school_timetable(academic_year_id: int, db: Session = Depends(get_db)):
    """Trigger automated timetable generation school-wide."""
    return TimetableGenerator(db).generate_school_wide(academic_year_id)


@router.post(
    "/schedule",
    response_model=TimetableEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
def manual_schedule_lesson(
    entry_data: TimetableEntryCreate,
    service: TimetableService = Depends(get_timetable_service),
):
    """Create a lesson after validating timetable conflicts."""
    return service.schedule_lesson(entry_data)


@router.patch("/schedule/move/{entry_id}", status_code=status.HTTP_200_OK)
def move_scheduled_lesson(
    entry_id: int,
    new_day: str,
    new_period_id: int,
    db: Session = Depends(get_db),
):
    """Move an existing lesson after checking the destination slot."""
    return TimetableScheduler(db).move_lesson(entry_id, new_day, new_period_id)


@router.post("/schedule/swap", status_code=status.HTTP_200_OK)
def swap_scheduled_lessons(
    request: TimetableSwapRequest,
    db: Session = Depends(get_db),
):
    """Swap the day/period slots of two existing lessons."""
    return TimetableScheduler(db).swap_lessons(request.entry_id_1, request.entry_id_2)
