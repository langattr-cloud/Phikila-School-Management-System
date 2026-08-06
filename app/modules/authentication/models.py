from app.core.database import Base
from sqlalchemy import Column, ForeignKey, Integer, String, Table
from sqlalchemy.orm import relationship

# Association table for Many-to-Many relationship between User and Role
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column(
        "user_id",
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "role_id",
        Integer,
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    extend_existing=True,
)


class Role(Base):
  __tablename__ = "roles"
  __table_args__ = {"extend_existing": True}

  id = Column(Integer, primary_key=True, index=True)
  name = Column(String, unique=True, index=True, nullable=False)
  description = Column(String)