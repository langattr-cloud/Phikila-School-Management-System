from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.class_register.schemas import (
    ClassRegisterCreate,
    ClassRegisterResponse,
    ClassRegisterUpdate,
)
from app.modules.class_register.services import ClassRegisterService

router = APIRouter(prefix="/classes", tags=["Class Register"])


@router.post(
    "/",
    response_model=ClassRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_class_register(
    schema: ClassRegisterCreate, db: Session = Depends(get_db)
):
  service = ClassRegisterService(db)
  return service.create_class(schema)


@router.get("/", response_model=list[ClassRegisterResponse])
def list_class_registers(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
):
  service = ClassRegisterService(db)
  return service.list_classes(skip, limit)


@router.get("/{class_id}", response_model=ClassRegisterResponse)
def get_class_register(class_id: int, db: Session = Depends(get_db)):
  service = ClassRegisterService(db)
  return service.get_class(class_id)


@router.patch("/{class_id}", response_model=ClassRegisterResponse)
def update_class_register(
    class_id: int, schema: ClassRegisterUpdate, db: Session = Depends(get_db)
):
  service = ClassRegisterService(db)
  return service.update_class(class_id, schema)