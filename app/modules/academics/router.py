from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.modules.academics import schemas, services
router = APIRouter(tags=["Academics"])

@router.get("/years", response_model=List[schemas.AcademicYearResponse])
def get_academic_years(school_id: int = 1, db: Session = Depends(get_db)):
    service = services.AcademicYearService(db)
    return service.get_academic_years(school_id)

@router.get("/years/{year_id}", response_model=schemas.AcademicYearResponse)
def get_academic_year(year_id: int, school_id: int = 1, db: Session = Depends(get_db)):
    service = services.AcademicYearService(db)
    return service.get_academic_year_by_id(school_id, year_id)

@router.post("/years", response_model=schemas.AcademicYearResponse, status_code=status.HTTP_201_CREATED)
def create_academic_year(data: schemas.AcademicYearCreate, school_id: int = 1, db: Session = Depends(get_db)):
    service = services.AcademicYearService(db)
    return service.create_academic_year(school_id, data)

# ---------------------------------------------------------
# TERMS
# ---------------------------------------------------------

@router.get("/terms", response_model=List[schemas.TermResponse])
def get_terms(school_id: int = 1, db: Session = Depends(get_db)):
    service = services.TermService(db)
    return service.get_terms(school_id)

@router.get("/terms/{term_id}", response_model=schemas.TermResponse)
def get_term(term_id: int, school_id: int = 1, db: Session = Depends(get_db)):
    service = services.TermService(db)
    return service.get_term_by_id(school_id, term_id)

@router.post("/terms", response_model=schemas.TermResponse, status_code=status.HTTP_201_CREATED)
def create_term(data: schemas.TermCreate, school_id: int = 1, db: Session = Depends(get_db)):
    service = services.TermService(db)
    return service.create_term(school_id, data)

# ---------------------------------------------------------
# LEVELS
# ---------------------------------------------------------

@router.get("/levels", response_model=List[schemas.LevelResponse])
def get_levels(school_id: int = 1, db: Session = Depends(get_db)):
    service = services.LevelService(db)
    return service.get_levels(school_id)

@router.get("/levels/{level_id}", response_model=schemas.LevelResponse)
def get_level(level_id: int, school_id: int = 1, db: Session = Depends(get_db)):
    service = services.LevelService(db)
    return service.get_level_by_id(school_id, level_id)

@router.post("/levels", response_model=schemas.LevelResponse, status_code=status.HTTP_201_CREATED)
def create_level(data: schemas.LevelCreate, school_id: int = 1, db: Session = Depends(get_db)):
    service = services.LevelService(db)
    return service.create_level(school_id, data)

# ---------------------------------------------------------
# STREAMS
# ---------------------------------------------------------

@router.get("/levels/{level_id}/streams", response_model=List[schemas.StreamResponse])
def get_streams(level_id: int, db: Session = Depends(get_db)):
    service = services.StreamService(db)
    return service.get_streams(level_id)

@router.get("/streams/{stream_id}", response_model=schemas.StreamResponse)
def get_stream(stream_id: int, db: Session = Depends(get_db)):
    service = services.StreamService(db)
    return service.get_stream_by_id(stream_id)

@router.post("/streams", response_model=schemas.StreamResponse, status_code=status.HTTP_201_CREATED)
def create_stream(data: schemas.StreamCreate, db: Session = Depends(get_db)):
    service = services.StreamService(db)
    return service.create_stream(data)


