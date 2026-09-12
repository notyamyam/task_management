import re

from pydantic import BaseModel, field_validator


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

class UsersCreate(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = value.strip().lower()
        if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
            raise ValueError("Enter a valid email address")
        return email


class UserPasswordUpdate(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(value) > 128:
            raise ValueError("Password must be 128 characters or fewer")
        return value

class GoogleLogin(BaseModel):
    credential: str
