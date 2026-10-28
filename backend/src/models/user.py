from ..database import Base
from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Integer, String, func


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'disabled', 'deleted')",
            name="ck_users_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=True)
    google_sub = Column(String, unique=True, nullable=True, index=True)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    auth_version = Column(Integer, nullable=False, default=0)
    password_reset_otp_hash = Column(String(64), nullable=True)
    password_reset_otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_requested_at = Column(DateTime(timezone=True), nullable=True)
    password_reset_attempts = Column(Integer, nullable=False, default=0)
    status = Column(
        String(20),
        nullable=False,
        default="active",
        server_default="active",
    )
    must_change_password = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at = Column(DateTime(timezone=True), nullable=True)
