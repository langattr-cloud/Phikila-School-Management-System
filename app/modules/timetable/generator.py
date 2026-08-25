"""Compatibility entry points for the production scheduling engine.

The active generator is ``app.modules.scheduling``. These legacy routes are
kept so older clients still work, but they now translate class-register data
into the scheduling model and invoke the same constraint-aware solver.
"""
from sqlalchemy.orm import Session
from app.modules.academics.models import Grade, Stream
from app.modules.class_register.models import ClassRegister
from app.modules.scheduling import jobs as scheduling_jobs
from app.modules.scheduling import models as m


class TimetableGenerator:
    def __init__(self, db: Session):
        self.db = db

    def _sync_class_register(self, register: ClassRegister) -> tuple[int, int]:
        stream = self.db.query(Stream).filter(Stream.id == register.stream_id).first()
        grade = self.db.query(Grade).filter(Grade.id == register.grade_form_id).first()
        if stream is None or grade is None:
            raise ValueError(f"Class register {register.id} is missing its grade or stream academic structure.")

        school_id = int(stream.school_id)
        code = f"STREAM-{stream.id}"
        stream_name = (stream.name or stream.code or '').strip()
        name = f"{grade.name} — {stream_name}" if stream_name else grade.name
        row = self.db.query(m.TtClass).filter(m.TtClass.school_id == school_id, m.TtClass.code == code).first()
        if row is None:
            row = m.TtClass(school_id=school_id,name=name,code=code,grade=grade.name,stream=stream_name,student_count=register.capacity or 40,class_teacher_id=register.class_teacher_id)
            self.db.add(row)
        else:
            row.name=name; row.grade=grade.name; row.stream=stream_name; row.student_count=register.capacity or row.student_count or 40; row.class_teacher_id=register.class_teacher_id
        self.db.commit(); self.db.refresh(row)
        return school_id, row.id

    def _run(self, school_id: int) -> dict:
        job=scheduling_jobs.create_job(self.db,school_id,"legacy-timetable-route")
        scheduling_jobs.enqueue(job.id,school_id,30.0)
        self.db.expire_all()
        job=self.db.query(m.TtSolverJob).filter(m.TtSolverJob.id==job.id).first()
        if job is None: raise RuntimeError("Timetable generation job disappeared.")
        if job.status != "completed": raise RuntimeError(job.message or "Timetable generation failed.")
        return {"status":"Generated","message":"Timetable generated successfully.","job_id":job.id,"version_id":job.result_version_id}

    def generate_for_class(self, class_register_id: int, academic_year_id: int) -> dict:
        register=self.db.query(ClassRegister).filter(ClassRegister.id==class_register_id,ClassRegister.academic_year_id==academic_year_id).first()
        if register is None: raise ValueError(f"Class register {class_register_id} was not found for academic year {academic_year_id}.")
        school_id,_=self._sync_class_register(register)
        result=self._run(school_id); result["class_register_id"]=class_register_id; return result

    def generate_school_wide(self, academic_year_id: int) -> list[dict]:
        registers=self.db.query(ClassRegister).filter(ClassRegister.academic_year_id==academic_year_id,ClassRegister.status=="Active").order_by(ClassRegister.id).all()
        if not registers: return []
        school_id=None
        for register in registers:
            school_id,_=self._sync_class_register(register)
        return [self._run(int(school_id))]
