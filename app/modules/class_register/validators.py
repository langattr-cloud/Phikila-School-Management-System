from app.modules.class_register.constants import ALLOWED_CLASS_STATUSES
from app.modules.class_register.exceptions import InvalidClassStatusError


def validate_capacity(capacity: int) -> int:
  """Ensures class capacity is within a logical school boundary."""
  if capacity <= 0:
    raise ValueError("Class capacity must be greater than zero.")
  if capacity > 100:
    raise ValueError("Class capacity cannot exceed 100 students.")
  return capacity


def validate_class_status(status: str) -> str:
  """Ensures the status string matches allowed options."""
  if status not in ALLOWED_CLASS_STATUSES:
    raise InvalidClassStatusError(status)
  return status