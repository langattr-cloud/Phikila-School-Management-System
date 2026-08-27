import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


engine_options: dict = {"pool_pre_ping": True}

if settings.database_url.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    # Render runs FastAPI, the polling worker, and isolated solver children.
    # Supabase's session-mode pooler has a hard per-project client cap. Keep
    # every long-lived process to one connection and never create an unbounded
    # overflow pool. Sessions are short-lived and connections are recycled.
    engine_options.update(
        {
            "pool_size": int(os.getenv("DB_POOL_SIZE", "1")),
            "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "0")),
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
