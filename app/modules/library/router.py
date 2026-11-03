"""School-scoped Library API backed by the existing physical-copy custody ledger.

The deployed frontend is served by the FastAPI service (Vercel rewrites /api to
Render), so this router is the production API surface. Every school request is
resolved from verified membership and the Library entitlement; request bodies
cannot choose a school.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.platform.authz import Identity, require_super_admin, resolve_identity
from app.modules.platform.module_access import module_enabled
from app.modules.platform.tenancy import TtMembership, TtSchool

router = APIRouter()


@dataclass
class LibraryAccess:
    school_id: int
    role: str
    user_id: str
    teacher_id: int | None
    is_super_admin: bool


def library_access(
    request: Request,
    identity: Identity = Depends(resolve_identity),
    db: Session = Depends(get_db),
) -> LibraryAccess:
    """Resolve exactly one authorized school; fail closed for ambiguous tenants."""
    requested = request.headers.get("X-School-Id")
    if requested:
        try:
            school_id = int(requested)
        except (TypeError, ValueError):
            raise HTTPException(400, "Invalid X-School-Id header.")
        if school_id <= 0 or (not identity.is_super_admin and not identity.can_access_school(school_id)):
            raise HTTPException(403, "You do not have access to this school.")
    else:
        if len(identity.school_ids) != 1:
            if not identity.school_ids:
                raise HTTPException(403, "An active school membership is required for Library access.")
            raise HTTPException(400, "X-School-Id is required when your account belongs to multiple schools.")
        school_id = identity.school_ids[0]

    role = str(identity.role_in(school_id) or "").lower()
    allowed = {"admin", "super_admin", "librarian", "teacher"}
    if not identity.is_super_admin and role not in allowed:
        raise HTTPException(403, "An authorized school Library role is required.")

    school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
    if school is None or str(school.status).lower() not in {"active", "enabled"}:
        raise HTTPException(403, "This school is not active.")

    if not module_enabled(db, school_id, "library"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail={"code": "module_not_enabled", "module": "library",
                    "message": "Library is not enabled for this school. Contact your platform administrator."},
        )

    membership = (
        db.query(TtMembership)
        .filter(
            TtMembership.user_id == identity.user_id,
            TtMembership.school_id == school_id,
            TtMembership.is_active.is_(True),
        )
        .first()
    )
    return LibraryAccess(
        school_id=school_id,
        role=role,
        user_id=identity.user_id,
        teacher_id=membership.teacher_id if membership else None,
        is_super_admin=identity.is_super_admin,
    )


def _require_roles(access: LibraryAccess, *roles: str) -> None:
    if not access.is_super_admin and access.role not in roles:
        raise HTTPException(403, "You do not have permission to perform this Library action.")


def _dict(row: Any) -> dict[str, Any]:
    result = dict(row)
    for key, value in tuple(result.items()):
        if hasattr(value, "isoformat"):
            result[key] = value.isoformat()
        elif isinstance(value, UUID):
            result[key] = str(value)
    return result


class MovementRequest(BaseModel):
    action: str
    to_holder_id: int | None = None
    to_holder_name: str | None = None
    to_holder_type: str | None = None
    condition: str = "good"
    due_date: date | None = None
    notes: str | None = None


@router.get("/available-schools")
def available_library_schools(
    identity: Identity = Depends(resolve_identity),
    db: Session = Depends(get_db),
):
    """Return only active schools whose Library entitlement is explicitly enabled."""
    if identity.is_super_admin:
        rows = db.execute(text("""
            SELECT s.id, s.name, 'super_admin' AS role
            FROM tt_schools s
            JOIN tt_school_module_entitlements e
              ON e.school_id = s.id
             AND e.module_key = 'library'
             AND e.enabled IS TRUE
            WHERE lower(s.status) IN ('active', 'enabled')
            ORDER BY s.name
        """)).mappings().all()
    else:
        if not identity.school_ids:
            return []
        rows = db.execute(text("""
            SELECT s.id, s.name, m.role
            FROM tt_memberships m
            JOIN tt_schools s ON s.id = m.school_id
            JOIN tt_school_module_entitlements e
              ON e.school_id = s.id
             AND e.module_key = 'library'
             AND e.enabled IS TRUE
            WHERE m.user_id = :user_id
              AND m.is_active IS TRUE
              AND lower(m.role) IN ('admin', 'super_admin', 'librarian', 'teacher')
              AND lower(s.status) IN ('active', 'enabled')
            ORDER BY s.name
        """), {"user_id": identity.user_id}).mappings().all()
    return [_dict(row) for row in rows]


@router.get("/teacher-directory")
def library_teacher_directory(
    access: LibraryAccess = Depends(library_access),
    db: Session = Depends(get_db),
):
    _require_roles(access, "admin", "super_admin", "librarian")
    rows = db.execute(text("""
        SELECT DISTINCT
               t.id,
               COALESCE(NULLIF(trim(t.name), ''), NULLIF(trim(concat_ws(' ', t.first_name, t.last_name)), '')) AS name,
               t.first_name,
               t.last_name,
               t.staff_number
        FROM teachers t
        JOIN tt_memberships m ON m.teacher_id = t.id
        WHERE m.school_id = :school_id
          AND m.is_active IS TRUE
          AND lower(m.role) = 'teacher'
        ORDER BY name, t.id
    """), {"school_id": access.school_id}).mappings().all()
    return [_dict(row) for row in rows]


@router.get("/platform-overview")
def platform_library_overview(
    identity: Identity = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Platform-level read-only overview; does not require a school selection."""
    rows = db.execute(text("""
        SELECT s.id AS school_id, s.name AS school_name,
               COALESCE(b.total_titles, 0) AS total_titles,
               COALESCE(c.total_copies, 0) AS total_copies,
               COALESCE(c.available_copies, 0) AS available_copies,
               COALESCE(c.with_teachers, 0) AS with_teachers,
               COALESCE(c.with_students, 0) AS with_students,
               COALESCE(c.lost_copies, 0) AS lost_copies
        FROM tt_schools s
        JOIN tt_school_module_entitlements e
          ON e.school_id = s.id AND e.module_key = 'library' AND e.enabled IS TRUE
        LEFT JOIN (
          SELECT school_id, COUNT(*) AS total_titles
          FROM library_books GROUP BY school_id
        ) b ON b.school_id = s.id
        LEFT JOIN (
          SELECT school_id, COUNT(*) AS total_copies,
                 COUNT(*) FILTER (WHERE status = 'available') AS available_copies,
                 COUNT(*) FILTER (WHERE current_holder_type = 'teacher') AS with_teachers,
                 COUNT(*) FILTER (WHERE current_holder_type = 'student') AS with_students,
                 COUNT(*) FILTER (WHERE status = 'lost') AS lost_copies
          FROM library_book_copies GROUP BY school_id
        ) c ON c.school_id = s.id
        WHERE lower(s.status) IN ('active', 'enabled')
        ORDER BY s.name
    """)).mappings().all()
    return {"schools": [_dict(row) for row in rows], "school_count": len(rows)}


@router.get("/books")
def list_books(access: LibraryAccess = Depends(library_access), db: Session = Depends(get_db)):
    _require_roles(access, "admin", "super_admin", "librarian")
    rows = db.execute(text("""
        SELECT id, title, author, isbn, grade, subject, total_copies,
               available_copies, status
        FROM library_books
        WHERE school_id = :school_id
        ORDER BY title, id
    """), {"school_id": access.school_id}).mappings().all()
    return [_dict(row) for row in rows]


@router.get("/books/stats")
def library_stats(access: LibraryAccess = Depends(library_access), db: Session = Depends(get_db)):
    _require_roles(access, "admin", "super_admin", "librarian")
    row = db.execute(text("""
        SELECT
          (SELECT COUNT(*) FROM library_books WHERE school_id = :school_id) AS total_titles,
          COUNT(*) AS total_copies,
          COUNT(*) FILTER (WHERE status = 'available') AS available_copies,
          COUNT(*) FILTER (WHERE current_holder_type = 'teacher') AS with_teachers,
          COUNT(*) FILTER (WHERE current_holder_type = 'student') AS with_students,
          COUNT(*) FILTER (WHERE status = 'lost') AS lost_copies,
          COUNT(*) FILTER (WHERE status = 'excluded') AS excluded_copies,
          COUNT(*) FILTER (WHERE status = 'unreconciled') AS unreconciled_copies
        FROM library_book_copies WHERE school_id = :school_id
    """), {"school_id": access.school_id}).mappings().one()
    result = _dict(row)
    result["active_loans"] = db.execute(text("""
        SELECT COUNT(*) FROM library_loans
        WHERE school_id = :school_id AND status IN ('borrowed','overdue','on_loan')
    """), {"school_id": access.school_id}).scalar_one()
    return result


