from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.modules.academics import models, schemas
from app.modules.academics.repository import AcademicYearRepository, LevelRepository, GradeRepository, StreamRepository, TermRepository
from app.modules.students import models_v2 as student_models


class AcademicYearService:
    def __init__(self, db: Session): self.repository = AcademicYearRepository(db)
    def get_academic_years(self, school_id): return self.repository.get_all(school_id)
    def get_academic_year_by_id(self, school_id, year_id):
        year = self.repository.get_by_id(school_id, year_id)
        if not year: raise HTTPException(status.HTTP_404_NOT_FOUND, "Academic year not found")
        return year
    def create_academic_year(self, school_id, data): return self.repository.create(school_id, data)
    def update_academic_year(self, school_id, year_id, data):
        year = self.get_academic_year_by_id(school_id, year_id); values = data.model_dump(exclude_unset=True)
        start = values.get("start_date", year.start_date); end = values.get("end_date", year.end_date)
        if start > end: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Academic year start date must be before its end date.")
        if values.get("is_current") is True: self.repository.db.query(models.AcademicYear).filter(models.AcademicYear.school_id == school_id, models.AcademicYear.id != year_id).update({models.AcademicYear.is_current: False})
        return self.repository.update(year, data)

class TermService:
    def __init__(self, db): self.repository = TermRepository(db); self.db = db
    def get_terms(self, school_id): return self.repository.get_terms(school_id)
    def get_term_by_id(self, school_id, term_id):
        term = self.repository.get_term_by_id(school_id, term_id)
        if not term: raise HTTPException(status.HTTP_404_NOT_FOUND, "Term not found")
        return term
    def create_term(self, school_id, data): return self.repository.create_term(school_id, data)
    def update_term(self, school_id, term_id, data):
        term = self.get_term_by_id(school_id, term_id); values = data.model_dump(exclude_unset=True)
        start = values.get("start_date", term.start_date); end = values.get("end_date", term.end_date)
        if start is not None and end is not None and start > end: raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Term start date must be before its end date.")
        if "academic_year_id" in values:
            year = self.db.query(models.AcademicYear).filter(models.AcademicYear.id == values["academic_year_id"], models.AcademicYear.school_id == school_id).first()
            if not year: raise HTTPException(status.HTTP_404_NOT_FOUND, "Academic year not found")
        if values.get("is_current") is True: self.db.query(models.Term).filter(models.Term.school_id == school_id, models.Term.id != term_id).update({models.Term.is_current: False})
        return self.repository.update_term(term, data)

class LevelService:
    def __init__(self, db: Session): self.repository = LevelRepository(db); self.db = db
    def get_levels(self, school_id): return self.repository.get_levels(school_id)
    def get_level_by_id(self, school_id, level_id):
        level = self.repository.get_level_by_id(school_id, level_id)
        if not level: raise HTTPException(status.HTTP_404_NOT_FOUND, "Level not found")
        return level
    def create_level(self, school_id, data):
        code = data.code.strip()
        if self.repository.get_level_by_code(school_id, code): raise HTTPException(status.HTTP_409_CONFLICT, "A level with this code already exists.")
        return self.repository.create_level(school_id, data)
    def update_level(self, school_id, level_id, data):
        level = self.get_level_by_id(school_id, level_id)
        if data.code:
            duplicate = self.repository.get_level_by_code(school_id, data.code.strip())
            if duplicate and duplicate.id != level.id: raise HTTPException(status.HTTP_409_CONFLICT, "A level with this code already exists.")
        return self.repository.update_level(level, data)
    def delete_level(self, school_id, level_id):
        level = self.get_level_by_id(school_id, level_id)
        if self.db.query(models.Grade).filter(models.Grade.school_id == school_id, models.Grade.level_id == level_id).count(): raise HTTPException(status.HTTP_409_CONFLICT, "Cannot delete a level that still contains grades. Delete its grades first.")
        self.db.delete(level); self.db.commit()

class GradeService:
    def __init__(self, db: Session): self.repository = GradeRepository(db); self.db = db
    def list(self, school_id, level_id=None): return self.repository.get_all(school_id, level_id)
    def get(self, school_id, grade_id):
        grade = self.repository.get_by_id(school_id, grade_id)
        if not grade: raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
        return grade
    def create(self, school_id, data):
        level = self.db.query(models.Level).filter(models.Level.id == data.level_id, models.Level.school_id == school_id).first()
        if not level: raise HTTPException(status.HTTP_404_NOT_FOUND, "Level not found")
        if self.repository.get_by_code(school_id, data.level_id, data.code.strip()): raise HTTPException(status.HTTP_409_CONFLICT, "A grade with this code already exists in this level.")
        return self.repository.create(school_id, data)
    def update(self, school_id, grade_id, data):
        grade = self.get(school_id, grade_id)
        if data.code:
            duplicate = self.repository.get_by_code(school_id, grade.level_id, data.code.strip())
            if duplicate and duplicate.id != grade.id: raise HTTPException(status.HTTP_409_CONFLICT, "A grade with this code already exists in this level.")
        return self.repository.update(grade, data)
    def delete(self, school_id, grade_id):
        grade = self.get(school_id, grade_id)
        if self.db.query(models.Stream).filter(models.Stream.school_id == school_id, models.Stream.grade_id == grade_id).count(): raise HTTPException(status.HTTP_409_CONFLICT, "Cannot delete a grade that still contains streams. Delete its streams first.")
        self.db.delete(grade); self.db.commit()

