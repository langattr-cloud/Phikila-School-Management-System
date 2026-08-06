from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.modules.school.repository import SchoolRepository
from app.modules.school import schemas, models

class SchoolService:
    def __init__(self, db: Session):
        self.repository = SchoolRepository(db)

    def get_school_profile(self) -> models.SchoolInfo:
        school = self.repository.get_school()
        if not school:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="School profile not configured yet."
            )
        return school

    def create_school_profile(self, school_data: schemas.SchoolCreate) -> models.SchoolInfo:
        existing_school = self.repository.get_school()
        if existing_school:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="School profile already exists. Use update instead."
            )
        
        # Check if code is already taken
        if self.repository.get_school_by_code(school_data.code):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A school with this code already exists."
            )

        return self.repository.create_school(school_data)

    def update_school_profile(self, school_update: schemas.SchoolUpdate) -> models.SchoolInfo:
        school = self.get_school_profile()
        return self.repository.update_school(school, school_update)

    def update_school_settings(self, settings_update: schemas.SchoolSettingsUpdate) -> models.SchoolSettings:
        school = self.get_school_profile()
        settings = self.repository.get_settings(school.id)
        if not settings:
            raise HTTPException(status_code=404, detail="School settings not found.")
        return self.repository.update_settings(settings, settings_update)

    def update_school_branding(self, branding_update: schemas.SchoolBrandingUpdate) -> models.SchoolBranding:
        school = self.get_school_profile()
        branding = self.repository.get_branding(school.id)
        if not branding:
            raise HTTPException(status_code=404, detail="School branding not found.")
        return self.repository.update_branding(branding, branding_update)

    def update_school_contact(self, contact_update: schemas.SchoolContactUpdate) -> models.SchoolContact:
        school = self.get_school_profile()
        contact = self.repository.get_contact(school.id)
        if not contact:
            raise HTTPException(status_code=404, detail="School contact info not found.")
        return self.repository.update_contact(contact, contact_update)