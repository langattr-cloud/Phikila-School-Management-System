"""Seed a fully worked demo school into a local (SQLite) database.

Production databases are created through ``alembic upgrade head`` on
PostgreSQL. This script exists for local development and the hosted preview:
it creates the schema via ``create_all`` when no tables exist yet, then loads
a realistic school — calendar, staff, rooms, subjects, classes, weekly lesson
requirements — and finally runs the real CP-SAT scheduling engine to produce a
complete timetable, exactly as the "Generate" screen would.

Usage:
    python scripts/seed_demo.py            # seeds + generates a timetable
    python scripts/seed_demo.py --no-solve # only seed master data

Demo logins (all password ``demo2026``):
    admin@phikila.com     — school + platform admin
    teacher@phikila.com   — teacher (Mr. Kamau's timetable)
    student@phikila.com   — student (Form 3A timetable)
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, datetime

# Importing the application registers every mounted model on Base.metadata.
from app.main import app as _fastapi_app  # noqa: F401

from app.core.database import Base, SessionLocal, engine
from app.modules.authentication.security import get_password_hash
from app.modules.platform.models import TtPlatformAdmin
from app.modules.scheduling import jobs as job_queue
from app.modules.scheduling import models as m
from app.modules.scheduling.tenancy import TtMembership, TtSchool
from app.modules.school.models import SchoolInfo
from app.modules.users.models import User
from app.modules.academics.models import AcademicYear, Level, Stream, Term

DEMO_PASSWORD = "demo2026"

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

# 8 teaching periods + a morning break and a lunch row.
PERIODS = [
    ("P1", "08:00", "08:40", True),
    ("P2", "08:40", "09:20", True),
    ("P3", "09:20", "10:00", True),
    ("Break", "10:00", "10:20", False),
    ("P4", "10:20", "11:00", True),
    ("P5", "11:00", "11:40", True),
    ("P6", "11:40", "12:20", True),
    ("Lunch", "12:20", "13:20", False),
    ("P7", "13:20", "14:00", True),
    ("P8", "14:00", "14:40", True),
]

TEACHERS = [
    # name, code, department, max_per_day, max_consecutive, unavailable
    ("Mr. Kamau", "T001", "Mathematics", 7, 4, {"0": [0]}),
    ("Ms. Wanjiru", "T002", "Mathematics", 7, 4, {}),
    ("Ms. Achieng", "T003", "Languages", 7, 4, {}),
    ("Mr. Otieno", "T004", "Languages", 7, 4, {}),
    ("Ms. Muthoni", "T005", "Languages", 7, 4, {}),
    ("Mr. Njenga", "T006", "Sciences", 7, 4, {}),
    ("Ms. Chebet", "T007", "Sciences", 7, 4, {}),
    ("Ms. Akinyi", "T008", "Sciences", 7, 4, {}),
    ("Mr. Omondi", "T009", "Humanities", 7, 4, {}),
    ("Ms. Njeri", "T010", "Humanities", 7, 4, {}),
    ("Mr. Kiptoo", "T011", "Technical", 7, 4, {}),
    ("Ms. Anyango", "T012", "Technical", 7, 4, {}),
]

ROOMS = [
    # name, code, building, capacity, room_type
    ("Room 1", "R01", "Main Block", 40, "classroom"),
    ("Room 2", "R02", "Main Block", 40, "classroom"),
    ("Room 3", "R03", "Main Block", 40, "classroom"),
    ("Room 4", "R04", "Main Block", 40, "classroom"),
    ("Room 5", "R05", "East Wing", 45, "classroom"),
    ("Room 6", "R06", "East Wing", 45, "classroom"),
    ("Room 7", "R07", "East Wing", 45, "classroom"),
    ("Lab 1", "L01", "Science Block", 40, "lab"),
    ("Lab 2", "L02", "Science Block", 40, "lab"),
    ("Computer Lab", "C01", "Main Block", 45, "computer"),
    ("Hall", "H01", "Main Block", 200, "hall"),
]

SUBJECTS = [
    # name, code, colour, prefers_morning, prefers_double, spread, room_type
    ("Mathematics", "MAT", "#2563EB", False, False, True, None),
    ("English", "ENG", "#7C3AED", False, False, True, None),
    ("Kiswahili", "KIS", "#DB2777", False, False, True, None),
    ("Physics", "PHY", "#DC2626", False, True, True, "lab"),
    ("Chemistry", "CHE", "#EA580C", False, True, True, "lab"),
    ("Biology", "BIO", "#16A34A", False, True, True, "lab"),
    ("Integrated Science", "ISC", "#059669", False, False, True, None),
    ("Social Studies", "SST", "#0891B2", False, False, True, None),
    ("Geography", "GEO", "#4F46E5", False, False, True, None),
    ("History", "HIS", "#B45309", False, False, True, None),
    ("CRE", "CRE", "#0D9488", False, False, True, None),
    ("ICT", "ICT", "#0E7490", False, False, True, "computer"),
    ("Physical Education", "PES", "#65A30D", False, False, True, None),
    ("Art & Design", "ART", "#C026D3", False, False, True, None),
]

CLASSES = [
    # name, code, grade, student_count
    ("Form 1A", "F1A", "Form 1", 42),
    ("Form 1B", "F1B", "Form 1", 41),
    ("Form 2A", "F2A", "Form 2", 40),
    ("Form 2B", "F2B", "Form 2", 39),
    ("Form 3A", "F3A", "Form 3", 38),
    ("Form 3B", "F3B", "Form 3", 37),
    ("Form 4A", "F4A", "Form 4", 36),
]

# (class code, subject code, teacher code, periods/week, double periods, room code)
REQUIREMENTS: list[tuple[str, str, str, int, int, str | None]] = []


def _junior_curriculum(class_codes: list[str]) -> None:
    for cls in class_codes:
        REQUIREMENTS.extend(
            [
                (cls, "MAT", "T002", 6, 0, None),
                (cls, "ENG", "T003", 6, 0, None),
                (cls, "KIS", "T005", 4, 0, None),
                (cls, "ISC", "T006" if cls.endswith("B") and cls.startswith("F2") else "T007", 4, 0, None),
                (cls, "SST", "T008" if cls == "F1A" else "T009", 4, 0, None),
                (cls, "ICT", "T011", 2, 0, None),
                (cls, "CRE", "T010", 2, 0, None),
                (cls, "PES", "T011", 2, 0, None),
                (cls, "ART", "T012", 2, 0, None),
            ]
        )


def _senior_curriculum(class_codes: list[str]) -> None:
    for cls in class_codes:
        REQUIREMENTS.extend(
            [
                (cls, "MAT", "T001", 6, 1, None),
                (cls, "ENG", "T004", 6, 0, None),
                (cls, "KIS", "T005", 4, 0, None),
                (cls, "PHY", "T006", 4, 1, None),
                (cls, "CHE", "T007", 4, 1, None),
                (cls, "BIO", "T008", 4, 1, None),
                (cls, "GEO", "T010", 3, 0, None),
                (cls, "HIS", "T009", 3, 0, None),
                (cls, "CRE", "T010", 2, 0, None),
                (cls, "PES", "T012", 2, 0, None),
            ]
        )


_junior_curriculum(["F1A", "F1B", "F2A", "F2B"])
_senior_curriculum(["F3A", "F3B", "F4A"])


def seed(db) -> bool:
    """Create the demo school. Returns False when data already exists."""
    if db.query(TtSchool).first() is not None:
        print("Demo data already present; nothing to do.")
        return False

    # --- Authentication users (legacy local login) --------------------------
    for email in ("admin@phikila.com", "teacher@phikila.com", "student@phikila.com"):
        if not db.query(User).filter(User.email == email).first():
            db.add(
                User(
                    username=email.split("@")[0],
                    email=email,
                    hashed_password=get_password_hash(DEMO_PASSWORD),
                    role="Admin" if email.startswith("admin") else "Teacher",
                    is_active=True,
                )
            )

    # --- School profile (legacy module) --------------------------------------
    school_info = db.query(SchoolInfo).first()
    if not school_info:
        school_info = SchoolInfo(
            name="Greenfields Secondary School",
            code="GRN",
            registration_number="REG/2026/001",
            education_system="8-4-4",
            school_type="Secondary",
            category="Public",
            county="Nairobi",
            sub_county="Westlands",
            postal_address="P.O. Box 1234 - 00100 Nairobi",
            phone="+254 700 000 000",
            email="info@greenfields.example",
            motto="Knowledge is Light",
            principal_name="Mrs. W. Gichuru",
            established_year=1988,
            is_active=True,
        )
        db.add(school_info)
        db.flush()

    # --- Academics -----------------------------------------------------------
    year = AcademicYear(
        school_id=school_info.id,
        name="2026",
        start_date=date(2026, 1, 5),
        end_date=date(2026, 11, 27),
        is_current=True,
        status="ACTIVE",
    )
    db.add(year)
    db.flush()
    for name, start, end in (
        ("Term 1", date(2026, 1, 5), date(2026, 4, 2)),
        ("Term 2", date(2026, 5, 4), date(2026, 8, 7)),
        ("Term 3", date(2026, 9, 1), date(2026, 11, 27)),
    ):
        db.add(
            Term(
                academic_year_id=year.id,
                school_id=school_info.id,
                name=name,
                start_date=start,
                end_date=end,
                is_current=name == "Term 2",
                status="ACTIVE",
            )
        )
    for order, (name, code) in enumerate(
        [("Form 1", "F1"), ("Form 2", "F2"), ("Form 3", "F3"), ("Form 4", "F4")], start=1
    ):
        level = Level(
            school_id=school_info.id, name=name, code=code, display_order=order, status=True
        )
        db.add(level)
        db.flush()
        for stream_name in ("A", "B") if name != "Form 4" else ("A",):
            db.add(Stream(level_id=level.id, name=stream_name, capacity=45, status=True))

    # --- Scheduling tenant ----------------------------------------------------
    school = TtSchool(name="Greenfields Secondary School", slug="greenfields")
    db.add(school)
    db.flush()

    for email, role in (
        ("admin@phikila.com", "admin"),
        ("teacher@phikila.com", "teacher"),
        ("student@phikila.com", "student"),
    ):
        db.add(
            TtMembership(
                user_id=email, school_id=school.id, role=role, email=email, is_active=True
            )
        )
    db.add(
        TtPlatformAdmin(
            user_id="admin@phikila.com",
            email="admin@phikila.com",
            is_active=True,
            granted_by="bootstrap",
        )
    )

    # --- Calendar -------------------------------------------------------------
    for index, name in enumerate(DAYS):
        db.add(m.TtDay(school_id=school.id, index=index, name=name, is_active=True))
    for index, (name, start, end, teaching) in enumerate(PERIODS):
        db.add(
            m.TtPeriod(
                school_id=school.id,
                index=index,
                name=name,
                start_time=start,
                end_time=end,
                is_teaching=teaching,
            )
        )

    # --- Resources ------------------------------------------------------------
    teachers = {}
    for name, code, department, per_day, consecutive, unavailable in TEACHERS:
        teacher = m.TtTeacher(
            school_id=school.id,
            name=name,
            code=code,
            department=department,
            max_lessons_per_day=per_day,
            max_consecutive=consecutive,
            workload_target=24,
            unavailable=unavailable,
        )
        db.add(teacher)
        db.flush()
        teachers[code] = teacher

    rooms = {}
    for name, code, building, capacity, room_type in ROOMS:
        room = m.TtRoom(
            school_id=school.id,
            name=name,
            code=code,
            building=building,
            capacity=capacity,
            room_type=room_type,
        )
        db.add(room)
        db.flush()
        rooms[code] = room

    subjects = {}
    for name, code, colour, morning, double, spread, room_type in SUBJECTS:
        subject = m.TtSubject(
            school_id=school.id,
            name=name,
            code=code,
            colour=colour,
            prefers_morning=morning,
            prefers_double=double,
            spread_across_week=spread,
            required_room_type=room_type,
        )
        db.add(subject)
        db.flush()
        subjects[code] = subject

    classes = {}
    for name, code, grade, count in CLASSES:
        klass = m.TtClass(
            school_id=school.id,
            name=name,
            code=code,
            grade=grade,
            student_count=count,
            home_room_id=rooms["R01"].id,
        )
        db.add(klass)
        db.flush()
        classes[code] = klass

    for cls, subject, teacher, periods, doubles, room in REQUIREMENTS:
        db.add(
            m.TtLessonRequirement(
                school_id=school.id,
                class_id=classes[cls].id,
                subject_id=subjects[subject].id,
                teacher_id=teachers[teacher].id,
                room_id=rooms[room].id if room else None,
                periods_per_week=periods,
                double_periods=doubles,
            )
        )

    # Link membership rows to their timetable counterparts.
    teacher_member = (
        db.query(TtMembership).filter(TtMembership.user_id == "teacher@phikila.com").first()
    )
    teacher_member.teacher_id = teachers["T001"].id
    student_member = (
        db.query(TtMembership).filter(TtMembership.user_id == "student@phikila.com").first()
    )
    student_member.class_id = classes["F3A"].id

    db.commit()
    print("Seeded school:", school.name, f"(school_id={school.id})")
    return True


def generate(db) -> None:
    """Run the real CP-SAT engine through the production job queue."""
    school = db.query(TtSchool).first()
    if school is None:
        return

    existing = (
        db.query(m.TtVersion).filter(m.TtVersion.school_id == school.id).first()
    )
    if existing:
        print("A timetable version already exists; skipping generation.")
        return

    job = job_queue.create_job(db, school.id, "admin@phikila.com")
    job_queue.enqueue(job.id, school.id, max_seconds=120.0)
    print(f"Started solver job #{job.id}…")

    for _ in range(120):
        db.expire_all()
        job = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job.id).first()
        if not job:
            print("Job vanished unexpectedly.")
            return
        if job.status in {"completed", "failed", "cancelled"}:
            break
        time.sleep(1)
    else:
        print("Timed out waiting for the solver.")
        return

    db.expire_all()
    job = db.query(m.TtSolverJob).filter(m.TtSolverJob.id == job.id).first()
    print(f"Job finished: {job.status} — {job.stage}")
    if job.message:
        print("  message:", job.message)
    if job.quality:
        print("  quality:", job.quality.get("overall"), "/100")
    if job.status == "completed":
        lessons = (
            db.query(m.TtLesson)
            .join(m.TtVersion)
            .filter(m.TtVersion.id == job.result_version_id)
            .count()
        )
        print(f"  placed {lessons} lessons in version #{job.result_version_id}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-solve", action="store_true", help="skip timetable generation")
    args = parser.parse_args()

    # Local development shortcut: create the schema when no tables exist yet.
    # Production always uses `alembic upgrade head` on PostgreSQL instead.
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if seed(db) and not args.no_solve:
            generate(db)
    finally:
        db.close()

    print("\nDemo logins (password:", DEMO_PASSWORD + "):")
    print("  admin@phikila.com   — school + platform admin")
    print("  teacher@phikila.com — teacher (Mr. Kamau)")
    print("  student@phikila.com — student (Form 3A)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
