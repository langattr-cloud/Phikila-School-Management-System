from fastapi import HTTPException, status


class CredentialsException(HTTPException):

  def _init_(self, detail: str = "Could not validate credentials"):
    super()._init_(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


class InactiveUserException(HTTPException):

  def _init_(self, detail: str = "Inactive user"):
    super()._init_(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)