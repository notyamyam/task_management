from fastapi import FastAPI
from .routers import admin, ai, notification, project, task, user
from .database import initialize_database
from fastapi.middleware.cors import CORSMiddleware
from .models import (
    Notification,
    NotificationPreference,
    Project,
    ProjectMember,
    Subtask,
    Task,
    TaskActivity,
    TaskComment,
    TaskDependency,
)
from .security.config import settings

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url.rstrip("/")],
    # allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "X-Report-Task-Count",
        "X-Total-Count",
        "X-Page",
        "X-Page-Size",
        "X-Total-Pages",
    ],
)
initialize_database()

@app.get("/")
def root():
    return {"message": "Hello, World!"}

app.include_router(task.router)
app.include_router(user.router)
app.include_router(project.router)
app.include_router(ai.router)
app.include_router(notification.router)
app.include_router(admin.router)
