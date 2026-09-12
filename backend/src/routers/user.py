import logging

from fastapi import APIRouter, Depends, HTTPException
from ..schemas import GoogleLogin, UserPasswordUpdate, UsersCreate
from ..database import get_db
from ..models import User
from ..security import auth
from fastapi.security import OAuth2PasswordRequestForm
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from ..security.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me")
def get_current_user(current_user = Depends(auth.get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "has_password" : current_user.password is not None,
        "google_linked" : current_user.google_sub is not None,
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
def get_users(db = Depends(get_db)):
    users = db.query(User).all()
    return users

#CREATE / Register an account.
@router.post("/register")
def create_user(user: UsersCreate, db = Depends(get_db)):
    exist_user = db.query(User).filter(User.email == user.email).first()
    if exist_user:
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    new_user = User(email=user.email, password=auth.hash_password(user.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "email": new_user.email}

@router.post("/login")
def login_user(user: UsersCreate, db = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user.email).first()
    if not existing_user or existing_user.password is None:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    if not auth.verify_password(user.password, existing_user.password):
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    access_token = auth.create_access_token(data={"sub": existing_user.email})
    return {"token": access_token, "token_type": "bearer"}

@router.post("/token")
def get_token(form_data:OAuth2PasswordRequestForm = Depends(), db = Depends(get_db)):
    email = form_data.username.strip().lower()
    user_exist = db.query(User).filter(User.email == email).first()
    if not user_exist or user_exist.password is None:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    if not auth.verify_password(form_data.password, user_exist.password):
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    access_token = auth.create_access_token(data={"sub": user_exist.email})
    return {"access_token": access_token, "token_type": "bearer"}

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

    if not user:
        user = db.query(User).filter(User.email == email).first()

        if user:
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
            )
            db.add(user)

        db.commit()
        db.refresh(user)

    access_token = auth.create_access_token({"sub": user.email})
    return {"token": access_token, "token_type": "bearer"}
