from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_

from ..database import get_db
from ..models import Project, ProjectMember, Task
from ..schemas import TaskCreate
from ..security import auth

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def get_current_complete_user(current_user=Depends(auth.get_current_user)):
    if not current_user.first_name or not current_user.last_name:
        raise HTTPException(
            status_code=403,
            detail="Complete your profile before managing tasks",
        )
    return current_user


def get_accessible_project(project_id, current_user, db):
    project = (
        db.query(Project)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(
            Project.id == project_id,
            or_(Project.user_id == current_user.id, ProjectMember.user_id == current_user.id),
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def get_accessible_task(task_id, current_user, db):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.project_id is None:
        if task.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="You are not authorized to access this task")
    else:
        get_accessible_project(task.project_id, current_user, db)
    return task


def serialize_task(task, db):
    project = None
    if task.project_id is not None:
        project = db.query(Project).filter(Project.id == task.project_id).first()
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "completed": task.completed,
        "user_id": task.user_id,
        "project_id": task.project_id,
        "project_name": project.name if project else None,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


@router.post("/create-task")
def create_task(
    task: TaskCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    if task.project_id is None:
        raise HTTPException(status_code=422, detail="Select a project for this task")
    get_accessible_project(task.project_id, current_user, db)

    new_task = Task(**task.model_dump(), user_id=current_user.id)
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return serialize_task(new_task, db)


@router.get("/get-tasks")
def get_tasks(
    project_id: int | None = None,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    query = (
        db.query(Task)
        .outerjoin(Project, Project.id == Task.project_id)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
    )

    if project_id is not None:
        get_accessible_project(project_id, current_user, db)
        query = query.filter(Task.project_id == project_id)
    else:
        query = query.filter(
            or_(
                and_(Task.project_id.is_(None), Task.user_id == current_user.id),
                Project.user_id == current_user.id,
                ProjectMember.user_id == current_user.id,
            )
        )

    tasks = query.order_by(Task.title.asc()).distinct().all()
    return [serialize_task(task, db) for task in tasks]


@router.get("/get-task/{task_id}")
def get_task(
    task_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    return serialize_task(get_accessible_task(task_id, current_user, db), db)


@router.put("/update-task")
def update_task(
    id: int,
    task: TaskCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    existing_task = get_accessible_task(id, current_user, db)
    if existing_task.project_id is not None and task.project_id is None:
        raise HTTPException(status_code=422, detail="Select a project for this task")
    if task.project_id is not None:
        get_accessible_project(task.project_id, current_user, db)

    for key, value in task.model_dump().items():
        setattr(existing_task, key, value)

    db.commit()
    db.refresh(existing_task)
    return serialize_task(existing_task, db)


@router.delete("/delete-task")
def delete_task(
    id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    task = get_accessible_task(id, current_user, db)
    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully"}
