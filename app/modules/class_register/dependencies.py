from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.class_register.models import ClassRegister
from app.modules.class_register.services import ClassRegisterService


def get_class_register_or_404(
    class_id: int, db: Session = Depends(get_db)
) -> ClassRegister:
  """FastAPI dependency that returns a class register instance or raises a 404 error."""
  service = ClassRegisterService(db)
  return service.get_class(class_id)