@router.get("/copies")
def list_copies(
    book_id: int | None = None,
    holder_type: str | None = None,
    holder_id: int | None = None,
    status_filter: str | None = None,
    access: LibraryAccess = Depends(library_access),
    db: Session = Depends(get_db),
):
    _require_roles(access, "admin", "super_admin", "librarian")
    filters = ["c.school_id = :school_id"]
    params: dict[str, Any] = {"school_id": access.school_id}
    if book_id is not None:
        filters.append("c.book_id = :book_id"); params["book_id"] = book_id
    if holder_type:
        filters.append("c.current_holder_type = :holder_type"); params["holder_type"] = holder_type
    if holder_id is not None:
        filters.append("c.current_holder_id = :holder_id"); params["holder_id"] = holder_id
    if status_filter:
        filters.append("c.status = :copy_status"); params["copy_status"] = status_filter
    rows = db.execute(text(f"""
        SELECT c.id, c.book_id, c.copy_number, c.status, c.current_holder_type,
               c.current_holder_id, c.current_holder_name, c.condition, c.due_date,
               json_build_object('id', b.id, 'title', b.title, 'author', b.author, 'isbn', b.isbn) AS book
        FROM library_book_copies c
        JOIN library_books b ON b.id = c.book_id AND b.school_id = c.school_id
        WHERE {' AND '.join(filters)}
        ORDER BY b.title, c.copy_number
    """), params).mappings().all()
    return [_dict(row) for row in rows]


@router.get("/student-allocations")
def student_allocations(access: LibraryAccess = Depends(library_access), db: Session = Depends(get_db)):
    _require_roles(access, "admin", "super_admin", "librarian")
    rows = db.execute(text("""
        SELECT a.copy_id::text AS copy_id, a.copy_number, a.book_title,
               a.accountable_teacher_name,
               COALESCE(NULLIF(trim(concat_ws(' ', s.first_name, s.middle_name, s.last_name)), ''),
                        a.student_name, 'Unknown student') AS student_name,
               s.admission_number AS student_admission_number,
               COALESCE(sc.display_name, sc.name,
                        NULLIF(concat_ws(' ', g.name, st.name), '')) AS student_class,
               a.student_issue_at, a.status
        FROM library_teacher_accountability a
        LEFT JOIN students s ON s.id = a.student_id
        LEFT JOIN students_v2 sv ON sv.admission_number = s.admission_number
                                 AND sv.school_id = :school_id
        LEFT JOIN LATERAL (
          SELECT e.school_class_id, e.class_id, e.grade_id, e.stream_id
          FROM student_enrollments e
          WHERE e.student_id = sv.id AND e.school_id = :school_id
            AND lower(e.status) IN ('enrolled', 'active')
          ORDER BY e.created_at DESC, e.id DESC LIMIT 1
        ) en ON TRUE
        LEFT JOIN school_classes sc ON sc.id = COALESCE(en.school_class_id, en.class_id)
                                  AND sc.school_id = :school_id
        LEFT JOIN grades g ON g.id = en.grade_id AND g.school_id = :school_id
        LEFT JOIN streams st ON st.id = en.stream_id AND st.school_id = :school_id
        WHERE a.school_id = :school_id
          AND a.current_holder_type = 'student' AND a.status <> 'lost'
        ORDER BY a.book_title, a.copy_number
    """), {"school_id": access.school_id}).mappings().all()
    return {"items": [_dict(row) for row in rows]}


