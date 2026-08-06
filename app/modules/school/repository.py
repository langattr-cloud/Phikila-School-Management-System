from sqlalchemy.orm import Session
from app.modules.school import models, schemas

class SchoolRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_school(self) -> models.SchoolInfo | None:
        """Fetch the primary school profile (assuming single school deployment for now)."""
        return self.db.query(models.SchoolInfo).first()

    def get_school_by_code(self, code: str) -> models.SchoolInfo | None:
        return self.db.query(models.SchoolInfo).filter(models.SchoolInfo.code == code).first()

    def create_school(self, school_data: schemas.SchoolCreate) -> models.SchoolInfo:
        # Extract nested relations if provided
        settings_data = school_data.settings.dict(exclude_unset=True) if school_data.settings else {}
        branding_data = school_data.branding.dict(exclude_unset=True) if school_data.branding else {}
        contact_data = school_data.contact.dict(exclude_unset=True) if school_data.contact else {}

        db_school = models.SchoolInfo(
            **school_data.dict(exclude={"settings", "branding", "contact"})
        )
        self.db.add(db_school)
        self.db.commit()
        self.db.refresh(db_school)

        # Create associated records
        db_settings = models.SchoolSettings(school_id=db_school.id, **settings_data)
        db_branding = models.SchoolBranding(school_id=db_school.id, **branding_data)
        db_contact = models.SchoolContact(school_id=db_school.id, **contact_data)

        self.db.add_all([db_settings, db_branding, db_contact])
        self.db.commit()
        self.db.refresh(db_school)
        return db_school

    def update_school(self, db_school: models.SchoolInfo, school_update: schemas.SchoolUpdate) -> models.SchoolInfo:
        update_data = school_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_school, key, value)
        
        self.db.commit()
        self.db.refresh(db_school)
        return db_school

    def get_settings(self, school_id: int) -> models.SchoolSettings | None:
        return self.db.query(models.SchoolSettings).filter(models.SchoolSettings.school_id == school_id).first()

    def update_settings(self, db_settings: models.SchoolSettings, settings_update: schemas.SchoolSettingsUpdate) -> models.SchoolSettings:
        update_data = settings_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_settings, key, value)
        
        self.db.commit()
        self.db.refresh(db_settings)
        return db_settings

    def get_branding(self, school_id: int) -> models.SchoolBranding | None:
        return self.db.query(models.SchoolBranding).filter(models.SchoolBranding.school_id == school_id).first()

    def update_branding(self, db_branding: models.SchoolBranding, branding_update: schemas.SchoolBrandingUpdate) -> models.SchoolBranding:
        update_data = branding_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_branding, key, value)
        
        self.db.commit()
        self.db.refresh(db_branding)
        return db_branding

    def get_contact(self, school_id: int) -> models.SchoolContact | None:
        return self.db.query(models.SchoolContact).filter(models.SchoolContact.school_id == school_id).first()

    def update_contact(self, db_contact: models.SchoolContact, contact_update: schemas.SchoolContactUpdate) -> models.SchoolContact:
        update_data = contact_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_contact, key, value)
        
        self.db.commit()
        self.db.refresh(db_contact)
        return db_contact

    def delete_school(self, db_school: models.SchoolInfo) -> None:
        self.db.delete(db_school)
        self.db.commit()