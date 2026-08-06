from datetime import datetime, timedelta
from jose import jwt
from passlib.hash import sha256_crypt

# Hashing context
pwd_context = sha256_crypt

# Secret key and algorithm
SECRET_KEY = "YOUR_SUPER_SECRET_KEY"
ALGORITHM = "HS256"

# Password verification function
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# Password hashing function
def get_password_hash(password):
    return pwd_context.hash(password)

# Token creation function
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=30)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt