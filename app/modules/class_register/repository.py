from sqlalchemy.orm import Session
from app.modules.class_register.models import ClassRegister
from app.modules.class_register.schemas import (
    ClassRegisterCreate,
    ClassRegisterUpdate,
)


class ClassRegisterRepository:

  def _init_(self, db: Session):
    self.db = db

  def get_by_id(self, class_id: int) -> ClassRegister | None:
    return (
        self.db.query(ClassRegister)
        .filter(ClassRegister.id == class_id)
        .first()
    )

  def get_all(self, skip: int = 0, limit: int = 100) -> list[ClassRegister]:
    return (
        self.db.query(ClassRegister)
        .offset(skip)
        .limit(limit)
        .all()
    )

  def get_by_academic_structure(
      self, academic_year_id: int, grade_form_id: int, stream_id: int
  ) -> ClassRegister | None:
    return (
        self.db.query(ClassRegister)
        .filter(
            ClassRegister.academic_year_id == academic_year_id,
            ClassRegister.grade_form_id == grade_form_id,
            ClassRegister.stream_id == stream_id,
        )
        .first()
    )

  def create(self, schema: ClassRegisterCreate) -> ClassRegister:
    db_item = ClassRegister(**schema.model_dump())
    self.db.add(db_item)
    self.db.commit()
    self.db.refresh(db_item)
    return db_item

  def update(
      self, db_item: ClassRegister, schema: ClassRegisterUpdate
  ) -> ClassRegister:
    update_data = schema.model_dump(exclude_unset=True)
    for key, value in update_data.items():
      setattr(db_item, key, value)
    self.db.commit()
    self.db.refresh(db_item)
    return db_item