import pytest
from datetime import time

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.modules.scheduling import models as m
from app.modules.scheduling import router
from app.modules.scheduling import schemas as s
from app.modules.scheduling.tenancy import Principal
from app.core.database import Base


@pytest.fixture()
def room_db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [m.TtCalendarConfig.__table__, m.TtDay.__table__, m.TtPeriod.__table__, m.TtRoom.__table__, m.TtAuditEntry.__table__]
    Base.metadata.create_all(engine, tables=tables)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def seed_calendar(db_session, school_id=1):
    db_session.add_all([
        m.TtDay(school_id=school_id, index=0, day_of_week=1, name="Monday"),
        m.TtDay(school_id=school_id, index=1, day_of_week=2, name="Tuesday"),
        m.TtPeriod(
            school_id=school_id, index=0, name="P1", short_form="P1",
            start_time=time(8, 0), end_time=time(8, 40),
        ),
        m.TtPeriod(
            school_id=school_id, index=1, name="P2", short_form="P2",
            start_time=time(8, 40), end_time=time(9, 20),
        ),
    ])
    db_session.commit()


def validate(db_session, value):
    router._validate_unavailable_slots(db_session, 1, value)


def test_valid_classroom_availability_is_accepted(room_db_session):
    seed_calendar(room_db_session)
    validate(room_db_session, {"0": [0, 1], "1": [1]})


def test_unknown_day_index_is_rejected(room_db_session):
    seed_calendar(room_db_session)
    with pytest.raises(HTTPException) as exc:
        validate(room_db_session, {"7": [0]})
    assert exc.value.status_code == 400
    assert "unknown day index" in str(exc.value.detail)


def test_unknown_period_index_is_rejected(room_db_session):
    seed_calendar(room_db_session)
    with pytest.raises(HTTPException) as exc:
        validate(room_db_session, {"0": [99]})
    assert exc.value.status_code == 400
    assert "unknown period slot" in str(exc.value.detail)


def test_malformed_availability_is_rejected_by_room_schema():
    with pytest.raises(ValueError):
        s.RoomIn(name="Room A", code="ROOM-A", unavailable={"0": ["not-a-period"]})


def test_updating_existing_classroom_without_availability_keeps_existing_value(room_db_session):
    seed_calendar(room_db_session)
    room = m.TtRoom(school_id=1, name="Room A", code="ROOM-A", unavailable={"0": [1]})
    room_db_session.add(room)
    room_db_session.commit()
    room_db_session.refresh(room)

    route = next(
        route for route in router.router.routes
        if getattr(route, "path", "") == "/rooms/{ident}"
        and "PUT" in getattr(route, "methods", set())
    )
    principal = Principal(
        user_id="test-user", email="test@example.com", school_id=1, role="admin"
    )

    route.endpoint(
        room.id,
        s.RoomIn(
            name="Room A Updated",
            code="ROOM-A",
            capacity=40,
            room_type="classroom",
            is_accessible=True,
            is_active=True,
        ),
        room_db_session,
        principal,
    )

    room_db_session.refresh(room)
    assert room.name == "Room A Updated"
    assert room.unavailable == {"0": [1]}