class StreamService:
    def __init__(self, db): self.repository = StreamRepository(db); self.db = db
    def get_streams(self, school_id, academic_year_id, grade_id):
        grade = self.db.query(models.Grade).filter(models.Grade.id == grade_id, models.Grade.school_id == school_id).first()
        if not grade: raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
        return self.repository.get_streams(school_id, academic_year_id, grade_id)
    def get_stream_by_id(self, school_id, stream_id):
        stream = self.repository.get_stream_by_id(school_id, stream_id)
        if not stream: raise HTTPException(status.HTTP_404_NOT_FOUND, "Stream not found")
        return stream
    def create_stream(self, school_id, data):
        year = self.db.query(models.AcademicYear).filter(models.AcademicYear.id == data.academic_year_id, models.AcademicYear.school_id == school_id).first()
        grade = self.db.query(models.Grade).filter(models.Grade.id == data.grade_id, models.Grade.school_id == school_id, models.Grade.level_id == data.level_id).first()
        if not year: raise HTTPException(status.HTTP_404_NOT_FOUND, "Academic year not found")
        if not grade: raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade does not belong to the selected level")
        if self.repository.get_stream_by_name_context(school_id, data.academic_year_id, data.grade_id, data.name.strip()): raise HTTPException(status.HTTP_409_CONFLICT, "A stream with this name already exists for this grade in this academic year.")
        return self.repository.create_stream(school_id, data)
    def create_streams_bulk(self, school_id, data: schemas.BulkStreamCreate):
        year = self.db.query(models.AcademicYear).filter(models.AcademicYear.id == data.academic_year_id, models.AcademicYear.school_id == school_id).first(); grade = self.db.query(models.Grade).filter(models.Grade.id == data.grade_id, models.Grade.school_id == school_id, models.Grade.level_id == data.level_id).first()
        if not year: raise HTTPException(status.HTTP_404_NOT_FOUND, "Academic year not found")
        if not grade: raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade does not belong to the selected level")
        existing = self.db.query(models.Stream).filter(models.Stream.school_id == school_id, models.Stream.academic_year_id == data.academic_year_id, models.Stream.grade_id == data.grade_id).all(); existing_by_name = {s.name.strip().casefold():s for s in existing}; streams=[]
        try:
            for item in data.streams:
                name=item.name.strip(); stream=existing_by_name.get(name.casefold())
                if stream: stream.code=item.code.strip() if item.code else None; stream.status=item.status; stream.level_id=data.level_id
                else: stream=models.Stream(name=name,code=item.code.strip() if item.code else None,status=item.status,academic_year_id=data.academic_year_id,level_id=data.level_id,grade_id=data.grade_id,school_id=school_id); self.db.add(stream); existing_by_name[name.casefold()]=stream
                streams.append(stream)
            self.db.commit()
            for stream in streams:self.db.refresh(stream)
        except IntegrityError: self.db.rollback(); raise HTTPException(status.HTTP_409_CONFLICT, "One or more streams conflict with an existing stream for the same grade and academic year.")
        return streams
    def update_stream(self, school_id, stream_id, data):
        stream = self.get_stream_by_id(school_id, stream_id)
        if data.name:
            duplicate=self.repository.get_stream_by_name_context(school_id,stream.academic_year_id,stream.grade_id,data.name.strip())
            if duplicate and duplicate.id != stream.id: raise HTTPException(status.HTTP_409_CONFLICT,"A stream with this name already exists for this grade in this academic year.")
        return self.repository.update_stream(stream,data)
    def delete(self, school_id, stream_id):
        stream=self.get_stream_by_id(school_id,stream_id)
        if self.db.query(student_models.Student).filter(student_models.Student.school_id==school_id,student_models.Student.stream_id==stream_id).count(): raise HTTPException(status.HTTP_409_CONFLICT,"Cannot delete a stream that still has students assigned. Reassign the students first.")
        self.db.delete(stream); self.db.commit()
