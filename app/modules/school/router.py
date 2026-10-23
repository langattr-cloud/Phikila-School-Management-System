from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.modules.school import schemas, services
from app.modules.platform.tenancy import Principal, require_role

router = APIRouter(tags=["School Profile"])


@router.post("", response_model=schemas.SchoolResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
@router.post("/", response_model=schemas.SchoolResponse, status_code=status.HTTP_201_CREATED)
def create_school_profile(
    school_data: schemas.SchoolCreate,
    principal: Principal = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return services.SchoolService(db).create_school_profile(principal.school_id, school_data)


@router.get("/", response_model=schemas.SchoolResponse)
def get_school_profile(
    principal: Principal = Depends(require_role("viewer", "teacher", "admin")),
    db: Session = Depends(get_db),
):
    return services.SchoolService(db).get_school_profile(principal.school_id)


@router.patch("", response_model=schemas.SchoolResponse, include_in_schema=False)
@router.patch("/", response_model=schemas.SchoolResponse)
def update_school_profile(
    school_update: schemas.SchoolUpdate,
    principal: Principal = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return services.SchoolService(db).update_school_profile(principal.school_id, school_update)


@router.patch("/settings", response_model=schemas.SchoolSettingsResponse)
def update_school_settings(
    settings_update: schemas.SchoolSettingsUpdate,
    principal: Principal = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return services.SchoolService(db).update_school_settings(principal.school_id, settings_update)


@router.patch("/branding", response_model=schemas.SchoolBrandingResponse)
def update_school_branding(
    branding_update: schemas.SchoolBrandingUpdate,
    principal: Principal = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return services.SchoolService(db).update_school_branding(principal.school_id, branding_update)


@router.patch("/contact", response_model=schemas.SchoolContactResponse)
def update_school_contact(
    contact_update: schemas.SchoolContactUpdate,
    principal: Principal = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return services.SchoolService(db).update_school_contact(principal.school_id, contact_update)
