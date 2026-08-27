import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings


engine_options: dict = {"pool_pre_ping": True}

if settings.database_url.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    # Render runs the API and the solver worker in separate processes, and the
    # solver can briefly create an isolated child process. Supabase's session
    # pooler has a small per-project connection limit, so NullPool is unsafe:
    # every polling request opens a new database connection and concurrent
    # browser polling can exhaust the pooler before the solver gets a connection.
    # Keep a small bounded pool in each process instead.
    engine_options.update(
        {
            "pool_size": int(os.getenv("DB_POOL_SIZE", "3")),
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
