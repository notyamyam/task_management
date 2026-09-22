from fastapi import FastAPI
from .routers import ai, project, task, user
from .database import Base, engine, migrate_existing_schema
from fastapi.middleware.cors import CORSMiddleware
from .models import Project, ProjectMember, Task

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Report-Task-Count"],
)
migrate_existing_schema()
Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"message": "Hello, World!"}

app.include_router(task.router)
app.include_router(user.router)
app.include_router(project.router)
app.include_router(ai.router)
