# Place any custom validation functions for subjects here 
# (e.g., checking for specific naming conventions or allowed subject prefixes)


def validate_subject_code(code: str) -> str:
  """Ensure subject code follows standard formatting if required."""
  return code.upper().strip()