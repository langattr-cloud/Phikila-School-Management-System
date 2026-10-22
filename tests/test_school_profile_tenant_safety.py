"""Regression tests for tenant-safe, idempotent school profile provisioning."""

from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException

from app.modules.school import schemas, services
from app.modules.platform.tenancy import TtSchool


class RegistryQuery:
    def __init__(self, school):
        self.school = school

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.school


def make_service(school_id, registry_school=None, existing_profile=None, code_owner=None):
    db = Mock()
    db.query.return_value = RegistryQuery(registry_school)
    repo = Mock()
    repo.db = db
    repo.get_school.return_value = existing_profile
    repo.get_school_by_code.return_value = code_owner
    with patch.object(services, "SchoolRepository", return_value=repo):
        service = services.SchoolService(db)
    return service, repo, db, school_id


@pytest.mark.parametrize(
    ("school_id", "registry_id", "name", "slug"),
    [
        (3, 3, "Valley View Academy", "valley-view-academy"),
        (27, 27, "North Ridge School", "north-ridge-school"),
        (81, 81, "Coastal Learning Centre", "coastal-learning-centre"),
    ],
)
def test_missing_profile_is_materialized_for_each_authorized_tenant(
    school_id, registry_id, name, slug
):
    registry_school = Mock(id=registry_id, slug=slug)
    registry_school.name = name
    service, repo, db, resolved_id = make_service(
        school_id, registry_school=registry_school
    )
    created = Mock(id=school_id, name=name)
    repo.create_school.return_value = created

    result = service.get_school_profile(resolved_id)

    assert result is created
    db.query.assert_called_once_with(TtSchool)
    repo.get_school.assert_called_once_with(school_id)
    repo.create_school.assert_called_once()
    args = repo.create_school.call_args.args
    assert args[0] == school_id
    assert args[1].name == name
    assert args[1].code == slug.upper()


def test_existing_profile_is_returned_without_overwriting_saved_details():
    existing = Mock(id=27, name="Saved official name", code="NRS-27")
    service, repo, _db, school_id = make_service(
        27, existing_profile=existing
    )

    result = service.get_school_profile(school_id)

    assert result is existing
    repo.create_school.assert_not_called()


def test_create_retry_reuses_existing_profile_without_overwriting_it():
    existing = Mock(id=27, name="Saved official name", code="NRS-27")
    service, repo, _db, school_id = make_service(
        27, existing_profile=existing
    )
    payload = schemas.SchoolCreate(name="New form input", code="NEW-CODE")

    result = service.create_school_profile(school_id, payload)

    assert result is existing
    repo.create_school.assert_not_called()


def test_missing_registry_school_returns_not_found_instead_of_creating_orphan():
    service, repo, _db, school_id = make_service(999, registry_school=None)

    with pytest.raises(HTTPException) as exc:
        service.get_school_profile(school_id)

    assert exc.value.status_code == 404
    repo.create_school.assert_not_called()


def test_duplicate_slug_code_does_not_claim_another_schools_profile():
    registry_school = Mock(id=27, slug="shared-code")
    registry_school.name = "North Ridge School"
    other_school_profile = Mock(id=3, code="SHARED-CODE")
    service, repo, _db, school_id = make_service(
        27, registry_school=registry_school, code_owner=other_school_profile
    )
    repo.create_school.return_value = Mock(id=27)

    service.get_school_profile(school_id)

    args = repo.create_school.call_args.args
    assert args[0] == 27
    assert args[1].code == "SCHOOL-27"
