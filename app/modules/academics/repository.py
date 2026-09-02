from sqlalchemy.orm import Session
from sqlalchemy import Integer, cast, func
from app.modules.academics import models, schemas

class AcademicYearRepository:
    def __init__(self, db: Session): self.db = db
    def get_all(self, school_id: int): return self.db.query(models.AcademicYear).filter(models.AcademicYear.school_id == school_id).order_by(models.AcademicYear.name.desc()).all()
    def get_by_id(self, school_id: int, year_id: int): return self.db.query(models.AcademicYear).filter(models.AcademicYear.school_id == school_id, models.AcademicYear.id == year_id).first()
    def create(self, school_id: int, data: schemas.AcademicYearCreate):
        if data.is_current: self.db.query(models.AcademicYear).filter(models.AcademicYear.school_id == school_id).update({models.AcademicYear.is_current: False})
        db_year = models.AcademicYear(**data.model_dump(), school_id=school_id); self.db.add(db_year); self.db.commit(); self.db.refresh(db_year); return db_year
    def update(self, year: models.AcademicYear, data: schemas.AcademicYearUpdate):
        for key, value in data.model_dump(exclude_unset=True).items(): setattr(year, key, value.strip() if isinstance(value, str) else value)
        self.db.commit(); self.db.refresh(year); return year

class TermRepository:
    def __init__(self, db: Session): self.db = db
    def get_terms(self, school_id: int):
        rows = self.db.query(models.Term).filter(models.Term.school_id == school_id).order_by(
            models.Term.academic_year_id, models.Term.start_date, models.Term.id
        ).all()
        unique = {}
        for term in rows:
            key = (int(term.academic_year_id), term.name.strip().casefold())
            unique.setdefault(key, term)
        return list(unique.values())
    def get_term_by_id(self, school_id: int, term_id: int): return self.db.query(models.Term).filter(models.Term.school_id == school_id, models.Term.id == term_id).first()
    def get_term_by_name(self, school_id: int, academic_year_id: int, name: str):
        normalized = name.strip().casefold()
        return self.db.query(models.Term).filter(
            models.Term.school_id == school_id,
            models.Term.academic_year_id == academic_year_id,
            func.lower(func.trim(models.Term.name)) == normalized,
        ).first()
    def create_term(self, school_id: int, data: schemas.TermCreate):
        db_term = models.Term(name=data.name.strip(), start_date=data.start_date, end_date=data.end_date, is_current=data.is_current, academic_year_id=data.academic_year_id, school_id=school_id); self.db.add(db_term); self.db.commit(); self.db.refresh(db_term); return db_term
    def update_term(self, term: models.Term, data: schemas.TermUpdate):
        for key, value in data.model_dump(exclude_unset=True).items(): setattr(term, key, value.strip() if isinstance(value, str) else value)
        self.db.commit(); self.db.refresh(term); return term

class LevelRepository:
    def __init__(self, db: Session): self.db = db
    def get_levels(self, school_id: int): return self.db.query(models.Level).filter(models.Level.school_id == school_id).order_by(models.Level.display_order).all()
    def get_level_by_id(self, school_id: int, level_id: int): return self.db.query(models.Level).filter(models.Level.school_id == school_id, models.Level.id == level_id).first()
    def get_level_by_code(self, school_id: int, code: str): return self.db.query(models.Level).filter(models.Level.school_id == school_id, models.Level.code == code).first()
    def create_level(self, school_id: int, data: schemas.LevelCreate):
        status = "ACTIVE" if data.status is not False else "INACTIVE"
        db_level = models.Level(name=data.name.strip(), code=data.code.strip(), display_order=data.display_order, status=status, school_id=school_id); self.db.add(db_level); self.db.commit(); self.db.refresh(db_level); return db_level
    def update_level(self, level: models.Level, data: schemas.LevelUpdate):
        values = data.model_dump(exclude_unset=True)
        if "status" in values: values["status"] = "ACTIVE" if values["status"] is not False else "INACTIVE"
        for key, value in values.items(): setattr(level, key, value.strip() if isinstance(value, str) else value)
        self.db.commit(); self.db.refresh(level); return level

class GradeRepository:
    def __init__(self, db: Session): self.db = db
    def get_all(self, school_id: int, level_id: int | None = None):
        q = self.db.query(models.Grade).filter(models.Grade.school_id == school_id)
        if level_id is not None: q = q.filter(models.Grade.level_id == level_id)
        numeric_text = func.nullif(func.regexp_replace(models.Grade.name, r'[^0-9]', '', 'g'), '')
        numeric_grade = cast(numeric_text, Integer)
        return q.order_by(numeric_grade.nulls_last(), models.Grade.name).all()
    def get_by_id(self, school_id: int, grade_id: int): return self.db.query(models.Grade).filter(models.Grade.school_id == school_id, models.Grade.id == grade_id).first()
    def get_by_code(self, school_id: int, level_id: int, code: str): return self.db.query(models.Grade).filter(models.Grade.school_id == school_id, models.Grade.level_id == level_id, models.Grade.code == code).first()
    def create(self, school_id: int, data: schemas.GradeCreate):
        db_grade = models.Grade(name=data.name.strip(), code=data.code.strip(), level_id=data.level_id, status=data.status, school_id=school_id); self.db.add(db_grade); self.db.commit(); self.db.refresh(db_grade); return db_grade
    def update(self, grade: models.Grade, data: schemas.GradeUpdate):
        for key, value in data.model_dump(exclude_unset=True).items(): setattr(grade, key, value.strip() if isinstance(value, str) else value)
        self.db.commit(); self.db.refresh(grade); return grade

class StreamRepository:
    def __init__(self, db: Session): self.db = db
    def get_streams(self, school_id: int, academic_year_id: int, grade_id: int):
        return self.db.query(models.Stream).filter(models.Stream.school_id == school_id, models.Stream.academic_year_id == academic_year_id, models.Stream.grade_id == grade_id).order_by(models.Stream.id).all()
    def get_stream_by_id(self, school_id: int, stream_id: int): return self.db.query(models.Stream).filter(models.Stream.school_id == school_id, models.Stream.id == stream_id).first()
    def get_stream_by_name_context(self, school_id: int, academic_year_id: int, grade_id: int, name: str): return self.db.query(models.Stream).filter(models.Stream.school_id == school_id, models.Stream.academic_year_id == academic_year_id, models.Stream.grade_id == grade_id, models.Stream.name == name).first()
    def create_stream(self, school_id: int, data: schemas.StreamCreate):
        db_stream = models.Stream(name=data.name.strip(), code=data.code.strip() if data.code else None, status=data.status, academic_year_id=data.academic_year_id, level_id=data.level_id, grade_id=data.grade_id, school_id=school_id)
        self.db.add(db_stream); self.db.commit(); self.db.refresh(db_stream); return db_stream
    def create_streams_bulk(self, school_id: int, data: schemas.BulkStreamCreate):
        streams = [models.Stream(name=item.name.strip(), code=item.code.strip() if item.code else None, status=item.status, academic_year_id=data.academic_year_id, level_id=data.level_id, grade_id=data.grade_id, school_id=school_id) for item in data.streams]
        self.db.add_all(streams); self.db.flush()
        for stream in streams: self.db.refresh(stream)
        self.db.commit(); return streams
    def update_stream(self, stream: models.Stream, data: schemas.StreamUpdate):
        for key, value in data.model_dump(exclude_unset=True).items(): setattr(stream, key, value.strip() if isinstance(value, str) else value)
        self.db.commit(); self.db.refresh(stream); return stream