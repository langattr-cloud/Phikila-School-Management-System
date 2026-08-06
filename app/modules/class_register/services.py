from sqlalchemy.orm import Session
from app.modules.class_register.repository import ClassRegisterRepository
from app.modules.class_register.schemas import (
    ClassRegisterCreate,
    ClassRegisterUpdate,
)
from app.modules.class_register.exceptions import (
    ClassRegisterNotFoundError,
    DuplicateClassRegisterError,
)
from app.modules.class_register.models import ClassRegister


class ClassRegisterService:

  def _init_(self, db: Session):
    self.repo = ClassRegisterRepository(db)

  def get_class(self, class_id: int) -> ClassRegister:
    item = self.repo.get_by_id(class_id)
    if not item:
      raise ClassRegisterNotFoundError(class_id)
    return item

  def list_classes(self, skip: int = 0, limit: int = 100) -> list[ClassRegister]:
    return self.repo.get_all(skip, limit)

  def create_class(self, schema: ClassRegisterCreate) -> ClassRegister:
    existing = self.repo.get_by_academic_structure(
        schema.academic_year_id, schema.grade_form_id, schema.stream_id
    )
    if existing:
      raise DuplicateClassRegisterError(
          "A class register for this grade, stream, and academic year already"
          " exists."
      )
    return self.repo.create(schema)

  def update_class(
      self, class_id: int, schema: ClassRegisterUpdate
  ) -> ClassRegister:
    db_item = self.get_class(class_id)
    return self.repo.update(db_item, schema)