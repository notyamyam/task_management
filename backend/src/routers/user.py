from fastapi import APIRouter, Depends, HTTPException
from ..schemas import UsersCreate
from ..database import session, get_db
from ..models import User
from ..security import auth
from fastapi.security import OAuth2PasswordRequestForm

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/")
def get_users(db = Depends(get_db)):
    users = db.query(User).all()
    return users

#CREATE / Register an account.
@router.post("/register")
def create_user(user: UsersCreate, db = Depends(get_db)):
    exist_user = db.query(User).filter(User.username == user.username).first()
    if exist_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    new_user = User(username=user.username, password=auth.hash_password(user.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "username": new_user.username}

@router.post("/login")
def login_user(user: UsersCreate, db = Depends(get_db)):
    existing_user = db.query(User).filter(User.username == user.username).first()
    if not existing_user:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    if not auth.verify_password(user.password, existing_user.password):
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    access_token = auth.create_access_token(data={"sub": existing_user.username})
    return {"token": access_token, "token_type": "bearer"}

@router.post("/token")
def get_token(form_data:OAuth2PasswordRequestForm = Depends(), db = Depends(get_db)):
    user_exist = db.query(User).filter(User.username == form_data.username).first()
    if not user_exist:
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    if not auth.verify_password(form_data.password, user_exist.password):
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    access_token = auth.create_access_token(data={"sub": user_exist.username})
    return {"access_token": access_token, "token_type": "bearer"}