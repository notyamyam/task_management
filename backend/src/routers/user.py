import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from ..schemas import (
    GoogleLogin,
    PasswordResetConfirm,
    PasswordResetRequest,
    TemporaryPasswordChange,
    UserPasswordUpdate,
    UserProfileUpdate,
    UsersCreate,
)
from ..database import get_db
from ..models import User
from ..security import auth
from ..security.authorization import require_permission
from ..services.email import is_smtp_configured, send_password_reset_otp
from fastapi.security import OAuth2PasswordRequestForm
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from ..security.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])

PASSWORD_RESET_RESPONSE = {
    "message": "If an account exists for that email, a reset code has been sent."
}
DUMMY_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$"
    "xRhDiLG29p4TIgQg5HzvvQ$"
    "xra4rSF3WcCnSE70tUgdHoyqKarEGgwDCY5svDrQHYc"
)


def normalize_google_name(value):
    if not isinstance(value, str):
        return None
    name = value.strip()
    return name[:100] or None


def serialize_profile(user: User):
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "profile_complete": bool(user.first_name and user.last_name),
        "has_password": user.password is not None,
        "google_linked": user.google_sub is not None,
    }


def clear_password_reset(user: User, preserve_requested_at=False):
    user.password_reset_otp_hash = None
    user.password_reset_otp_expires_at = None
    if not preserve_requested_at:
        user.password_reset_requested_at = None
    user.password_reset_attempts = 0


