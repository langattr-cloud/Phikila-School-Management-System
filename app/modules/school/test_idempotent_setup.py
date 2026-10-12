from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.modules.school import models, schemas
from app.modules.school.services import SchoolService


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


def test_repeated_setup_reuses_existing_profile_without_overwriting_it():
    db = _session()
    service = SchoolService(db)

    original = service.create_school_profile(
        41, schemas.SchoolCreate(name="North School", code="NORTH")
    )
    repeated = service.create_school_profile(
        41, schemas.SchoolCreate(name="Changed Name", code="CHANGED")
    )

    assert repeated.id == original.id == 41
    assert repeated.name == "North School"
    assert repeated.code == "NORTH"
    assert db.query(models.SchoolInfo).filter_by(id=41).count() == 1
    assert db.query(models.SchoolSettings).filter_by(school_id=41).count() == 1
    assert db.query(models.SchoolBranding).filter_by(school_id=41).count() == 1
    assert db.query(models.SchoolContact).filter_by(school_id=41).count() == 1
    db.close()


def test_setup_still_rejects_a_code_owned_by_a_different_school():
    db = _session()
    service = SchoolService(db)
    service.create_school_profile(
        41, schemas.SchoolCreate(name="North School", code="SHARED")
    )

    try:
        service.create_school_profile(
            87, schemas.SchoolCreate(name="South School", code="SHARED")
        )
    except HTTPException as exc:
        assert exc.status_code == 409
    else:
        raise AssertionError("A school code conflict should still be rejected")

    assert db.query(models.SchoolInfo).filter_by(id=87).count() == 0
    db.close()
