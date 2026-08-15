from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.school import schemas, services

router = APIRouter(tags=["School Profile"])

@router.post("/", response_model=schemas.SchoolResponse, status_code=status.HTTP_201_CREATED)
def create_school_profile(school_data: schemas.SchoolCreate, db: Session = Depends(get_db)):
    service = services.SchoolService(db)
    return service.create_school_profile(school_data)

@router.get("/", response_model=schemas.SchoolResponse)
def get_school_profile(db: Session = Depends(get_db)):
    service = services.SchoolService(db)
    return service.get_school_profile()

@router.patch("/", response_model=schemas.SchoolResponse)
def update_school_profile(school_update: schemas.SchoolUpdate, db: Session = Depends(get_db)):
    service = services.SchoolService(db)
    return service.update_school_profile(school_update)

@router.patch("/settings", response_model=schemas.SchoolSettingsResponse)
def update_school_settings(settings_update: schemas.SchoolSettingsUpdate, db: Session = Depends(get_db)):
    service = services.SchoolService(db)
    return service.update_school_settings(settings_update)

@router.patch("/branding", response_model=schemas.SchoolBrandingResponse)
def update_school_branding(branding_update: schemas.SchoolBrandingUpdate, db: Session = Depends(get_db)):
    service = services.SchoolService(db)
    return service.update_school_branding(branding_update)

@router.patch("/contact", response_model=schemas.SchoolContactResponse)
def update_school_contact(contact_update: schemas.SchoolContactUpdate, db: Session = Depends(get_db)):
    service = services.SchoolService(db)
    return service.update_school_contact(contact_update)

@router.get("/", response_model=schemas.SchoolResponse, operation_id="fetch_single_school_profile")
def get_school_profile(db: Session = Depends(get_db)):
    service = services.SchoolService(db)
    profile = service.get_school_profile()
    if not profile:
        raise HTTPException(status_code=404, detail="School profile not found. Please create one.")
    return profile