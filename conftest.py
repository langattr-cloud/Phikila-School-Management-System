"""Shared pytest fixtures.

Provides an in-memory SQLite ``db_session`` with the full Phikila schema so
module tests (examinations, finance, …) can run without a database server.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base

# Import model modules so their tables are registered on Base.metadata.
import app.modules.academics.models  # noqa: F401
import app.modules.examinations.models  # noqa: F401
import app.modules.examinations.models_v2  # noqa: F401
import app.modules.finance.models  # noqa: F401
import app.modules.platform.models  # noqa: F401 (shared platform and audit models)
import app.modules.platform.tenancy  # noqa: F401 (school membership models)
import app.modules.students.models_v2  # noqa: F401
import app.modules.teachers.models  # noqa: F401


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
