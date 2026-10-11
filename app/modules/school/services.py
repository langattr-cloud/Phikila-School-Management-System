from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.modules.school.repository import SchoolRepository
from app.modules.school import schemas, models


class SchoolService:
    def __init__(self, db: Session):
        self.repository = SchoolRepository(db)

    def get_school_profile(self, school_id: int) -> models.SchoolInfo:
        school = self.repository.get_school(school_id)
        if not school:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="School profile not configured yet. Please create this school's profile.",
            )
        return school

    def create_school_profile(self, school_id: int, school_data: schemas.SchoolCreate) -> models.SchoolInfo:
        if self.repository.get_school(school_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This school's profile already exists. Use update instead.",
            )

        existing_code = self.repository.get_school_by_code(school_data.code)
        if existing_code and existing_code.id != school_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A school with this code already exists.",
            )
        try:
            return self.repository.create_school(school_id, school_data)
        except Exception as exc:
            # Translate unique-key races to a useful conflict without masking unrelated errors.
            self.repository.db.rollback()
            if self.repository.get_school(school_id):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This school's profile already exists. Refresh and update it instead.") from exc
            raise

    def update_school_profile(self, school_id: int, school_update: schemas.SchoolUpdate) -> models.SchoolInfo:
        school = self.get_school_profile(school_id)
        return self.repository.update_school(school, school_update)

    def update_school_settings(self, school_id: int, settings_update: schemas.SchoolSettingsUpdate) -> models.SchoolSettings:
        self.get_school_profile(school_id)
        settings = self.repository.get_settings(school_id)
        if not settings:
            raise HTTPException(status_code=404, detail="School settings not found.")
        return self.repository.update_settings(settings, settings_update)

    def update_school_branding(self, school_id: int, branding_update: schemas.SchoolBrandingUpdate) -> models.SchoolBranding:
        self.get_school_profile(school_id)
        branding = self.repository.get_branding(school_id)
        if not branding:
            raise HTTPException(status_code=404, detail="School branding not found.")
        return self.repository.update_branding(branding, branding_update)

    def update_school_contact(self, school_id: int, contact_update: schemas.SchoolContactUpdate) -> models.SchoolContact:
        self.get_school_profile(school_id)
        contact = self.repository.get_contact(school_id)
        if not contact:
            raise HTTPException(status_code=404, detail="School contact info not found.")
        return self.repository.update_contact(contact, contact_update)
