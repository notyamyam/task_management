from pydantic import BaseModel

class UsersCreate(BaseModel):
    username: str
    password: str