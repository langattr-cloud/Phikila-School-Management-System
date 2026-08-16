"""Seed script — creates base working days and lesson periods."""

from sqlalchemy.orm import Session

from app.core.database import Base, engine, SessionLocal
from app.models.models import WorkingDay, LessonPeriod


def seed_working_days(db: Session) -> None:
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    existing = {d.day_name for d in db.query(WorkingDay).all()}
    for idx, day in enumerate(days):
        if day not in existing:
            db.add(WorkingDay(id=idx + 1, day_name=day))
    db.commit()


def seed_lesson_periods(db: Session) -> None:
    periods = [
        ("Period 1", "08:00", "08:45"),
        ("Period 2", "08:50", "09:35"),
        ("Period 3", "09:40", "10:25"),
        ("Period 4", "10:45", "11:30"),
        ("Period 5", "11:35", "12:20"),
        ("Period 6", "12:25", "13:10"),
        ("Period 7", "13:20", "14:05"),
        ("Period 8", "14:10", "14:55"),
    ]
    existing = {p.period_name for p in db.query(LessonPeriod).all()}
    for idx, (name, start, end) in enumerate(periods, start=1):
        if name not in existing:
            db.add(
                LessonPeriod(
                    id=idx,
                    period_name=name,
                    start_time=start,
                    end_time=end,
                )
            )
    db.commit()


def main() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_working_days(db)
        seed_lesson_periods(db)
        print("✓ Seed complete: 7 working days, 8 lesson periods")
    finally:
        db.close()


if __name__ == "__main__":
    main()
