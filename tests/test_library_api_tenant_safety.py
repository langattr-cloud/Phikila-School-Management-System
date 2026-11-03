"""Library API release guards: tenant resolution and platform-only access."""
from pathlib import Path

from app.modules.library.router import router as library_router


ROOT = Path(__file__).resolve().parents[1]


def test_library_router_is_registered_in_production_fastapi_app():
    main = (ROOT / "app" / "main.py").read_text()
    assert "from app.modules.library.router import router as library_router" in main
    assert 'app.include_router(library_router, prefix="/api/v1/library"' in main


def test_staff_library_access_requires_active_membership_and_explicit_entitlement():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    assert "identity.can_access_school(school_id)" in source
    assert "module_enabled(db, school_id, \"library\")" in source
    assert "X-School-Id is required" in source
    assert "active school membership" in source


def test_platform_overview_is_separate_from_school_context():
    route = next(route for route in library_router.routes if route.path == "/platform-overview")
    dependencies = [dependency.call for dependency in route.dependant.dependencies]
    assert any(getattr(call, "__name__", "") == "require_super_admin" for call in dependencies)
    assert not any(getattr(call, "__name__", "") == "library_access" for call in dependencies)


def test_all_school_inventory_queries_bind_the_resolved_school_id():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    assert 'WHERE school_id = :school_id' in source
    assert 'c.school_id = :school_id' in source
    assert 'm.school_id = :school_id' in source
    assert 'a.school_id = :school_id' in source
    assert 'JOIN library_books b ON b.id = c.book_id AND b.school_id = c.school_id' in source


def test_teacher_custody_and_student_enrollment_are_checked_within_school():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    assert "Teachers may only issue copies held in their own custody." in source
    assert "Teachers may only accept returns for copies they issued." in source
    assert "sv.school_id = :school_id" in source
    assert "e.school_id = :school_id" in source
    assert "Select an active student enrolled in this school." in source


def test_school_id_cannot_be_supplied_in_movement_payload():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    movement = source.split("class MovementRequest", 1)[1].split("@router.", 1)[0]
    assert "school_id" not in movement


def test_super_admin_can_open_entitled_school_without_membership():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    assert "not identity.is_super_admin and not identity.can_access_school(school_id)" in source
    assert "module_enabled(db, school_id, \"library\")" in source


def test_library_school_selector_is_driven_by_explicit_entitlements():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    route = next(route for route in library_router.routes if route.path == "/available-schools")
    dependencies = [dependency.call for dependency in route.dependant.dependencies]
    assert any(getattr(call, "__name__", "") == "resolve_identity" for call in dependencies)
    assert "e.module_key = 'library'" in source
    assert "e.enabled IS TRUE" in source
    assert "m.is_active IS TRUE" in source


def test_librarian_can_issue_to_timetable_teacher_without_directory_membership():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    assert 'if action == "issue_to_teacher":' in source
    assert 'Select a teacher from the Timetable list.' in source
    assert 'if action in {"issue_to_teacher", "reconcile_copy"} and payload.to_holder_id is not None:' in source


def test_timetable_teacher_custody_migration_supports_name_based_holders():
    migration = (ROOT / "workers" / "supabase" / "migrations" / "006_library_timetable_teacher_custody.sql").read_text()
    assert "current_holder_type = 'teacher' AND current_holder_name IS NOT NULL" in migration
    assert "v_to_id:=p_to_holder_id;" in migration
    assert "lower(trim(coalesce(v_issuing_teacher_name,''))) <> lower(trim(p_to_holder_name))" in migration


def test_library_issue_button_does_not_require_teacher_directory_id():
    source = (ROOT / "frontend" / "src" / "pages" / "LibraryPage.tsx").read_text()
    assert "if (!selectedTeacher || !selectedBook || selectedCopyIds.length === 0)" in source
    assert "selectedTeacher.id == null || !selectedBook" not in source
    assert "to_holder_id: selectedTeacher.id," in source
