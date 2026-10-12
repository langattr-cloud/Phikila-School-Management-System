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
        # Setup can be retried after access is granted, a page refresh, or a
        # transient network error. The platform school ID is the stable tenant
        # key, so an existing profile must be reused without overwriting it.
        existing_school = self.repository.get_school(school_id)
        if existing_school:
            return existing_school

        existing_code = self.repository.get_school_by_code(school_data.code)
        if existing_code and existing_code.id != school_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A school with this code already exists.",
            )
        try:
            return self.repository.create_school(school_id, school_data)
        except Exception as exc:
            # Another request may have completed setup between our initial
            # lookup and insert. Roll back, then reuse that committed profile.
            # If this was a different conflict or database failure, preserve it.
            self.repository.db.rollback()
            existing_school = self.repository.get_school(school_id)
            if existing_school:
                return existing_school
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
