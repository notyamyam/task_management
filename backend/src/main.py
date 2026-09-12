from fastapi import FastAPI
from .routers import task, user
from .database import Base, engine, migrate_existing_schema
from fastapi.middleware.cors import CORSMiddleware
from .models import Task

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)
migrate_existing_schema()
Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"message": "Hello, World!"}

app.include_router(task.router)
app.include_router(user.router)
