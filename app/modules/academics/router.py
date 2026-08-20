from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, ROLE_ORDER
from app.modules.platform.authz import Identity, require_active_access, resolve_identity
from app.modules.academics import schemas, services
from app.modules.students import models_v2 as student_models

router = APIRouter(tags=["Academics"])


def require_academic_role(*roles: str):
    """Authorize academic actions without changing the global tenant resolver.

    Platform Super Admin authority is evaluated by the platform authorization
    layer, but school membership remains mandatory. This keeps the academic
    module's write permissions aligned with platform access without changing
    authorization behavior for unrelated modules.
    """
    minimum = min(roles, key=lambda role: ROLE_ORDER.index(role))

    def dependency(
        identity: Identity = Depends(resolve_identity),
    ) -> Principal:
        school_id = identity.primary_school_id
        if school_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Your account is not linked to a school yet.",
            )
        if not identity.has_school_role(school_id, minimum):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You do not have permission to make this change.",
            )
        return Principal(
            user_id=identity.user_id,
            email=identity.email,
            school_id=school_id,
            role="super_admin" if identity.is_super_admin else identity.memberships[school_id],
        )

    return dependency


@router.get("/years", response_model=List[schemas.AcademicYearResponse])
def get_academic_years(principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.AcademicYearService(db).get_academic_years(principal.school_id)
@router.get("/years/{year_id}", response_model=schemas.AcademicYearResponse)
def get_academic_year(year_id: int, principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.AcademicYearService(db).get_academic_year_by_id(principal.school_id, year_id)
@router.post("/years", response_model=schemas.AcademicYearResponse, status_code=status.HTTP_201_CREATED)
def create_academic_year(data: schemas.AcademicYearCreate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.AcademicYearService(db).create_academic_year(principal.school_id, data)
@router.patch("/years/{year_id}", response_model=schemas.AcademicYearResponse)
def update_academic_year(year_id: int, data: schemas.AcademicYearUpdate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.AcademicYearService(db).update_academic_year(principal.school_id, year_id, data)
@router.get("/terms", response_model=List[schemas.TermResponse])
def get_terms(principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.TermService(db).get_terms(principal.school_id)
@router.get("/terms/{term_id}", response_model=schemas.TermResponse)
def get_term(term_id: int, principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.TermService(db).get_term_by_id(principal.school_id, term_id)
@router.post("/terms", response_model=schemas.TermResponse, status_code=status.HTTP_201_CREATED)
def create_term(data: schemas.TermCreate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.TermService(db).create_term(principal.school_id, data)

@router.get("/levels", response_model=List[schemas.LevelResponse])
def get_levels(principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.LevelService(db).get_levels(principal.school_id)
@router.get("/levels/{level_id}", response_model=schemas.LevelResponse)
def get_level(level_id: int, principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.LevelService(db).get_level_by_id(principal.school_id, level_id)
@router.post("/levels", response_model=schemas.LevelResponse, status_code=status.HTTP_201_CREATED)
def create_level(data: schemas.LevelCreate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.LevelService(db).create_level(principal.school_id, data)
@router.patch("/levels/{level_id}", response_model=schemas.LevelResponse)
def update_level(level_id: int, data: schemas.LevelUpdate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.LevelService(db).update_level(principal.school_id, level_id, data)

@router.get("/grades", response_model=List[schemas.GradeResponse])
def get_grades(level_id: Optional[int] = None, principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.GradeService(db).list(principal.school_id, level_id)
@router.get("/grades/{grade_id}", response_model=schemas.GradeResponse)
def get_grade(grade_id: int, principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.GradeService(db).get(principal.school_id, grade_id)
@router.post("/grades", response_model=schemas.GradeResponse, status_code=status.HTTP_201_CREATED)
def create_grade(data: schemas.GradeCreate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.GradeService(db).create(principal.school_id, data)
@router.patch("/grades/{grade_id}", response_model=schemas.GradeResponse)
def update_grade(grade_id: int, data: schemas.GradeUpdate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.GradeService(db).update(principal.school_id, grade_id, data)

@router.get("/years/{academic_year_id}/grades/{grade_id}/streams", response_model=List[schemas.StreamResponse])
def get_streams(academic_year_id: int, grade_id: int, principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.StreamService(db).get_streams(principal.school_id, academic_year_id, grade_id)
@router.get("/streams/{stream_id}", response_model=schemas.StreamResponse)
def get_stream(stream_id: int, principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)): return services.StreamService(db).get_stream_by_id(principal.school_id, stream_id)
@router.post("/streams", response_model=schemas.StreamResponse, status_code=status.HTTP_201_CREATED)
def create_stream(data: schemas.StreamCreate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.StreamService(db).create_stream(principal.school_id, data)
@router.patch("/streams/{stream_id}", response_model=schemas.StreamResponse)
def update_stream(stream_id: int, data: schemas.StreamUpdate, principal: Principal = Depends(require_academic_role("admin")), db: Session = Depends(get_db)): return services.StreamService(db).update_stream(principal.school_id, stream_id, data)

@router.get("/streams/{stream_id}/students", response_model=List[schemas.StreamStudentResponse])
def list_stream_students(stream_id: int, principal: Principal = Depends(require_academic_role("viewer", "teacher", "admin")), db: Session = Depends(get_db)):
    stream = services.StreamService(db).get_stream_by_id(principal.school_id, stream_id)
    return db.query(student_models.Student).filter(student_models.Student.school_id == principal.school_id, student_models.Student.stream_id == stream.id).order_by(student_models.Student.last_name, student_models.Student.first_name).all()

@router.post("/streams/{stream_id}/students", response_model=schemas.StreamStudentResponse)
def assign_student_to_stream(stream_id: int, data: schemas.StreamAssignment, principal: Principal = Depends(require_academic_role("admin", "scheduler")), db: Session = Depends(get_db)):
    stream = services.StreamService(db).get_stream_by_id(principal.school_id, stream_id)
    student = db.query(student_models.Student).filter(student_models.Student.id == data.student_id, student_models.Student.school_id == principal.school_id).first()
    if not student: raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")
    if stream.status != "ACTIVE": raise HTTPException(status.HTTP_409_CONFLICT, "Cannot assign a student to an inactive stream")
    student.level_id = stream.level_id
    student.grade_id = stream.grade_id
    student.stream_id = stream.id
    enrollment = db.query(student_models.StudentEnrollment).filter(student_models.StudentEnrollment.school_id == principal.school_id, student_models.StudentEnrollment.student_id == student.id, student_models.StudentEnrollment.academic_year_id == stream.academic_year_id).first()
    if enrollment:
        if enrollment.status == "active" and enrollment.stream_id not in (None, stream.id): raise HTTPException(status.HTTP_409_CONFLICT, "Student already has an active enrollment in this academic year.")
        enrollment.level_id = stream.level_id; enrollment.grade_id = stream.grade_id; enrollment.stream_id = stream.id; enrollment.status = "active"
    else:
        db.add(student_models.StudentEnrollment(school_id=principal.school_id, student_id=student.id, academic_year_id=stream.academic_year_id, level_id=stream.level_id, grade_id=stream.grade_id, stream_id=stream.id, status="active"))
    db.commit(); db.refresh(student); return student
