from fastapi import APIRouter, Depends, HTTPException
from ..schemas import UserPasswordUpdate, UsersCreate
from ..database import get_db
from ..models import User
from ..security import auth
from fastapi.security import OAuth2PasswordRequestForm

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me")
def get_current_user(current_user = Depends(auth.get_current_user)):
    return {"id": current_user.id, "username": current_user.email}


@router.put("/me/password")
def update_password(
    passwords: UserPasswordUpdate,
    db = Depends(get_db),
    current_user = Depends(auth.get_current_user),
):
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
    if not existing_user:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    if not auth.verify_password(user.password, existing_user.password):
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    access_token = auth.create_access_token(data={"sub": existing_user.email})
    return {"token": access_token, "token_type": "bearer"}

@router.post("/token")
def get_token(form_data:OAuth2PasswordRequestForm = Depends(), db = Depends(get_db)):
    email = form_data.username.strip().lower()
    user_exist = db.query(User).filter(User.email == email).first()
    if not user_exist:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    if not auth.verify_password(form_data.password, user_exist.password):
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    access_token = auth.create_access_token(data={"sub": user_exist.email})
    return {"access_token": access_token, "token_type": "bearer"}
