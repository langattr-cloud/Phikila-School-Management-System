from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings


engine_options: dict = {"pool_pre_ping": True}

if settings.database_url.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    # A serverless function must not retain a pool of scarce Supabase connections.
    # Use Supabase's transaction pooler URL in DATABASE_URL for production.
    engine_options["poolclass"] = NullPool
    engine_options["connect_args"] = {"connect_timeout": 10}

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
