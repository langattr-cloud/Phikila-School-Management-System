from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from sqlalchemy.sql import func


class User(Base):
  __tablename__ = "users"
  # Removed _table_args_ schema configuration for SQLite compatibility

  id = Column(Integer, primary_key=True, index=True)
  username = Column(String, unique=True, index=True, nullable=False)
  email = Column(String, unique=True, index=True, nullable=False)
  hashed_password = Column(String, nullable=False)
  role = Column(String, default="Teacher")
  is_active = Column(Boolean, default=True)
  is_locked = Column(Boolean, default=False)
  last_login = Column(DateTime(timezone=True), nullable=True)
  created_at = Column(DateTime(timezone=True), server_default=func.now())
  updated_at = Column(DateTime(timezone=True), onupdate=func.now())