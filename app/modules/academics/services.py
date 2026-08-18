from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.modules.academics import models, schemas
from app.modules.academics.repository import AcademicYearRepository, LevelRepository, StreamRepository, TermRepository


class AcademicYearService:
    def __init__(self, db: Session): self.repository = AcademicYearRepository(db)
    def get_academic_years(self, school_id: int): return self.repository.get_all(school_id)
    def get_academic_year_by_id(self, school_id: int, year_id: int):
        year = self.repository.get_by_id(school_id, year_id)
        if not year: raise HTTPException(status.HTTP_404_NOT_FOUND, "Academic year not found")
        return year
    def create_academic_year(self, school_id: int, data: schemas.AcademicYearCreate): return self.repository.create(school_id, data)


class TermService:
    def __init__(self, db: Session): self.repository = TermRepository(db)
    def get_terms(self, school_id: int): return self.repository.get_terms(school_id)
    def get_term_by_id(self, school_id: int, term_id: int):
        term = self.repository.get_term_by_id(school_id, term_id)
        if not term: raise HTTPException(status.HTTP_404_NOT_FOUND, "Term not found")
        return term
    def create_term(self, school_id: int, data: schemas.TermCreate): return self.repository.create_term(school_id, data)


class LevelService:
    def __init__(self, db: Session): self.repository = LevelRepository(db)
    def get_levels(self, school_id: int): return self.repository.get_levels(school_id)
    def get_level_by_id(self, school_id: int, level_id: int):
        level = self.repository.get_level_by_id(school_id, level_id)
        if not level: raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
        return level
    def create_level(self, school_id: int, data: schemas.LevelCreate):
        existing = self.repository.get_level_by_code(school_id, data.code)
        if existing: raise HTTPException(status.HTTP_400_BAD_REQUEST, "Grade with this code already exists within the school.")
        return self.repository.create_level(school_id, data)


class StreamService:
    def __init__(self, db: Session): self.repository = StreamRepository(db)

    def _get_grade(self, school_id: int, level_id: int):
        grade = self.repository.db.query(models.Level).filter(models.Level.id == level_id, models.Level.school_id == school_id).first()
        if not grade: raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
        return grade

    def get_streams(self, school_id: int, level_id: int):
        self._get_grade(school_id, level_id)
        return self.repository.get_streams(school_id, level_id)

    def get_stream_by_id(self, school_id: int, stream_id: int):
        stream = self.repository.get_stream_by_id(school_id, stream_id)
        if not stream: raise HTTPException(status.HTTP_404_NOT_FOUND, "Stream not found")
        return stream

    def create_stream(self, school_id: int, data: schemas.StreamCreate):
        self._get_grade(school_id, data.level_id)
        if self.repository.get_stream_by_name_and_level(school_id, data.level_id, data.name.strip()):
            raise HTTPException(status.HTTP_409_CONFLICT, "A stream with this name already exists in this grade.")
        return self.repository.create_stream(school_id, data)

    def update_stream(self, school_id: int, stream_id: int, data: schemas.StreamUpdate):
        stream = self.get_stream_by_id(school_id, stream_id)
        if data.name:
            duplicate = self.repository.get_stream_by_name_and_level(school_id, stream.level_id, data.name.strip())
            if duplicate and duplicate.id != stream.id:
                raise HTTPException(status.HTTP_409_CONFLICT, "A stream with this name already exists in this grade.")
        return self.repository.update_stream(stream, data)
