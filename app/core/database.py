import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


engine_options: dict = {"pool_pre_ping": True}

if settings.database_url.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    # Keep the pool bounded, but allow the request path and the timetable
    # solver worker to use separate connections. The previous default of one
    # connection caused QueuePool timeouts when the UI polled solver status
    # while the solver was reading/writing timetable data.
    engine_options.update(
        {
            "pool_size": int(os.getenv("DB_POOL_SIZE", "2")),
            "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "1")),
            "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "15")),
            "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "300")),
            "connect_args": {"connect_timeout": 10},
        }
    )

engine = create_engine(settings.database_url, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Provide one database session for the lifetime of a request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
