import hashlib
import hmac

from passlib.context import CryptContext
from jose import jwt, JWTError
from .config import settings
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from ..database import get_db
from ..models import User

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/token")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def hash_password_reset_otp(user_id: int, otp: str) -> str:
    secret = settings.password_reset_otp_secret or settings.secret_key
    message = f"{user_id}:{otp}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()

def verify_password_reset_otp(
    user_id: int,
    otp: str,
    expected_hash: str,
) -> bool:
    return hmac.compare_digest(
        hash_password_reset_otp(user_id, otp),
        expected_hash,
    )

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=settings.algorithm)
        email: str = payload.get("sub")
        if email is None:
            raise JWTError
        return email, payload.get("auth_version", 0)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(token = Depends(oauth2_scheme), db = Depends(get_db)):
    email, token_auth_version = verify_token(token)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if token_auth_version != user.auth_version:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user
