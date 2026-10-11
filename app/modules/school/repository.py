from sqlalchemy.orm import Session
from app.modules.school import models, schemas


class SchoolRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_school(self, school_id: int) -> models.SchoolInfo | None:
        """Fetch only the profile whose primary key is the authenticated tenant ID."""
        return self.db.query(models.SchoolInfo).filter(models.SchoolInfo.id == school_id).first()

    def get_school_by_code(self, code: str) -> models.SchoolInfo | None:
        return self.db.query(models.SchoolInfo).filter(models.SchoolInfo.code == code).first()

    def create_school(self, school_id: int, school_data: schemas.SchoolCreate) -> models.SchoolInfo:
        """Create a profile under the platform school ID so academic records share the same tenant key."""
        settings_data = school_data.settings.model_dump(exclude_unset=True) if school_data.settings else {}
        branding_data = school_data.branding.model_dump(exclude_unset=True) if school_data.branding else {}
        contact_data = school_data.contact.model_dump(exclude_unset=True) if school_data.contact else {}

        db_school = models.SchoolInfo(
            id=school_id,
            **school_data.model_dump(exclude={"settings", "branding", "contact"}),
        )
        try:
            self.db.add(db_school)
            self.db.flush()
            self.db.add_all([
                models.SchoolSettings(school_id=db_school.id, **settings_data),
                models.SchoolBranding(school_id=db_school.id, **branding_data),
                models.SchoolContact(school_id=db_school.id, **contact_data),
            ])
            self.db.commit()
            self.db.refresh(db_school)
            return db_school
        except Exception:
            self.db.rollback()
            raise

    def update_school(self, db_school: models.SchoolInfo, school_update: schemas.SchoolUpdate) -> models.SchoolInfo:
        for key, value in school_update.model_dump(exclude_unset=True).items():
            setattr(db_school, key, value)
        self.db.commit()
        self.db.refresh(db_school)
        return db_school

    def get_settings(self, school_id: int) -> models.SchoolSettings | None:
        return self.db.query(models.SchoolSettings).filter(models.SchoolSettings.school_id == school_id).first()

    def update_settings(self, db_settings: models.SchoolSettings, settings_update: schemas.SchoolSettingsUpdate) -> models.SchoolSettings:
        for key, value in settings_update.model_dump(exclude_unset=True).items():
            setattr(db_settings, key, value)
        self.db.commit()
        self.db.refresh(db_settings)
        return db_settings

    def get_branding(self, school_id: int) -> models.SchoolBranding | None:
        return self.db.query(models.SchoolBranding).filter(models.SchoolBranding.school_id == school_id).first()

    def update_branding(self, db_branding: models.SchoolBranding, branding_update: schemas.SchoolBrandingUpdate) -> models.SchoolBranding:
        for key, value in branding_update.model_dump(exclude_unset=True).items():
            setattr(db_branding, key, value)
        self.db.commit()
        self.db.refresh(db_branding)
        return db_branding

    def get_contact(self, school_id: int) -> models.SchoolContact | None:
        return self.db.query(models.SchoolContact).filter(models.SchoolContact.school_id == school_id).first()

    def update_contact(self, db_contact: models.SchoolContact, contact_update: schemas.SchoolContactUpdate) -> models.SchoolContact:
        for key, value in contact_update.model_dump(exclude_unset=True).items():
            setattr(db_contact, key, value)
        self.db.commit()
        self.db.refresh(db_contact)
        return db_contact

    def delete_school(self, db_school: models.SchoolInfo) -> None:
        self.db.delete(db_school)
        self.db.commit()