def authenticate_password_user(db, email: str, password: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    password_hash = user.password if user and user.password else DUMMY_PASSWORD_HASH
    password_matches = auth.verify_password(password, password_hash)
    if not user or user.password is None or not password_matches:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    auth.ensure_login_allowed(user)
    return user


def deliver_password_reset_otp(email: str, otp: str):
    try:
        send_password_reset_otp(email, otp)
    except Exception:
        logger.exception("Unable to send password reset email")


@router.get("/me")
def get_current_user(current_user = Depends(auth.get_authenticated_user)):
    profile = serialize_profile(current_user)
    profile["must_change_password"] = current_user.must_change_password
    return profile


@router.put("/me")
def update_profile(
    profile: UserProfileUpdate,
    db = Depends(get_db),
    current_user = Depends(auth.get_current_user),
):
    current_user.first_name = profile.first_name
    current_user.last_name = profile.last_name
    db.commit()
    db.refresh(current_user)
    return serialize_profile(current_user)


@router.put("/me/temporary-password")
def replace_temporary_password(
    passwords: TemporaryPasswordChange,
    db = Depends(get_db),
    current_user = Depends(auth.get_authenticated_user),
):
    if not current_user.must_change_password:
        raise HTTPException(
            status_code=400,
            detail="Temporary password change is not required.",
        )

    password_hash = auth.hash_password(passwords.new_password)
    updated = (
        db.query(User)
        .filter(
            User.id == current_user.id,
            User.status == "active",
            User.must_change_password.is_(True),
            User.auth_version == current_user.auth_version,
        )
        .update(
            {
                User.password: password_hash,
                User.must_change_password: False,
                User.auth_version: User.auth_version + 1,
                User.password_reset_otp_hash: None,
                User.password_reset_otp_expires_at: None,
                User.password_reset_requested_at: None,
                User.password_reset_attempts: 0,
            },
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Temporary password change is not required.",
        )
    db.commit()
    return {
        "message": "Temporary password changed successfully. Please sign in again."
    }


@router.put("/me/password")
def update_password(
    passwords: UserPasswordUpdate,
    db = Depends(get_db),
    current_user = Depends(auth.get_current_user),
):
    if current_user.password is None:
        raise HTTPException(
            status_code=400,
            detail="This account uses Google Sign-In and does not have a password.",
        )

    if not auth.verify_password(passwords.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.password = auth.hash_password(passwords.new_password)
    db.commit()
    return {"message": "Password updated successfully"}

@router.get("/")
def get_users(db = Depends(get_db), current_user = Depends(require_permission("users.read"))):
    users = db.query(User).all()
    return [serialize_profile(user) for user in users]


@router.post("/password-reset/request", status_code=202)
def request_password_reset(
    payload: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db = Depends(get_db),
):
    if not is_smtp_configured():
        raise HTTPException(
            status_code=503,
            detail="Password reset email is temporarily unavailable.",
        )

    user = (
        db.query(User)
        .filter(User.email == payload.email)
        .with_for_update()
        .first()
    )
    if not user:
        return PASSWORD_RESET_RESPONSE
    try:
        auth.ensure_login_allowed(user)
    except HTTPException:
        return PASSWORD_RESET_RESPONSE

    now = datetime.now(timezone.utc)
    if (
        user.password_reset_requested_at
        and user.password_reset_requested_at > now - timedelta(seconds=60)
    ):
        return PASSWORD_RESET_RESPONSE

    otp = f"{secrets.randbelow(1_000_000):06d}"
    otp_hash = auth.hash_password_reset_otp(user.id, otp)
    user.password_reset_otp_hash = otp_hash
    user.password_reset_otp_expires_at = now + timedelta(minutes=10)
    user.password_reset_requested_at = now
    user.password_reset_attempts = 0
    db.commit()
    background_tasks.add_task(deliver_password_reset_otp, user.email, otp)

    return PASSWORD_RESET_RESPONSE


@router.post("/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirm, db = Depends(get_db)):
    user = (
        db.query(User)
        .filter(User.email == payload.email)
        .with_for_update()
        .first()
    )
    invalid_code = HTTPException(status_code=400, detail="Invalid or expired OTP")

    if not user or not user.password_reset_otp_hash:
        raise invalid_code
    try:
        auth.ensure_login_allowed(user)
    except HTTPException:
        raise invalid_code from None

    now = datetime.now(timezone.utc)
    if (
        not user.password_reset_otp_expires_at
        or user.password_reset_otp_expires_at <= now
        or user.password_reset_attempts >= 5
    ):
        clear_password_reset(user)
        db.commit()
        raise invalid_code

    if not auth.verify_password_reset_otp(
        user.id,
        payload.otp,
        user.password_reset_otp_hash,
    ):
        user.password_reset_attempts += 1
        if user.password_reset_attempts >= 5:
            clear_password_reset(user, preserve_requested_at=True)
        db.commit()
        raise invalid_code

    user.password = auth.hash_password(payload.new_password)
    user.auth_version += 1
    clear_password_reset(user)
    db.commit()
    return {"message": "Password reset successfully. You can now sign in."}

#CREATE / Register an account.
@router.post("/register")
def create_user(user: UsersCreate, db = Depends(get_db)):
    exist_user = db.query(User).filter(User.email == user.email).first()
    if exist_user:
        raise HTTPException(status_code=400, detail="Unable to create account with the provided information.")
    new_user = User(email=user.email, password=auth.hash_password(user.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    access_token = auth.create_access_token(
        data={"sub": new_user.email, "auth_version": new_user.auth_version}
    )
    return {
        "id": new_user.id,
        "email": new_user.email,
        "token": access_token,
        "token_type": "bearer",
        "profile_complete": False,
    }

@router.post("/login")
def login_user(user: UsersCreate, db = Depends(get_db)):
    existing_user = authenticate_password_user(db, user.email, user.password)
    access_token = auth.create_access_token(
        data={"sub": existing_user.email, "auth_version": existing_user.auth_version}
    )
    return {
        "token": access_token,
        "token_type": "bearer",
        "profile_complete": bool(existing_user.first_name and existing_user.last_name),
        "must_change_password": existing_user.must_change_password,
    }

@router.post("/token")
def get_token(form_data:OAuth2PasswordRequestForm = Depends(), db = Depends(get_db)):
    email = form_data.username.strip().lower()
    user_exist = authenticate_password_user(db, email, form_data.password)
    access_token = auth.create_access_token(
        data={"sub": user_exist.email, "auth_version": user_exist.auth_version}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "profile_complete": bool(user_exist.first_name and user_exist.last_name),
        "must_change_password": user_exist.must_change_password,
    }

@router.post("/google")
def google_login(payload: GoogleLogin, db=Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured")

    try:
        claims = id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            settings.google_client_id,
            clock_skew_in_seconds=60,
        )
    except ValueError as error:
        logger.warning("Google credential verification failed: %s", error)
        raise HTTPException(status_code=401, detail="Invalid Google credential") from error

    if not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email is not verified")

    google_sub = claims.get("sub")
    google_email = claims.get("email")
    if not google_sub or not google_email:
        raise HTTPException(status_code=401, detail="Google account details are incomplete")

    email = google_email.strip().lower()

    user = db.query(User).filter(User.google_sub == google_sub).first()
    if user:
        auth.ensure_login_allowed(user)

    if not user:
        user = db.query(User).filter(User.email == email).first()

        if user:
            auth.ensure_login_allowed(user)
            google_is_authoritative = email.endswith("@gmail.com") or bool(claims.get("hd"))
            if not google_is_authoritative:
                raise HTTPException(
                    status_code=409,
                    detail="Sign in with your password before linking Google.",
                )
            user.google_sub = google_sub
        else:
            user = User(
                email=email,
                password=None,
                google_sub=google_sub,
                first_name=normalize_google_name(claims.get("given_name")),
                last_name=normalize_google_name(claims.get("family_name")),
            )
            db.add(user)

        db.commit()
        db.refresh(user)

    access_token = auth.create_access_token(
        {"sub": user.email, "auth_version": user.auth_version}
    )
    return {
        "token": access_token,
        "token_type": "bearer",
        "profile_complete": bool(user.first_name and user.last_name),
        "must_change_password": user.must_change_password,
    }
