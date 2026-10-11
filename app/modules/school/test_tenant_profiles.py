from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.modules.school import models, schemas
from app.modules.school.repository import SchoolRepository


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            models.SchoolInfo.__table__,
            models.SchoolSettings.__table__,
            models.SchoolBranding.__table__,
            models.SchoolContact.__table__,
        ],
    )
    return sessionmaker(bind=engine)()


def test_profiles_are_isolated_by_platform_school_id():
    db = _session()
    repo = SchoolRepository(db)
    first = schemas.SchoolCreate(name="North School", code="NORTH")
    second = schemas.SchoolCreate(name="South School", code="SOUTH")

    repo.create_school(41, first)
    repo.create_school(87, second)

    assert repo.get_school(41).name == "North School"
    assert repo.get_school(87).name == "South School"
    assert repo.get_school(999) is None
    assert repo.get_settings(41).school_id == 41
    assert repo.get_branding(87).school_id == 87
    assert repo.get_contact(87).school_id == 87
    db.close()


def test_profile_creation_rolls_back_all_nested_records_on_failure():
    db = _session()
    repo = SchoolRepository(db)
    # A duplicate school code must not leave a partial profile behind.
    repo.create_school(41, schemas.SchoolCreate(name="North School", code="SAME"))
    try:
        repo.create_school(87, schemas.SchoolCreate(name="South School", code="SAME"))
    except Exception:
        pass

    assert repo.get_school(87) is None
    assert repo.get_settings(87) is None
    db.close()
