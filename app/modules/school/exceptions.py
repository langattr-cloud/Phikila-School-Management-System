class SchoolException(Exception):
    """Base exception for school module."""
    pass

class SchoolNotFoundException(SchoolException):
    def __init__(self, message: str = "School information not found."):
        super().__init__(message)

class CampusNotFoundException(SchoolException):
    def __init__(self, message: str = "Campus not found."):
        super().__init__(message)