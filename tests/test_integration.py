"""Integration tests that spin up a PostgreSQL testcontainer."""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer


pytestmark = pytest.mark.skipif(
    not os.environ.get("PG_TEST"),
    reason="Set PG_TEST=1 to run integration tests with a real PostgreSQL container",
)


@pytest.fixture(scope="module")
def pg_engine():
    """Start a PostgreSQL container and yield a SQLAlchemy engine."""
    with PostgresContainer("postgres:16-alpine") as pg:
        pg_url = pg.get_connection_url()
        engine = create_engine(pg_url, pool_pre_ping=True)
        yield engine
        engine.dispose()


@pytest.fixture(scope="module")
def pg_session(pg_engine):
    """Create all tables in the container and yield a session."""
    from app.core.database import Base

    Base.metadata.create_all(bind=pg_engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=pg_engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=pg_engine)


def test_pg_schema_introspection(pg_session):
    """Verify the DB reports the expected tables after metadata.create_all."""
    result = pg_session.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))
    tables = {row[0] for row in result}
    for expected in {"users", "school_profiles", "academic_years", "working_days"}:
        assert expected in tables, f"Missing table: {expected}"


def test_pg_roundtrip(pg_session):
    """Basic insert + select roundtrip to validate the SQLAlchemy models work against PG."""
    result = pg_session.execute(text("INSERT INTO working_days (day_name) VALUES ('Testday') RETURNING id"))
    new_id = result.scalar()
    pg_session.commit()
    row = pg_session.execute(text("SELECT day_name FROM working_days WHERE id = :id"), {"id": new_id})
    assert row.scalar() == "Testday"
