import re
from datetime import date


def validate_admission_number(admission_number: str) -> str:
  """Ensures admission number follows a standard format (e.g., alphanumeric)."""
  if not admission_number or not admission_number.strip():
    raise ValueError("Admission number cannot be empty.")

  # Example regex pattern allowing letters, numbers, and dashes/slashes
  pattern = r"^[A-Za-z0-9\-/]+$"
  if not re.match(pattern, admission_number.strip()):
    raise ValueError(
        "Invalid admission number format. Use alphanumeric characters, hyphens,"
        " or slashes."
    )
  return admission_number.strip().upper()


def validate_birth_date(dob: date) -> date:
  """Ensures the date of birth is not in the future."""
  if dob > date.today():
    raise ValueError("Date of birth cannot be in the future.")
  return dob


def validate_age(dob: date, min_age: int = 3, max_age: int = 25) -> int:
  """Calculates age from date of birth and ensures it falls within acceptable school bounds."""
  today = date.today()
  age = (
      today.year
      - dob.year
      - ((today.month, today.day) < (dob.month, dob.day))
  )

  if age < min_age or age > max_age:
    raise ValueError(
        f"Calculated age ({age}) is out of the valid school range ({min_age} -"
        f" {max_age} years)."
    )
  return age


def validate_phone_number(phone_number: str) -> str:
  """Basic phone number validator supporting local and international formats."""
  if not phone_number:
    raise ValueError("Phone number is required.")

  # Strips spaces and dashes for checking
  cleaned = re.sub(r"[\s\-\(\)]", "", phone_number)

  # Matches standard formats like +254... or 07... / 01... (common local formats)
  pattern = r"^(?:\+254|0)[17]\d{8}$|^\+\d{10,15}$"
  if not re.match(pattern, cleaned):
    raise ValueError(
        "Invalid phone number format. Please provide a valid phone number."
    )
  return phone_number.strip()


def validate_email(email: str | None) -> str | None:
  """Validates email format if provided."""
  if not email:
    return None

  email = email.strip()
  pattern = r"^[\w\.-]+@[\w\.-]+\.\w+$"
  if not re.match(pattern, email):
    raise ValueError("Invalid email address format.")
  return email


def validate_gender(gender: str) -> str:
  """Ensures gender matches allowed system values."""
  allowed_genders = {"Male", "Female", "Other"}
  if gender not in allowed_genders:
    raise ValueError(
        f"Invalid gender. Must be one of: {', '.join(allowed_genders)}"
    )
  return gender