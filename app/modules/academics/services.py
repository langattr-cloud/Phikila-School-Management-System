from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.modules.academics.repository import AcademicYearRepository, TermRepository
from app.modules.academics import schemas


class AcademicYearService:
    def __init__(self, db: Session):
        self.repository = AcademicYearRepository(db)

    def get_academic_years(self, school_id: int):
        return self.repository.get_all(school_id)

    def get_academic_year_by_id(self, school_id: int, year_id: int):
        year = self.repository.get_by_id(school_id, year_id)
        if not year:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Academic year not found"
            )
        return year

    def create_academic_year(self, school_id: int, data: schemas.AcademicYearCreate):
        return self.repository.create(school_id, data)


class TermService:
    def __init__init_(self, db: Session):
        self.repository = TermRepository(db)

    def get_terms(self, school_id: int):
        return self.repository.get_terms(school_id)

    def get_term_by_id(self, school_id: int, term_id: int):
        term = self.repository.get_term_by_id(school_id, term_id)
        if not term:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Term not found"
            )
        return term

    def create_term(self, school_id: int, data: schemas.TermCreate):
        return self.repository.create_term(school_id, data)

class LevelService:
    def __init__(self, db: Session):
        self.repository = LevelRepository(db)

    def get_levels(self, school_id: int):
        return self.repository.get_levels(school_id)

    def get_level_by_id(self, school_id: int, level_id: int):
        level = self.repository.get_level_by_id(school_id, level_id)
        if not level:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Level not found"
            )
        return level

    def create_level(self, school_id: int, data: schemas.LevelCreate):
        existing = self.repository.get_level_by_code(school_id, data.code)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Level with this code already exists within the school."
            )
        return self.repository.create_level(school_id, data)

class StreamService:
    def _init_(self, db: Session):
        self.repository = StreamRepository(db)

    def get_streams(self, level_id: int):
        return self.repository.get_streams(level_id)

    def get_stream_by_id(self, stream_id: int):
        stream = self.repository.get_stream_by_id(stream_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stream not found"
            )
        return stream

    def create_stream(self, data: schemas.StreamCreate):
        existing = self.repository.get_stream_by_name_and_level(data.level_id, data.name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Stream with this name already exists within this level."
            )
        return self.repository.create_stream(data)