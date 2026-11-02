from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import app
from app.modules.library.router import (
    ACTIONS,
    MOVEMENT_ROLES,
    librarian_access,
    library_access,
    router as library_router,
)
from app.modules.platform.authz import Identity
from app.modules.platform.entitlements import TtSchoolModuleEntitlement
from app.modules.platform.tenancy import TtSchool


def identity(memberships, *, is_super_admin=False):
    return Identity(
        user_id="user-1",
        email="user@example.test",
        is_super_admin=is_super_admin,
        memberships=memberships,
    )


def test_library_requires_explicit_school_selection():
    with pytest.raises(HTTPException) as exc:
        library_access(identity=identity({7: "admin"}), school_header=None)
    assert exc.value.status_code == 400


def test_library_selection_must_be_an_existing_membership():
    with pytest.raises(HTTPException) as exc:
        library_access(identity=identity({7: "admin"}), school_header="8")
    assert exc.value.status_code == 403


def test_library_rejects_invalid_school_header():
    with pytest.raises(HTTPException) as exc:
        library_access(identity=identity({7: "admin"}), school_header="not-a-school")
    assert exc.value.status_code == 400


def test_platform_admin_can_access_active_school_when_library_is_enabled():
    principal = identity({}, is_super_admin=True)
    assert librarian_access(identity=principal, db=_DB(), school_header="7") == (7, "super_admin")


def test_platform_admin_still_requires_library_module_entitlement():
    principal = identity({}, is_super_admin=True)
    with pytest.raises(HTTPException) as exc:
        librarian_access(identity=principal, db=_DB(library_enabled=False), school_header="7")
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "module_not_enabled"


def test_multi_school_account_must_select_the_school():
    principal = identity({7: "admin", 8: "librarian"})
    db = _DB()
    assert library_access(identity=principal, db=db, school_header="8") == (8, "librarian")
    assert library_access(identity=principal, db=db, school_header="7") == (7, "admin")


def test_teacher_can_read_library_directory_but_not_librarian_catalogue():
    principal = identity({7: "teacher"})
    db = _DB()
    assert library_access(identity=principal, db=db, school_header="7") == (7, "teacher")
    with pytest.raises(HTTPException) as exc:
        librarian_access(identity=principal, db=db, school_header="7")
    assert exc.value.status_code == 403


def test_librarian_can_manage_library_but_has_no_implicit_other_school_access():
    principal = identity({7: "librarian"})
    assert librarian_access(identity=principal, db=_DB(), school_header="7") == (7, "librarian")
    with pytest.raises(HTTPException) as exc:
        librarian_access(identity=principal, school_header="8")
    assert exc.value.status_code == 403


def test_movement_role_matrix_is_explicit_and_complete():
    assert ACTIONS == {
        "issue_to_teacher", "issue_to_student", "student_return_to_teacher",
        "teacher_return_to_library", "mark_lost", "reconcile_copy",
        "exclude_before_issue", "restore_excluded_copy",
    }
    assert MOVEMENT_ROLES["issue_to_teacher"] == {"admin", "super_admin", "librarian"}
    assert MOVEMENT_ROLES["issue_to_student"] == {"admin", "super_admin", "teacher"}
    assert MOVEMENT_ROLES["mark_lost"] == {"admin", "super_admin", "librarian", "teacher"}


def test_render_app_registers_library_endpoints():
    paths = {route.path for route in app.routes}
    assert "/api/v1/library/books" in paths
    assert "/api/v1/library/copies" in paths
    assert "/api/v1/library/copies/{copy_id}/movements" in paths
    assert "/api/v1/library/teacher-directory" in paths


def test_library_requires_super_admin_module_entitlement():
    principal = identity({7: "admin"})
    with pytest.raises(HTTPException) as exc:
        library_access(identity=principal, db=_DB(library_enabled=False), school_header="7")
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "module_not_enabled"


def test_library_rejects_inactive_school_even_with_entitlement():
    principal = identity({7: "admin"})
    with pytest.raises(HTTPException) as exc:
        library_access(identity=principal, db=_DB(school_status="inactive"), school_header="7")
    assert exc.value.status_code == 403


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.rows[0] if self.rows else None

    def all(self):
        return self.rows


class _DB:
    def __init__(self, *, library_enabled=True, school_status="active"):
        self.library_enabled = library_enabled
        self.school_status = school_status

    def query(self, model):
        if model is TtSchool:
            return _Query([SimpleNamespace(id=7, status=self.school_status)])
        if model is TtSchoolModuleEntitlement:
            rows = [SimpleNamespace(module_key="library", enabled=True)] if self.library_enabled else []
            return _Query(rows)
        raise AssertionError(f"Unexpected model queried: {model}")
