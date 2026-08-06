from fastapi import HTTPException, status


class ClassRegisterNotFoundError(HTTPException):

  def _init_(self, class_id: int):
    super()._init_(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Class register with ID {class_id} not found.",
    )


class DuplicateClassRegisterError(HTTPException):

  def _init_(
      self,
      message: str = (
          "This class register already exists for the given academic year."
      ),
  ):
    super()._init_(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )


class ClassCapacityExceededError(HTTPException):

  def _init_(
      self, message: str = "Class capacity limit has been reached."
  ):
    super()._init_(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=message,
    )


class InvalidClassStatusError(HTTPException):

  def _init_(self, status_val: str):
    super()._init_(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid class status '{status_val}'.",
    )