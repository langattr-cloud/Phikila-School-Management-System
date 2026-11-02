"""School-scoped Library API served by the Render FastAPI application.

All authorization is derived from the verified Supabase identity and active
tt_memberships rows. X-School-Id selects an existing membership; it never
creates or grants school access.
"""
from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.platform.authz import Identity, resolve_identity
from app.modules.platform.entitlements import DEFAULT_ENABLED_MODULES, TtSchoolModuleEntitlement
from app.modules.platform.tenancy import TtSchool

router = APIRouter(prefix="/library", tags=["Library"])
LIBRARIAN_ROLES = {"admin", "super_admin", "librarian"}
ALL_LIBRARY_ROLES = LIBRARIAN_ROLES | {"teacher"}
MOVEMENT_ROLES = {
    "issue_to_teacher": LIBRARIAN_ROLES,
    "issue_to_student": {"admin", "super_admin", "teacher"},
    "student_return_to_teacher": {"admin", "super_admin", "teacher"},
    "teacher_return_to_library": LIBRARIAN_ROLES,
    "mark_lost": ALL_LIBRARY_ROLES,
    "reconcile_copy": LIBRARIAN_ROLES,
    "exclude_before_issue": LIBRARIAN_ROLES,
    "restore_excluded_copy": LIBRARIAN_ROLES,
}
ACTIONS = set(MOVEMENT_ROLES)
CONDITIONS = {"good", "damaged", "lost"}


def _school_access_dependency(allowed_roles: set[str]):
    def dependency(
        identity: Identity = Depends(resolve_identity),
        db: Session = Depends(get_db),
        school_header: str | None = Header(default=None, alias="X-School-Id"),
    ) -> tuple[int, str]:
        if not school_header:
            raise HTTPException(400, "Select a school using X-School-Id.")
        try:
            school_id = int(school_header)
        except (TypeError, ValueError):
            raise HTTPException(400, "Invalid X-School-Id header.")
        if school_id <= 0 or not identity.can_access_school(school_id):
            raise HTTPException(403, "You do not have access to the selected school.")
        school = db.query(TtSchool).filter(TtSchool.id == school_id).first()
        if school is None or school.status != "active":
            raise HTTPException(403, "This school is not active on the platform.")
        role = str(identity.role_in(school_id) or "").lower()
        if role not in allowed_roles and not (identity.is_super_admin and role in ALL_LIBRARY_ROLES):
            raise HTTPException(403, "An authorized Library role is required for the selected school.")
        entitlement_rows = db.query(TtSchoolModuleEntitlement).filter(
            TtSchoolModuleEntitlement.school_id == school_id
        ).all()
        if entitlement_rows:
            library_enabled = any(row.module_key == "library" and row.enabled for row in entitlement_rows)
        else:
            # Preserve the configured starter-module defaults until a super admin saves entitlements.
            library_enabled = "library" in DEFAULT_ENABLED_MODULES
        if not library_enabled:
            raise HTTPException(403, {"code": "module_not_enabled", "module": "library", "message": "Library is not enabled for this school. Contact your platform administrator."})
        return school_id, role
    return dependency


librarian_access = _school_access_dependency(LIBRARIAN_ROLES)
library_access = _school_access_dependency(ALL_LIBRARY_ROLES)


def _rows(db: Session, sql: str, **params: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params).mappings().all()]


def _one(db: Session, sql: str, **params: Any) -> dict[str, Any] | None:
    row = db.execute(text(sql), params).mappings().first()
    return dict(row) if row else None


def _db_error(exc: Exception) -> HTTPException:
    message = str(getattr(getattr(exc, "orig", None), "diag", None) and exc.orig.diag.message_primary or exc)
    if "P0002" in message or "not found" in message.lower():
        return HTTPException(404, message)
    if any(code in message for code in ("23514", "23505", "22023")):
        return HTTPException(409 if "23514" in message or "23505" in message else 400, message)
    return HTTPException(503, "Library storage is unavailable or its migration has not been applied.")


def _commit(db: Session) -> None:
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise _db_error(exc)


class BookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    author: str | None = None
    isbn: str | None = None
    grade: str = Field(min_length=1, max_length=100)
    subject: str = Field(min_length=1, max_length=100)
    total_copies: int = Field(default=1, ge=1, le=5000)


class BookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    author: str | None = None
    isbn: str | None = None
    grade: str | None = Field(default=None, min_length=1, max_length=100)
    subject: str | None = Field(default=None, min_length=1, max_length=100)


class MovementInput(BaseModel):
    action: str
    to_holder_type: str | None = None
    to_holder_id: int | None = Field(default=None, gt=0)
    to_holder_name: str | None = None
    condition: str = "good"
    due_date: date | None = None
    notes: str | None = None


@router.get("/books")
def list_books(
    access: tuple[int, str] = Depends(librarian_access),
    db: Session = Depends(get_db),
):
    school_id, _ = access
    return _rows(db, "SELECT * FROM public.library_books WHERE school_id=:school_id ORDER BY title", school_id=school_id)


@router.get("/books/stats")
def book_stats(access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    try:
        books = _rows(db, "SELECT total_copies FROM public.library_books WHERE school_id=:s", s=school_id)
        loans = _rows(db, "SELECT status FROM public.library_loans WHERE school_id=:s", s=school_id)
        copies = _rows(db, "SELECT status,current_holder_type FROM public.library_book_copies WHERE school_id=:s", s=school_id)
    except SQLAlchemyError as exc:
        raise _db_error(exc)
    return {
        "total_titles": len(books),
        "total_copies": len(copies) or sum(int(b.get("total_copies") or 0) for b in books),
        "available_copies": sum(c["status"] == "available" for c in copies),
        "with_teachers": sum(c["current_holder_type"] == "teacher" for c in copies),
        "with_students": sum(c["current_holder_type"] == "student" for c in copies),
        "lost_copies": sum(c["status"] == "lost" for c in copies),
        "excluded_copies": sum(c["status"] == "excluded" for c in copies),
        "unreconciled_copies": sum(c["status"] == "unreconciled" for c in copies),
        "active_loans": sum(l["status"] in {"borrowed", "overdue", "on_loan"} for l in loans),
    }


@router.get("/books/grade-subject-summary")
def grade_subject_summary(access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    books = _rows(db, "SELECT id,title,author,grade,subject,total_copies FROM public.library_books WHERE school_id=:s ORDER BY grade,subject,title", s=school_id)
    copies = _rows(db, "SELECT id,book_id,copy_number,status,current_holder_type FROM public.library_book_copies WHERE school_id=:s", s=school_id)
    by_book: dict[int, list[dict[str, Any]]] = {}
    for copy in copies:
        by_book.setdefault(int(copy["book_id"]), []).append(copy)
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for book in books:
        grade, subject = book.get("grade") or "Unassigned", book.get("subject") or "Unassigned"
        group = groups.setdefault((grade, subject), {"grade": grade, "subject": subject, "title_count": 0, "total_copies": 0, "titles": []})
        title_copies = by_book.get(int(book["id"]), [])
        group["title_count"] += 1
        group["total_copies"] += len(title_copies)
        group["titles"].append({**book, "total_copies": len(title_copies), "copies": title_copies})
    return sorted(groups.values(), key=lambda g: (g["grade"], g["subject"]))


@router.post("/books", status_code=201)
def create_book(payload: BookCreate, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    try:
        row = _one(db, """
            INSERT INTO public.library_books
              (school_id,title,author,isbn,grade,subject,total_copies,available_copies)
            VALUES (:school_id,:title,:author,:isbn,:grade,:subject,:count,:count)
            RETURNING *
        """, school_id=school_id, title=payload.title.strip(), author=payload.author, isbn=payload.isbn,
             grade=payload.grade.strip(), subject=payload.subject.strip(), count=payload.total_copies)
        if not row:
            raise HTTPException(500, "Book could not be created.")
        width = max(2, len(str(payload.total_copies)))
        for number in range(1, payload.total_copies + 1):
            db.execute(text("""
                INSERT INTO public.library_book_copies (book_id,school_id,copy_number)
                VALUES (:book_id,:school_id,:copy_number)
            """), {"book_id": row["id"], "school_id": school_id,
                   "copy_number": f"{number:0{width}d}/{payload.total_copies:0{width}d}"})
        _commit(db)
        return row
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise _db_error(exc)


@router.get("/books/{book_id}")
def get_book(book_id: int, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    book = _one(db, "SELECT * FROM public.library_books WHERE school_id=:s AND id=:id", s=school_id, id=book_id)
    if not book:
        raise HTTPException(404, "Book not found.")
    book["loans"] = _rows(db, "SELECT * FROM public.library_loans WHERE school_id=:s AND book_id=:id ORDER BY created_at DESC", s=school_id, id=book_id)
    book["copies"] = _rows(db, "SELECT * FROM public.library_book_copies WHERE school_id=:s AND book_id=:id ORDER BY copy_number", s=school_id, id=book_id)
    return book


@router.patch("/books/{book_id}")
def update_book(book_id: int, payload: BookUpdate, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    values = {k: v.strip() if isinstance(v, str) else v for k, v in payload.model_dump(exclude_unset=True).items()}
    if not values:
        raise HTTPException(400, "No book fields were supplied.")
    assignments = ", ".join(f"{key}=:{key}" for key in values)
    values.update({"s": school_id, "id": book_id})
    try:
        row = _one(db, f"UPDATE public.library_books SET {assignments} WHERE school_id=:s AND id=:id RETURNING *", **values)
        _commit(db)
        if not row:
            raise HTTPException(404, "Book not found.")
        return row
    except Exception as exc:
        db.rollback()
        if isinstance(exc, HTTPException):
            raise
        raise _db_error(exc)


@router.delete("/books/{book_id}", status_code=204)
def delete_book(book_id: int, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    if _one(db, "SELECT id FROM public.library_book_copies WHERE school_id=:s AND book_id=:id LIMIT 1", s=school_id, id=book_id):
        raise HTTPException(409, "This title has a physical-copy register. Keep it for custody history; archive support is required before deletion.")
    result = db.execute(text("DELETE FROM public.library_books WHERE school_id=:s AND id=:id"), {"s": school_id, "id": book_id})
    _commit(db)
    if result.rowcount == 0:
        raise HTTPException(404, "Book not found.")
    return None


@router.get("/copies")
def list_copies(
    book_id: int | None = None, holder_type: str | None = None, holder_id: int | None = None,
    copy_status: str | None = Query(default=None, alias="status"),
    access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db),
):
    school_id, _ = access
    clauses = ["c.school_id=:s"]
    params: dict[str, Any] = {"s": school_id}
    for field, value in (("book_id", book_id), ("current_holder_type", holder_type), ("current_holder_id", holder_id), ("status", copy_status)):
        if value is not None:
            clauses.append(f"c.{field}=:{field}")
            params[field] = value
    return _rows(db, """
        SELECT c.*, CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('id',b.id,'title',b.title,'author',b.author,'isbn',b.isbn) END AS book
        FROM public.library_book_copies c LEFT JOIN public.library_books b ON b.id=c.book_id AND b.school_id=c.school_id
        WHERE """ + " AND ".join(clauses) + " ORDER BY c.copy_number", **params)


@router.get("/copies/{copy_id}/movements")
def copy_movements(copy_id: UUID, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    if not _one(db, "SELECT id FROM public.library_book_copies WHERE school_id=:s AND id=:id", s=school_id, id=str(copy_id)):
        raise HTTPException(404, "Book copy not found in the selected school.")
    return _rows(db, "SELECT * FROM public.library_copy_movements WHERE school_id=:s AND copy_id=:id ORDER BY performed_at DESC,id DESC", s=school_id, id=str(copy_id))


def _teacher_name(profile: dict[str, Any]) -> str:
    details = profile.get("timetableDetails") if isinstance(profile.get("timetableDetails"), dict) else {}
    first = str(details.get("firstName") or profile.get("firstName") or profile.get("first_name") or "").strip()
    last = str(profile.get("lastName") or profile.get("last_name") or "").strip()
    raw = str(profile.get("name") or "").strip()
    if first and last:
        return first + " " + last
    if first and raw and first.casefold() != raw.casefold():
        return first + " " + raw
    return raw or first or last


def _teacher_owners(db: Session, school_id: int) -> list[str]:
    rows = _rows(db, """
        SELECT user_id,school_id FROM public.tt_memberships
        WHERE is_active IS TRUE AND lower(role) IN ('admin','super_admin')
    """)
    by_owner: dict[str, set[int]] = {}
    for row in rows:
        by_owner.setdefault(str(row["user_id"]), set()).add(int(row["school_id"]))
    ambiguous = [owner for owner, schools in by_owner.items() if school_id in schools and len(schools) > 1]
    if ambiguous:
        raise HTTPException(409, "A school administrator manages multiple schools but timetable teacher profiles are still account-scoped. Separate the timetable profiles by school before using the Library teacher directory.")
    return [owner for owner, schools in by_owner.items() if schools == {school_id}]


@router.get("/teacher-directory")
def teacher_directory(access: tuple[int, str] = Depends(library_access), db: Session = Depends(get_db)):
    school_id, _ = access
    owners = _teacher_owners(db, school_id)
    if not owners:
        return []
    rows = _rows(db, "SELECT id,profile FROM public.timetable_teacher_profiles WHERE owner_id = ANY(:owners) ORDER BY id", owners=owners)
    result = []
    for row in rows:
        profile = row.get("profile") if isinstance(row.get("profile"), dict) else {}
        name = _teacher_name(profile)
        if name:
            result.append({"id": int(row["id"]), "name": name, "staff_number": str(profile.get("short") or profile.get("code") or "").strip() or None})
    return result


@router.get("/student-directory")
def student_directory(access: tuple[int, str] = Depends(library_access), db: Session = Depends(get_db)):
    school_id, _ = access
    # Legacy student rows have no tenant key. Admit only globally unique admission
    # numbers which map to exactly one active modern student in this school.
    rows = _rows(db, """
        SELECT s.id,s.admission_number,s.first_name,s.middle_name,s.last_name,
               COALESCE(sc.display_name,sc.name,
                 concat_ws(' ',g.name,st.name)) AS current_class
        FROM public.students s
        JOIN public.students_v2 sv ON sv.admission_number=s.admission_number
        LEFT JOIN LATERAL (
          SELECT e.* FROM public.student_enrollments e
          WHERE e.school_id=:school_id AND e.student_id=sv.id AND lower(e.status)='enrolled'
          ORDER BY e.created_at DESC LIMIT 1
        ) e ON TRUE
        LEFT JOIN public.school_classes sc ON sc.id=COALESCE(e.school_class_id,e.class_id) AND sc.school_id=:school_id
        LEFT JOIN public.grades g ON g.id=e.grade_id AND g.school_id=:school_id
        LEFT JOIN public.streams st ON st.id=e.stream_id AND st.school_id=:school_id
        WHERE sv.school_id=:school_id
          AND lower(coalesce(sv.status,'')) NOT IN ('inactive','withdrawn','archived','deleted')
          AND lower(coalesce(s.status,'')) NOT IN ('inactive','withdrawn','archived','deleted')
          AND (SELECT count(*) FROM public.students_v2 sv2 WHERE sv2.admission_number=s.admission_number)=1
          AND (SELECT count(*) FROM public.students s2 WHERE s2.admission_number=s.admission_number)=1
        ORDER BY s.admission_number
    """, school_id=school_id)
    return [{"id": int(r["id"]), "admission_number": r["admission_number"],
             "name": " ".join(x for x in [r.get("first_name"), r.get("middle_name"), r.get("last_name")] if x),
             "current_class": r.get("current_class")} for r in rows]


@router.get("/student-allocations")
def student_allocations(access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    rows = _rows(db, """
        SELECT a.copy_id,a.copy_number,a.book_title,a.accountable_teacher_name,
               a.student_id,a.student_name,a.student_issue_at,
               s.admission_number,s.first_name,s.middle_name,s.last_name,
               COALESCE(sc.display_name,sc.name,concat_ws(' ',g.name,st.name)) AS current_class
        FROM public.library_teacher_accountability a
        JOIN public.library_book_copies c ON c.id=a.copy_id AND c.school_id=:s
        JOIN public.students s ON s.id=a.student_id
        JOIN public.students_v2 sv ON sv.admission_number=s.admission_number AND sv.school_id=:s
        LEFT JOIN LATERAL (
          SELECT e.* FROM public.student_enrollments e WHERE e.school_id=:s AND e.student_id=sv.id
          AND lower(e.status)='enrolled' ORDER BY e.created_at DESC LIMIT 1
        ) e ON TRUE
        LEFT JOIN public.school_classes sc ON sc.id=COALESCE(e.school_class_id,e.class_id) AND sc.school_id=:s
        LEFT JOIN public.grades g ON g.id=e.grade_id AND g.school_id=:s
        LEFT JOIN public.streams st ON st.id=e.stream_id AND st.school_id=:s
        WHERE a.current_holder_type='student' AND a.status<>'lost'
          AND (SELECT count(*) FROM public.students_v2 sv2 WHERE sv2.admission_number=s.admission_number)=1
          AND (SELECT count(*) FROM public.students s2 WHERE s2.admission_number=s.admission_number)=1
        ORDER BY a.book_title,a.copy_number
    """, s=school_id)
    return {"items": [{
        "copy_id": r["copy_id"], "copy_number": r["copy_number"], "book_title": r["book_title"],
        "accountable_teacher_name": r.get("accountable_teacher_name") or "Unknown teacher",
        "student_name": " ".join(x for x in [r.get("first_name"), r.get("middle_name"), r.get("last_name")] if x) or r.get("student_name") or "Unknown student",
        "student_admission_number": r.get("admission_number"), "student_class": r.get("current_class"),
        "student_issue_at": r.get("student_issue_at"),
    } for r in rows]}


@router.get("/teacher-accountability")
def teacher_accountability(teacher_id: int | None = None, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    sql = "SELECT * FROM public.library_teacher_accountability WHERE school_id=:s"
    params: dict[str, Any] = {"s": school_id}
    if teacher_id is not None:
        sql += " AND accountable_teacher_id=:teacher_id"
        params["teacher_id"] = teacher_id
    sql += " ORDER BY accountable_teacher_name,book_title,copy_number"
    rows = _rows(db, sql, **params)
    teachers: dict[int, dict[str, Any]] = {}
    for copy in rows:
        teacher = copy.get("accountable_teacher_id")
        if teacher is None:
            continue
        group = teachers.setdefault(int(teacher), {
            "teacher_id": int(teacher), "teacher_name": copy.get("accountable_teacher_name") or f"Teacher {teacher}",
            "total_accountable": 0, "with_students": 0, "retained_by_teacher": 0, "lost": 0, "copies": [],
        })
        group["total_accountable"] += 1
        if copy["current_holder_type"] == "student" and copy["status"] != "lost":
            group["with_students"] += 1
        elif copy["current_holder_type"] == "teacher" and copy["status"] != "lost":
            group["retained_by_teacher"] += 1
        if copy["status"] == "lost":
            group["lost"] += 1
        group["copies"].append(copy)
    return {
        "total_accountable": len(rows),
        "with_students": sum(r["current_holder_type"] == "student" and r["status"] != "lost" for r in rows),
        "retained_by_teachers": sum(r["current_holder_type"] == "teacher" and r["status"] != "lost" for r in rows),
        "lost": sum(r["status"] == "lost" for r in rows),
        "teachers": list(teachers.values()), "copies": rows,
    }


@router.get("/teacher-inventory-summary")
def teacher_inventory_summary(teacher_id: str | None = None, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    rows = _rows(db, """
        SELECT a.accountable_teacher_id,a.accountable_teacher_name,a.book_id,a.copy_id,
               a.copy_number,a.status,a.current_holder_type,a.current_holder_name,
               b.title,b.grade,b.subject
        FROM public.library_teacher_accountability a
        JOIN public.library_books b ON b.id=a.book_id AND b.school_id=:s
        WHERE a.school_id=:s
    """ + (" AND a.accountable_teacher_id=:teacher_id" if teacher_id and teacher_id != "all" else ""),
        **({"s": school_id, "teacher_id": int(teacher_id)} if teacher_id and teacher_id != "all" else {"s": school_id}))
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        tid = row.get("accountable_teacher_id")
        if tid is None:
            continue
        key = str(tid)
        teacher = grouped.setdefault(key, {"teacher_id": tid, "teacher_name": row.get("accountable_teacher_name") or f"Teacher {tid}", "grades": {}})
        grade = row.get("grade") or "Unassigned"
        grade_group = teacher["grades"].setdefault(grade, {"grade": grade, "total_copies": 0, "subjects": {}})
        subject = row.get("subject") or "Unassigned"
        subject_group = grade_group["subjects"].setdefault(subject, {"subject": subject, "total_copies": 0, "titles": {}})
        title = subject_group["titles"].setdefault(int(row["book_id"]), {"book_id": row["book_id"], "title": row["title"], "total_copies": 0, "copies": []})
        copy = {"copy_id": row["copy_id"], "copy_number": row["copy_number"], "status": row["status"], "current_holder_type": row["current_holder_type"], "current_holder_name": row["current_holder_name"]}
        title["copies"].append(copy)
        title["total_copies"] += 1
        subject_group["total_copies"] += 1
        grade_group["total_copies"] += 1
    def finish(t: dict[str, Any]) -> dict[str, Any]:
        grades = []
        for grade in sorted(t["grades"]):
            g = t["grades"][grade]
            subjects = []
            for subject in sorted(g["subjects"]):
                s = g["subjects"][subject]
                s["titles"] = sorted(s["titles"].values(), key=lambda x: x["title"])
                subjects.append(s)
            grades.append({"grade": grade, "total_copies": g["total_copies"], "subjects": subjects})
        return {"teacher_id": t["teacher_id"], "teacher_name": t["teacher_name"], "total_copies": sum(g["total_copies"] for g in grades), "grades": grades}
    teachers = [finish(t) for t in grouped.values()]
    all_rows = [r for r in rows if r.get("accountable_teacher_id") is not None]
    all_teacher = None
    if not teacher_id or teacher_id == "all":
        all_teacher = {"teacher_id": None, "teacher_name": "All Teachers", "grades": {}}
        for row in all_rows:
            grade = row.get("grade") or "Unassigned"
            g = all_teacher["grades"].setdefault(grade, {"grade": grade, "total_copies": 0, "subjects": {}})
            subject = row.get("subject") or "Unassigned"
            s = g["subjects"].setdefault(subject, {"subject": subject, "total_copies": 0, "titles": {}})
            title = s["titles"].setdefault(int(row["book_id"]), {"book_id": row["book_id"], "title": row["title"], "total_copies": 0, "copies": []})
            title["copies"].append({"copy_id": row["copy_id"], "copy_number": row["copy_number"], "status": row["status"], "current_holder_type": row["current_holder_type"], "current_holder_name": row["current_holder_name"]})
            title["total_copies"] += 1; s["total_copies"] += 1; g["total_copies"] += 1
        all_teacher = finish(all_teacher)
    return {"teachers": sorted(teachers, key=lambda t: t["teacher_name"]), "all_teachers": all_teacher}


@router.get("/reconciliation")
def reconciliation(teacher_id: int | None = None, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    sql = """
      SELECT c.*, json_build_object('id',b.id,'title',b.title) AS book
      FROM public.library_book_copies c
      LEFT JOIN public.library_books b ON b.id=c.book_id AND b.school_id=c.school_id
      WHERE c.school_id=:s AND c.current_holder_type<>'library'
    """
    params: dict[str, Any] = {"s": school_id}
    if teacher_id is not None:
        sql += " AND c.current_holder_type='teacher' AND c.current_holder_id=:teacher_id"
        params["teacher_id"] = teacher_id
    rows = _rows(db, sql + " ORDER BY c.book_id,c.copy_number", **params)
    grouped: dict[str, dict[str, Any]] = {}
    for copy in rows:
        key = f'{copy["current_holder_type"]}:{copy.get("current_holder_id")}'
        group = grouped.setdefault(key, {"holder_type": copy["current_holder_type"], "holder_id": copy.get("current_holder_id"), "holder_name": copy.get("current_holder_name"), "copies": []})
        group["copies"].append(copy)
    return {
        "outstanding_count": len(rows),
        "with_teachers": sum(x["current_holder_type"] == "teacher" for x in rows),
        "with_students": sum(x["current_holder_type"] == "student" for x in rows),
        "unreconciled_count": sum(x["status"] == "unreconciled" for x in rows),
        "lost_count": sum(x["status"] == "lost" for x in rows),
        "outstanding_copies": rows, "by_holder": list(grouped.values()),
    }


@router.post("/copies/{copy_id}/movements")
def record_movement(copy_id: UUID, payload: MovementInput, identity: Identity = Depends(resolve_identity),
                    school_header: str | None = Header(default=None, alias="X-School-Id"), db: Session = Depends(get_db)):
    if not school_header:
        raise HTTPException(400, "Select a school using X-School-Id.")
    try:
        school_id = int(school_header)
    except ValueError:
        raise HTTPException(400, "Invalid X-School-Id header.")
    if school_id <= 0 or not identity.can_access_school(school_id):
        raise HTTPException(403, "You do not have access to the selected school.")
    role = str(identity.role_in(school_id) or "").lower()
    action = payload.action
    if action not in ACTIONS:
        raise HTTPException(400, "Unsupported movement action.")
    if role not in MOVEMENT_ROLES[action]:
        raise HTTPException(403, "Your Library role cannot record this movement.")
    if payload.condition not in CONDITIONS:
        raise HTTPException(400, "Condition must be good, damaged, or lost.")
    copy = _one(db, "SELECT current_holder_type,current_holder_id FROM public.library_book_copies WHERE school_id=:s AND id=:id", s=school_id, id=str(copy_id))
    if not copy:
        raise HTTPException(404, "Book copy not found in the selected school.")
    membership = _one(db, "SELECT teacher_id FROM public.tt_memberships WHERE user_id=:u AND school_id=:s AND is_active IS TRUE", u=identity.user_id, s=school_id)
    teacher_id = membership.get("teacher_id") if membership else None
    if role == "teacher" and action in {"issue_to_student", "student_return_to_teacher", "mark_lost"}:
        if not teacher_id:
            raise HTTPException(403, "Your membership is not linked to a teacher record.")
        if action == "issue_to_student" and (copy["current_holder_type"] != "teacher" or int(copy.get("current_holder_id") or 0) != int(teacher_id)):
            raise HTTPException(403, "Teachers may only issue copies held in their own custody.")
        if action == "student_return_to_teacher" and payload.to_holder_id != int(teacher_id):
            raise HTTPException(403, "A student must return the copy to the teacher who issued it.")
        if action == "mark_lost":
            accountable = _one(db, "SELECT copy_id FROM public.library_teacher_accountability WHERE school_id=:s AND copy_id=:id AND accountable_teacher_id=:t", s=school_id, id=str(copy_id), t=int(teacher_id))
            if not accountable:
                raise HTTPException(403, "Teachers may only report a copy lost while it is under their own accountability.")
        owners = _teacher_owners(db, school_id)
        if int(teacher_id) not in [int(r["id"]) for r in _rows(db, "SELECT id FROM public.timetable_teacher_profiles WHERE owner_id = ANY(:owners)", owners=owners)]:
            raise HTTPException(403, "Your teacher membership is not linked to a saved teacher profile in this school.")
    if action in {"issue_to_teacher", "issue_to_student", "student_return_to_teacher"} and (not payload.to_holder_id or not (payload.to_holder_name or "").strip()):
        raise HTTPException(400, "A valid receiving holder ID and name are required for this action.")
    if action == "issue_to_student":
        student = _one(db, """
            SELECT id,admission_number,first_name,middle_name,last_name,status
            FROM public.students WHERE id=:id
        """, id=payload.to_holder_id)
        if not student or str(student.get("status") or "").lower() in {"inactive","withdrawn","archived","deleted"}:
            raise HTTPException(422, "Select an active student from the Student module.")
        matches = _rows(db, """
            SELECT id,school_id,status FROM public.students_v2 WHERE admission_number=:admission
        """, admission=student["admission_number"])
        valid = [r for r in matches if int(r["school_id"]) == school_id]
        if len(matches) != 1 or len(valid) != 1 or str(valid[0].get("status") or "").lower() in {"inactive","withdrawn","archived","deleted"}:
            raise HTTPException(422, "The selected student is not uniquely mapped to an active student in your current school.")
        legacy = _rows(db, "SELECT id FROM public.students WHERE admission_number=:admission", admission=student["admission_number"])
        if len(legacy) != 1 or int(legacy[0]["id"]) != int(payload.to_holder_id):
            raise HTTPException(422, "The selected legacy student record is ambiguous and cannot be assigned custody.")
        expected = " ".join(x for x in [student.get("first_name"),student.get("middle_name"),student.get("last_name")] if x)
        if (payload.to_holder_name or "").strip() != expected:
            raise HTTPException(422, "Student name does not match the selected Student module record.")
    if action in {"issue_to_teacher", "reconcile_copy"} and (action == "issue_to_teacher" or payload.to_holder_type == "teacher"):
        if not payload.to_holder_id or not (payload.to_holder_name or "").strip():
            raise HTTPException(400, "A verified teacher ID and name are required.")
        owners = _teacher_owners(db, school_id)
        teacher = _one(db, "SELECT id,profile FROM public.timetable_teacher_profiles WHERE id=:id AND owner_id = ANY(:owners)", id=payload.to_holder_id, owners=owners) if owners else None
        if not teacher:
            raise HTTPException(422, "Select a teacher from the saved timetable teacher directory for this school.")
        profile = teacher.get("profile") if isinstance(teacher.get("profile"), dict) else {}
        if _teacher_name(profile) != (payload.to_holder_name or "").strip():
            raise HTTPException(422, "Teacher name does not match the selected saved timetable teacher profile.")
    if action == "reconcile_copy" and payload.to_holder_type not in {"library", "teacher"}:
        raise HTTPException(400, "Physically verify the copy at the library or with its responsible teacher.")
    if action == "reconcile_copy" and payload.to_holder_type == "teacher" and (not payload.to_holder_id or not (payload.to_holder_name or "").strip()):
        raise HTTPException(400, "A verified teacher ID and name are required when the copy is with a teacher.")
    if action in {"exclude_before_issue", "restore_excluded_copy"} and not (payload.notes or "").strip():
        raise HTTPException(400, "A reason is required for pre-issue exclusion or restoration.")
    try:
        if action in {"exclude_before_issue", "restore_excluded_copy"}:
            result = _one(db, """
              SELECT * FROM public.set_library_copy_preissue_exclusion(
                CAST(:copy_id AS uuid),:action,:reason,CAST(:actor AS uuid)
              ) 
            """, copy_id=str(copy_id), action=action, reason=payload.notes.strip(), actor=identity.user_id)
        else:
            result = _one(db, """
              SELECT * FROM public.move_library_book_copy(
                CAST(:copy_id AS uuid),:action,:holder_id,:holder_name,:condition,
                :due_date,:notes,CAST(:actor AS uuid),:holder_type
              )
            """, copy_id=str(copy_id), action=action, holder_id=payload.to_holder_id,
                 holder_name=(payload.to_holder_name or "").strip() or None, condition=payload.condition,
                 due_date=payload.due_date, notes=payload.notes, actor=identity.user_id,
                 holder_type=payload.to_holder_type)
        _commit(db)
        return result
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise _db_error(exc)


@router.get("/loans")
def list_loans(access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    return _rows(db, "SELECT * FROM public.library_loans WHERE school_id=:s ORDER BY created_at DESC", s=school_id)


@router.post("/loans", status_code=201)
def create_loan(payload: dict[str, Any], access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    allowed = {"book_id", "borrower_name", "borrower_type", "borrower_id", "loan_date", "due_date", "status", "notes"}
    values = {k: v for k, v in payload.items() if k in allowed}
    if not values.get("book_id") or not str(values.get("borrower_name") or "").strip():
        raise HTTPException(400, "book_id and borrower_name are required.")
    book = _one(db, "SELECT id FROM public.library_books WHERE id=:id AND school_id=:s", id=values["book_id"], s=school_id)
    if not book:
        raise HTTPException(404, "Book not found in the selected school.")
    values["school_id"] = school_id
    columns = list(values)
    binds = ", ".join(f":{k}" for k in columns)
    try:
        row = _one(db, f"INSERT INTO public.library_loans ({','.join(columns)}) VALUES ({binds}) RETURNING *", **values)
        _commit(db)
        return row
    except Exception as exc:
        db.rollback()
        raise _db_error(exc)


@router.post("/loans/{loan_id}/return")
def return_loan(loan_id: int, access: tuple[int, str] = Depends(librarian_access), db: Session = Depends(get_db)):
    school_id, _ = access
    row = _one(db, "SELECT * FROM public.library_loans WHERE school_id=:s AND id=:id", s=school_id, id=loan_id)
    if not row:
        raise HTTPException(404, "Loan not found.")
    if row.get("status") == "returned":
        raise HTTPException(409, "Loan already returned.")
    updated = _one(db, "UPDATE public.library_loans SET status='returned',returned_date=CURRENT_DATE WHERE school_id=:s AND id=:id RETURNING *", s=school_id, id=loan_id)
    _commit(db)
    return updated