@router.get("/copies/{copy_id}/movements")
def copy_movements(
    copy_id: UUID,
    access: LibraryAccess = Depends(library_access),
    db: Session = Depends(get_db),
):
    _require_roles(access, "admin", "super_admin", "librarian")
    rows = db.execute(text("""
        SELECT m.id, m.copy_id, m.action, m.from_holder_type, m.from_holder_id,
               m.from_holder_name, m.to_holder_type, m.to_holder_id, m.to_holder_name,
               m.condition, m.due_date, m.notes, m.performed_by, m.performed_at,
               m.transaction_ref
        FROM library_copy_movements m
        JOIN library_book_copies c ON c.id = m.copy_id
        WHERE m.copy_id = :copy_id AND m.school_id = :school_id
          AND c.school_id = :school_id
        ORDER BY m.performed_at DESC, m.id DESC
    """), {"copy_id": str(copy_id), "school_id": access.school_id}).mappings().all()
    return [_dict(row) for row in rows]


@router.post("/copies/{copy_id}/movements")
def create_copy_movement(
    copy_id: UUID,
    payload: MovementRequest,
    access: LibraryAccess = Depends(library_access),
    db: Session = Depends(get_db),
):
    action = payload.action.strip()
    supported = {
        "issue_to_teacher", "issue_to_student", "student_return_to_teacher",
        "teacher_return_to_library", "mark_lost", "reconcile_copy",
        "exclude_before_issue", "restore_excluded_copy",
    }
    if action not in supported:
        raise HTTPException(400, "Unsupported movement action.")
    if payload.condition not in {"good", "damaged", "lost"}:
        raise HTTPException(400, "Condition must be good, damaged, or lost.")

    teacher_actions = {"issue_to_teacher", "teacher_return_to_library", "reconcile_copy",
                       "exclude_before_issue", "restore_excluded_copy", "mark_lost"}
    student_actions = {"issue_to_student", "student_return_to_teacher"}
    if action in teacher_actions:
        _require_roles(access, "admin", "super_admin", "librarian")
    elif action in student_actions:
        _require_roles(access, "admin", "super_admin", "librarian", "teacher")

    copy = db.execute(text("""
        SELECT id, book_id, status, current_holder_type, current_holder_id,
               current_holder_name, condition
        FROM library_book_copies
        WHERE id = :copy_id AND school_id = :school_id
    """), {"copy_id": str(copy_id), "school_id": access.school_id}).mappings().first()
    if copy is None:
        raise HTTPException(404, "Book copy not found for this school.")

    if access.role == "teacher" and not access.is_super_admin:
        if not access.teacher_id:
            raise HTTPException(403, "Your membership is not linked to a teacher record.")
        if action == "issue_to_student":
            if copy["current_holder_type"] != "teacher" or int(copy["current_holder_id"] or 0) != access.teacher_id:
                raise HTTPException(403, "Teachers may only issue copies held in their own custody.")
        elif action == "student_return_to_teacher":
            if payload.to_holder_id != access.teacher_id:
                raise HTTPException(403, "A student must return the copy to the teacher who issued it.")
            issuing_teacher = db.execute(text("""
                SELECT from_holder_id FROM library_copy_movements
                WHERE copy_id = :copy_id AND school_id = :school_id
                  AND action = 'issue_to_student'
                ORDER BY performed_at DESC, id DESC LIMIT 1
            """), {"copy_id": str(copy_id), "school_id": access.school_id}).scalar()
            if issuing_teacher != access.teacher_id:
                raise HTTPException(403, "Teachers may only accept returns for copies they issued.")
        else:
            raise HTTPException(403, "Teachers may only issue copies to students or accept student returns.")

    if action == "issue_to_teacher":
        # Timetable teachers are stored as names in the saved timetable
        # workspace. A school teacher row/membership may not exist yet, so
        # librarian issue accepts a verified timetable name without an ID.
        if not (payload.to_holder_name or "").strip():
            raise HTTPException(400, "Select a teacher from the Timetable list.")
    elif action == "issue_to_student":
        if payload.to_holder_id is None or not (payload.to_holder_name or "").strip():
            raise HTTPException(400, "Select an active student record.")
    elif action == "student_return_to_teacher":
        if not (payload.to_holder_name or "").strip():
            raise HTTPException(400, "Select the accountable teacher for this return.")
    if action in {"issue_to_teacher", "reconcile_copy"} and payload.to_holder_id is not None:
        teacher = db.execute(text("""
            SELECT id FROM tt_memberships
            WHERE school_id = :school_id AND teacher_id = :teacher_id
              AND is_active IS TRUE AND lower(role) = 'teacher'
            LIMIT 1
        """), {"school_id": access.school_id, "teacher_id": payload.to_holder_id}).first()
        if teacher is None:
            raise HTTPException(404, "Teacher is not linked to an active membership in this school.")

    if action == "issue_to_student":
        student = db.execute(text("""
            SELECT s.id, concat_ws(' ', s.first_name, s.middle_name, s.last_name) AS full_name
            FROM students s
            JOIN students_v2 sv ON sv.admission_number = s.admission_number
                               AND sv.school_id = :school_id
            JOIN student_enrollments e ON e.student_id = sv.id
                                      AND e.school_id = :school_id
                                      AND lower(e.status) IN ('enrolled', 'active')
            WHERE s.id = :student_id
              AND lower(COALESCE(s.status, 'active')) NOT IN ('inactive','withdrawn','archived')
            ORDER BY e.created_at DESC LIMIT 1
        """), {"school_id": access.school_id, "student_id": payload.to_holder_id}).mappings().first()
        if student is None:
            raise HTTPException(422, "Select an active student enrolled in this school.")
        if (payload.to_holder_name or "").strip() != student["full_name"]:
            raise HTTPException(422, "Student name does not match the selected Student module record.")

    if action == "issue_to_student" and access.role == "teacher" and not access.is_super_admin:
        if copy["current_holder_type"] != "teacher" or int(copy["current_holder_id"] or 0) != access.teacher_id:
            raise HTTPException(403, "You may only issue copies held in your own custody.")
    if action == "student_return_to_teacher" and access.role == "teacher" and not access.is_super_admin:
        if payload.to_holder_id != access.teacher_id:
            raise HTTPException(403, "A student must return the copy to the teacher who issued it.")

    try:
        if action in {"exclude_before_issue", "restore_excluded_copy"}:
            if not (payload.notes or "").strip():
                raise HTTPException(400, "A reason is required for exclusion or restoration.")
            result = db.execute(text("""
                SELECT (public.set_library_copy_preissue_exclusion(
                    :copy_id, :action, :reason, :performed_by
                )).* 
            """), {
                "copy_id": str(copy_id), "action": action,
                "reason": payload.notes.strip(), "performed_by": access.user_id,
            }).mappings().first()
        else:
            result = db.execute(text("""
                SELECT (public.move_library_book_copy(
                    :copy_id, :action, :to_holder_id, :to_holder_name,
                    :condition, :due_date, :notes, :performed_by, :reconcile_holder_type
                )).*
            """), {
                "copy_id": str(copy_id), "action": action,
                "to_holder_id": payload.to_holder_id,
                "to_holder_name": payload.to_holder_name,
                "condition": payload.condition,
                "due_date": payload.due_date,
                "notes": payload.notes,
                "performed_by": access.user_id,
                "reconcile_holder_type": payload.to_holder_type,
            }).mappings().first()
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        message = str(getattr(getattr(exc, "orig", None), "diag", None).message_primary
                      if getattr(getattr(exc, "orig", None), "diag", None) else exc)
        if "Only an available library copy" in message or "Only a teacher-held copy" in message or "Only a student-held copy" in message:
            raise HTTPException(409, message) from exc
        if "Book copy not found" in message:
            raise HTTPException(404, message) from exc
        if "Invalid movement" in message or "A reason is required" in message:
            raise HTTPException(400, message) from exc
        raise HTTPException(500, "The Library movement could not be recorded.") from exc

    return _dict(result) if result else {"ok": True, "copy_id": str(copy_id)}
