"""Library API release guards: tenant resolution and platform-only access."""
from pathlib import Path

from app.modules.library.router import router as library_router


ROOT = Path(__file__).resolve().parents[1]


def test_library_router_is_registered_in_production_fastapi_app():
    main = (ROOT / "app" / "main.py").read_text()
    assert "from app.modules.library.router import router as library_router" in main
    assert 'app.include_router(library_router, prefix="/api/v1/library"' in main


def test_school_library_access_requires_active_membership_and_explicit_entitlement():
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


def test_library_timetable_teacher_can_be_selected_without_directory_id():
    page = (ROOT / "frontend" / "src" / "pages" / "LibraryPage.tsx").read_text()
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    assert "apiFetch<Timetable>('/api/v1/timetable/workspace')" in page
    assert "selectedTeacher.id == null" not in page
    assert "Select a teacher from the Timetable list." in source
    assert 'if action == "issue_to_teacher":' in source


def test_library_route_is_available_to_super_admin_and_listed_in_navigation():
    app = (ROOT / "frontend" / "src" / "App.tsx").read_text()
    shell = (ROOT / "frontend" / "src" / "components" / "AppShell.tsx").read_text()
    assert "case '/library': return <LibraryPage />" in app
    assert "path.startsWith('/library') ? 'library'" in app
    assert "!platformSession.is_super_admin" in app
    assert "{ to: '/library', label: 'Library'" in shell
    assert "return isSuperAdmin || !enabledModules" in shell


def test_library_workspace_endpoints_exist_for_frontend_requests():
    paths = {route.path for route in library_router.routes}
    assert "/available-schools" in paths
    assert "/teacher-directory" in paths
    assert "/platform-overview" in paths


def test_super_admin_school_access_uses_entitlement_without_membership_requirement():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    assert "not identity.is_super_admin and not identity.can_access_school(school_id)" in source
    assert 'TtSchoolModuleEntitlement.module_key == "library"' in source
    assert "TtSchoolModuleEntitlement.enabled.is_(True)" in source


def test_library_teacher_directory_uses_real_teacher_columns_and_school_memberships():
    source = (ROOT / "app" / "modules" / "library" / "router.py").read_text()
    assert "concat_ws(' ', t.first_name, t.last_name) AS name" in source
    assert "m.school_id = :school_id" in source
    assert "m.is_active IS TRUE" in source
    assert "lower(m.role) = 'teacher'" in source


def test_library_page_exposes_school_selection_for_super_admin():
    page = (ROOT / "frontend" / "src" / "pages" / "LibraryPage.tsx").read_text()
    assert 'aria-label="Select Library school"' in page
    assert "schoolChoices.map(school" in page
    assert "Choose any school enabled for Library in School Access." in page
