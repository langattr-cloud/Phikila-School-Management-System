from sqlalchemy.orm import Session
from app.modules.academics import models, schemas


class AcademicYearRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self, school_id: int):
        return self.db.query(models.AcademicYear).filter(models.AcademicYear.school_id == school_id).all()

    def get_by_id(self, school_id: int, year_id: int):
        return self.db.query(models.AcademicYear).filter(models.AcademicYear.school_id == school_id, models.AcademicYear.id == year_id).first()

    def create(self, school_id: int, data: schemas.AcademicYearCreate):
        db_year = models.AcademicYear(**data.model_dump(), school_id=school_id)
        self.db.add(db_year)
        self.db.commit()
        self.db.refresh(db_year)
        return db_year


class TermRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_terms(self, school_id: int):
        return self.db.query(models.Term).filter(models.Term.school_id == school_id).all()

    def get_term_by_id(self, school_id: int, term_id: int):
        return self.db.query(models.Term).filter(models.Term.school_id == school_id, models.Term.id == term_id).first()

    def create_term(self, school_id: int, data: schemas.TermCreate):
        db_term = models.Term(name=data.name, start_date=data.start_date, end_date=data.end_date, is_current=data.is_current, academic_year_id=data.academic_year_id, school_id=school_id)
        self.db.add(db_term)
        self.db.commit()
        self.db.refresh(db_term)
        return db_term


class LevelRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_levels(self, school_id: int):
        return self.db.query(models.Level).filter(models.Level.school_id == school_id).all()

    def get_level_by_id(self, school_id: int, level_id: int):
        return self.db.query(models.Level).filter(models.Level.school_id == school_id, models.Level.id == level_id).first()

    def get_level_by_code(self, school_id: int, code: str):
        return self.db.query(models.Level).filter(models.Level.school_id == school_id, models.Level.code == code).first()

    def create_level(self, school_id: int, data: schemas.LevelCreate):
        db_level = models.Level(name=data.name, code=data.code, display_order=data.display_order, status=data.status, school_id=school_id)
        self.db.add(db_level)
        self.db.commit()
        self.db.refresh(db_level)
        return db_level


class StreamRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_streams(self, school_id: int, level_id: int):
        return self.db.query(models.Stream).filter(models.Stream.school_id == school_id, models.Stream.level_id == level_id).order_by(models.Stream.name).all()

    def get_stream_by_id(self, school_id: int, stream_id: int):
        return self.db.query(models.Stream).filter(models.Stream.school_id == school_id, models.Stream.id == stream_id).first()

    def get_stream_by_name_and_level(self, school_id: int, level_id: int, name: str):
        return self.db.query(models.Stream).filter(models.Stream.school_id == school_id, models.Stream.level_id == level_id, models.Stream.name == name).first()

    def create_stream(self, school_id: int, data: schemas.StreamCreate):
        db_stream = models.Stream(name=data.name.strip(), code=data.code.strip() if data.code else None, capacity=data.capacity, status=data.status, level_id=data.level_id, school_id=school_id)
        self.db.add(db_stream)
        self.db.commit()
        self.db.refresh(db_stream)
        return db_stream

    def update_stream(self, stream: models.Stream, data: schemas.StreamUpdate):
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(stream, key, value.strip() if isinstance(value, str) else value)
        self.db.commit()
        self.db.refresh(stream)
        return stream
