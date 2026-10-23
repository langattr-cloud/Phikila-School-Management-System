"""CRUD and tenant-boundary regression tests for timetable APIs."""
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import create_app
from app.modules.authentication.supabase import get_supabase_claims
from app.modules.platform.tenancy import Principal, require_role
from app.modules.school.models import SchoolInfo
from app.modules.teachers.models import Teacher
from app.modules.subjects.models import Subject
from app.modules.timetabling.models import (
    TimetableProject, TimetablePeriod, TimetableLessonRequirement, TimetableConstraint,
)
from app.modules.timetabling.router import _project, _child, _validate_project_context, _validate_class_context


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=[SchoolInfo.__table__, Teacher.__table__, Subject.__table__, TimetableProject.__table__, TimetablePeriod.__table__, TimetableLessonRequirement.__table__, TimetableConstraint.__table__])
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_project_lookup_hides_other_school_projects(db_session):
    db_session.add(TimetableProject(
        id=10, school_id=2, academic_year_id=1, name="private",
        starts_on=date(2026, 1, 1), ends_on=date(2026, 12, 31), timezone="UTC", state="draft",
    ))
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        _project(db_session, school_id=1, project_id=10)
    assert exc.value.status_code == 404


def test_child_lookup_is_scoped_to_parent_project(db_session):
    db_session.add_all([
        TimetableProject(id=1, school_id=1, academic_year_id=1, name="one",
                         starts_on=date(2026, 1, 1), ends_on=date(2026, 12, 31), timezone="UTC", state="draft"),
        TimetableProject(id=2, school_id=2, academic_year_id=2, name="two",
                         starts_on=date(2026, 1, 1), ends_on=date(2026, 12, 31), timezone="UTC", state="draft"),
        TimetablePeriod(id=22, project_id=2, day_of_week=0, period_number=1,
                        starts_at=time(9), ends_at=time(10), week_pattern="every_week", is_break=False),
    ])
    db_session.commit()
    with pytest.raises(HTTPException) as exc:
        _child(db_session, TimetablePeriod, school_id=1, project_id=1, child_id=22)
    assert exc.value.status_code == 404


def test_academic_year_must_belong_to_callers_school(db_session):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with pytest.raises(HTTPException) as exc:
        _validate_project_context(db, school_id=1, academic_year_id=8)
    assert exc.value.status_code == 422


def test_class_must_belong_to_callers_school_and_year(db_session):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with pytest.raises(HTTPException) as exc:
        _validate_class_context(db, school_id=1, class_id=5, academic_year_id=8)
    assert exc.value.status_code == 422


def test_create_project_uses_authenticated_school_not_payload():
    from app.modules.timetabling.schemas import TimetableProjectCreate
    from app.modules.timetabling.router import create_project
    payload = TimetableProjectCreate(name="Term 1", academic_year_id=4,
                                     starts_on=date(2026,1,1), ends_on=date(2026,12,31))
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id=4)
    db.refresh.side_effect = lambda row: None
    principal = Principal(user_id="user-a", email="a@example.com", school_id=42, role="admin")
    result = create_project(payload, db, principal)
    assert result.school_id == 42
    assert db.add.call_args.args[0].school_id == 42


def test_project_crud_routes_are_registered_and_auth_dependency_present():
    from app.modules.timetabling.router import router
    paths = {(route.path, tuple(sorted(route.methods or []))) for route in router.routes}
    assert ("/api/timetabling/projects", ("GET",)) in paths
    assert ("/api/timetabling/projects", ("POST",)) in paths
    assert ("/api/timetabling/projects/{project_id}", ("PATCH",)) in paths
    assert ("/api/timetabling/projects/{project_id}/periods", ("POST",)) in paths
    assert ("/api/timetabling/projects/{project_id}/requirements", ("POST",)) in paths
    assert ("/api/timetabling/projects/{project_id}/constraints", ("POST",)) in paths
    assert all(route.dependencies for route in router.routes)



def test_timetabling_role_allowlist_denies_student_even_though_role_rank_is_high():
    from app.modules.timetabling.router import require_timetabling_role
    dependency = require_timetabling_role("viewer", "teacher", "scheduler", "admin", "super_admin")
    student = Principal(user_id="student", email=None, school_id=1, role="student")
    with pytest.raises(HTTPException) as exc:
        dependency(principal=student)
    assert exc.value.status_code == 403


def test_timetabling_role_allowlist_accepts_scheduler():
    from app.modules.timetabling.router import require_timetabling_role
    dependency = require_timetabling_role("scheduler", "admin", "super_admin")
    scheduler = Principal(user_id="scheduler", email=None, school_id=1, role="scheduler")
    assert dependency(principal=scheduler) is scheduler


def test_teacher_subject_ownership_rejects_cross_school_subject_using_database_rows(db_session):
    from app.modules.timetabling.router import _validate_teacher_subject_ownership

    db_session.add_all([
        SchoolInfo(id=10, name="School A", code="A"),
        SchoolInfo(id=20, name="School B", code="B"),
    ])
    db_session.flush()
    db_session.add(Subject(id=200, name="Physics", code="PHY", school_id=20))
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        _validate_teacher_subject_ownership(db_session, school_id=10, subject_id=200, teacher_ids=[])
    assert exc.value.status_code == 422
    assert "Subject does not belong to this school" in exc.value.detail


def test_teacher_subject_ownership_rejects_unassigned_legacy_subject_using_database_rows(db_session):
    from app.modules.timetabling.router import _validate_teacher_subject_ownership

    db_session.add(SchoolInfo(id=10, name="School A", code="A"))
    db_session.flush()
    db_session.add(Subject(id=201, name="Unassigned subject", code="UNASSIGNED", school_id=None))
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        _validate_teacher_subject_ownership(db_session, school_id=10, subject_id=201, teacher_ids=[])
    assert exc.value.status_code == 422


def test_teacher_subject_ownership_rejects_cross_school_teacher_using_database_rows(db_session):
    from app.modules.timetabling.router import _validate_teacher_subject_ownership

    db_session.add_all([
        SchoolInfo(id=10, name="School A", code="A"),
        SchoolInfo(id=20, name="School B", code="B"),
    ])
    db_session.flush()
    db_session.add_all([
        Subject(id=202, name="Chemistry", code="CHEM", school_id=10),
        Teacher(id=302, school_id=20),
    ])
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        _validate_teacher_subject_ownership(db_session, school_id=10, subject_id=202, teacher_ids=[302])
    assert exc.value.status_code == 422
    assert "Every teacher must belong to this school" in exc.value.detail


def test_teacher_subject_ownership_accepts_records_assigned_to_same_school(db_session):
    from app.modules.timetabling.router import _validate_teacher_subject_ownership

    db_session.add(SchoolInfo(id=10, name="School A", code="A"))
    db_session.flush()
    db_session.add_all([
        Subject(id=203, name="Biology", code="BIO", school_id=10),
        Teacher(id=303, school_id=10),
    ])
    db_session.commit()

    # No exception means both the subject and every teacher matched school scope.
    _validate_teacher_subject_ownership(db_session, school_id=10, subject_id=203, teacher_ids=[303])
