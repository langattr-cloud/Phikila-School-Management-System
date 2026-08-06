from sqlalchemy.orm import Session
from app.modules.authentication.models import Role


def get_role_by_name(db: Session, name: str):
  return db.query(Role).filter(Role.name == name).first()


def create_role(db: Session, name: str, description: str = None):
  db_role = Role(name=name, description=description)
  db.add(db_role)
  db.commit()
  db.refresh(db_role)
  return db_role