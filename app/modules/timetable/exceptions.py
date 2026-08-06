from fastapi import HTTPException, status


class TeacherClashError(HTTPException):

  def __init__(self, message: str = "Teacher is already scheduled for this time slot."):
    super().__init__(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )


class RoomClashError(HTTPException):

  def __init__(self, message: str = "Room is already occupied during this time slot."):
    super().__init__(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )


class ClassClashError(HTTPException):

  def __init__(self, message: str = "Class register already has a lesson assigned at this time."):
    super().__init__(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )


class TimetableNotFoundError(HTTPException):

  def __init__(self, timetable_id: int):
    super().__init__(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Timetable with ID {timetable_id} not found.",
    )


class GenerationFailedError(HTTPException):

  def __init__(self, message: str = "Unable to generate timetable due to unresolvable constraints or missing allocations."):
    super().__init__(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )