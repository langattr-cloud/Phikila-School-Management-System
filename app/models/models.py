from app.core.database import Base
from sqlalchemy import Column, Integer, String

class WorkingDay(Base):
    _tablename_ = "working_days"
    id = Column(Integer, primary_key=True, index=True)
    day_name = Column(String, nullable=False) # e.g., "Monday"
