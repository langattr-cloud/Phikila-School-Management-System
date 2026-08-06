from fastapi import HTTPException, status


class StudentNotFoundError(HTTPException):

  def _init_(self, student_id: int):
    super()._init_(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Student with ID {student_id} not found.",
    )


class DuplicateAdmissionNumberError(HTTPException):

  def _init_(self, admission_number: str):
    super()._init_(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Admission number '{admission_number}' already exists.",
    )


class InvalidAgeError(HTTPException):

  def _init_(self, message: str = "Invalid age for the selected grade."):
    super()._init_(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )


class InvalidClassError(HTTPException):

  def _init_(self, message: str = "Assigned class or level does not exist."):
    super()._init_(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )


class GuardianNotFoundError(HTTPException):

  def _init_(self, guardian_id: int):
    super()._init_(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Guardian with ID {guardian_id} not found.",
    )


class StudentAlreadyExistsError(HTTPException):

  def _init_(self, message: str = "Student record already exists."):
    super()._init_(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )