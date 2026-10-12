from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError

from ..database import get_db
from ..models import Project, ProjectMember, Task, User
from ..schemas import TaskCreate, TaskResponse, TaskStatus, TaskStatusUpdate
from ..security import auth

router = APIRouter(prefix="/tasks", tags=["Tasks"])
TAG_COLORS = {"slate", "emerald", "blue", "violet", "amber", "rose"}


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
    task = (
        get_accessible_tasks_query(current_user, db)
        .filter(Task.id == task_id)
        .distinct()
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def get_accessible_tasks_query(current_user, db):
    return (
        db.query(Task)
        .outerjoin(Project, Project.id == Task.project_id)
        .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(
            or_(
                and_(Task.project_id.is_(None), Task.user_id == current_user.id),
                Project.user_id == current_user.id,
                ProjectMember.user_id == current_user.id,
            )
        )
    )


def serialize_tags(stored_tags):
    tags = []
    for tag in stored_tags or []:
        if isinstance(tag, str):
            tags.append({"name": tag, "color": "slate"})
        elif isinstance(tag, dict) and isinstance(tag.get("name"), str):
            tags.append({
                "name": tag["name"],
                "color": tag.get("color") if tag.get("color") in TAG_COLORS else "slate",
            })
    return tags


def get_project_assignee(project, assignee_user_id, db):
    assignee = (
        db.query(User)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == User.id,
            ),
        )
        .filter(
            User.id == assignee_user_id,
            or_(User.id == project.user_id, ProjectMember.user_id.is_not(None)),
        )
        .first()
    )
    if not assignee:
        raise HTTPException(
            status_code=422,
            detail="Assignee must be the project owner or a project member",
        )
    return assignee


def apply_task_filters_and_sorting(
    query,
    *,
    due,
    due_from,
    due_to,
    task_status,
    sort_by,
    sort_order,
):
    if due_from and due_to and due_from > due_to:
        raise HTTPException(status_code=422, detail="due_from must be on or before due_to")

    today = date.today()
    if due == "today":
        query = query.filter(Task.due_date == today)
    elif due == "upcoming":
        query = query.filter(Task.due_date > today)
    elif due == "overdue":
        query = query.filter(Task.due_date < today, Task.status != "done")

    if due_from is not None:
        query = query.filter(Task.due_date >= due_from)
    if due_to is not None:
        query = query.filter(Task.due_date <= due_to)
    if task_status is not None:
        query = query.filter(Task.status == task_status)

    sort_column = {
        "title": Task.title,
        "due_date": Task.due_date,
        "created_at": Task.created_at,
        "updated_at": Task.updated_at,
    }[sort_by]
    ordered_column = (
        sort_column.asc().nullslast()
        if sort_order == "asc"
        else sort_column.desc().nullslast()
    )
    return query.order_by(ordered_column, Task.title.asc(), Task.id.asc())


def commit_task(db):
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Task could not be saved because its project membership changed",
        ) from error


def serialize_task(task, db):
    project = None
    if task.project_id is not None:
        project = db.query(Project).filter(Project.id == task.project_id).first()
    creator = db.query(User).filter(User.id == task.user_id).first()
    updater = db.query(User).filter(User.id == task.updated_by_user_id).first()
    assignee = db.query(User).filter(User.id == task.assignee_user_id).first()

    def serialize_user(user):
        if not user:
            return None
        return {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        }

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "completed": task.completed,
        "status": task.status,
        "user_id": task.user_id,
        "created_by": serialize_user(creator),
        "updated_by": serialize_user(updater),
        "assignee_user_id": task.assignee_user_id,
        "assignee": serialize_user(assignee),
        "project_id": task.project_id,
        "project_name": project.name if project else None,
        "due_date": task.due_date,
        "tags": serialize_tags(task.tags),
        "priority": task.priority,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


@router.post("/create-task", response_model=TaskResponse)
def create_task(
    task: TaskCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    if task.project_id is None:
        raise HTTPException(status_code=422, detail="Select a project for this task")
    project = get_accessible_project(task.project_id, current_user, db)
    if task.assignee_user_id is not None:
        get_project_assignee(project, task.assignee_user_id, db)

    task_data = task.model_dump(exclude={"status"})
    task_status = (
        task.status
        if "status" in task.model_fields_set
        else ("done" if task.completed else "backlog")
    )
    task_data["status"] = task_status
    task_data["completed"] = task_status == "done"

    new_task = Task(
        **task_data,
        user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    db.add(new_task)
    commit_task(db)
    db.refresh(new_task)
    return serialize_task(new_task, db)


@router.get("/get-tasks", response_model=list[TaskResponse])
def get_tasks(
    project_id: int | None = None,
    due: Literal["today", "upcoming", "overdue"] | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    task_status: TaskStatus | None = Query(default=None, alias="status"),
    sort_by: Literal["title", "due_date", "created_at", "updated_at"] = "title",
    sort_order: Literal["asc", "desc"] = "asc",
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    query = get_accessible_tasks_query(current_user, db)

    if project_id is not None:
        get_accessible_project(project_id, current_user, db)
        query = query.filter(Task.project_id == project_id)

    query = apply_task_filters_and_sorting(
        query,
        due=due,
        due_from=due_from,
        due_to=due_to,
        task_status=task_status,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    tasks = query.distinct().all()
    return [serialize_task(task, db) for task in tasks]


@router.get("/my-tasks", response_model=list[TaskResponse])
def get_my_tasks(
    project_id: int | None = None,
    due: Literal["today", "upcoming", "overdue"] | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    task_status: TaskStatus | None = Query(default=None, alias="status"),
    sort_by: Literal["title", "due_date", "created_at", "updated_at"] = "due_date",
    sort_order: Literal["asc", "desc"] = "asc",
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    if project_id is not None:
        get_accessible_project(project_id, current_user, db)

    query = get_accessible_tasks_query(current_user, db).filter(
        Task.assignee_user_id == current_user.id
    )
    if project_id is not None:
        query = query.filter(Task.project_id == project_id)

    query = apply_task_filters_and_sorting(
        query,
        due=due,
        due_from=due_from,
        due_to=due_to,
        task_status=task_status,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    tasks = query.distinct().all()
    return [serialize_task(task, db) for task in tasks]


@router.get("/tag-recommendations")
def get_tag_recommendations(
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    tasks = (
        get_accessible_tasks_query(current_user, db)
        .order_by(Task.updated_at.desc(), Task.id.desc())
        .distinct()
        .all()
    )
    recommendations = []
    seen = set()
    for task in tasks:
        for tag in serialize_tags(task.tags):
            normalized_name = tag["name"].casefold()
            if normalized_name not in seen:
                seen.add(normalized_name)
                recommendations.append(tag)
    return recommendations


@router.get("/get-task/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    return serialize_task(get_accessible_task(task_id, current_user, db), db)


@router.put("/update-task", response_model=TaskResponse)
def update_task(
    id: int,
    task: TaskCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    existing_task = get_accessible_task(id, current_user, db)
    if existing_task.project_id is not None and task.project_id is None:
        raise HTTPException(status_code=422, detail="Select a project for this task")
    project = None
    if task.project_id is not None:
        project = get_accessible_project(task.project_id, current_user, db)

    assignee_user_id = (
        task.assignee_user_id
        if "assignee_user_id" in task.model_fields_set
        else existing_task.assignee_user_id
    )
    if assignee_user_id is not None:
        if project is None:
            raise HTTPException(status_code=422, detail="Assigned tasks require a project")
        get_project_assignee(project, assignee_user_id, db)

    completed_changed = task.completed != existing_task.completed
    task_data = task.model_dump(
        exclude={"assignee_user_id", "completed", "due_date", "status"}
    )
    for key, value in task_data.items():
        setattr(existing_task, key, value)
    if "assignee_user_id" in task.model_fields_set:
        existing_task.assignee_user_id = task.assignee_user_id
    if "due_date" in task.model_fields_set:
        existing_task.due_date = task.due_date

    if "status" in task.model_fields_set:
        existing_task.status = task.status
        existing_task.completed = task.status == "done"
    elif "completed" in task.model_fields_set and completed_changed:
        existing_task.status = "done" if task.completed else "backlog"
        existing_task.completed = task.completed
    existing_task.updated_by_user_id = current_user.id

    commit_task(db)
    db.refresh(existing_task)
    return serialize_task(existing_task, db)


@router.patch("/update-status", response_model=TaskResponse)
def update_task_status(
    id: int,
    payload: TaskStatusUpdate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    task = get_accessible_task(id, current_user, db)
    task.status = payload.status
    task.completed = payload.status == "done"
    task.updated_by_user_id = current_user.id
    commit_task(db)
    db.refresh(task)
    return serialize_task(task, db)


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
