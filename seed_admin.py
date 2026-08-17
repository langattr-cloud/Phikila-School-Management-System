from app.core.database import SessionLocal
from app.modules.users.models import User  # Adjust import path to match your user model
# Import your app's password hashing function, e.g.:
# from app.modules.users.utils import get_password_hash 
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_initial_admin():
    db = SessionLocal()
    try:
        # Check if founder already exists
        existing_user = db.query(User).filter(User.email == "admin@phikila.com").first()
        if existing_user:
            print("Admin user already exists!")
            return

        hashed_password = pwd_context.hash("2026phikila")
        
        admin_user = User(
            username="admin",               # Added this because it's nullable=False
            email="admin@phikila.com",
            hashed_password=hashed_password,
            is_active=True,
            role="Admin"                    # Replaced is_superuser with your role column
        )
        
        db.add(admin_user)
        db.commit()
        print("Founder/Admin user created successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error creating admin: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    create_initial_admin()