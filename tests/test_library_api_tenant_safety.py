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
