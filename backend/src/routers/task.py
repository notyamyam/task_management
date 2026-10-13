from datetime import date
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, case, or_
from sqlalchemy.exc import IntegrityError

from ..database import get_db
from ..models import Project, ProjectMember, Task, TaskActivity, TaskComment, User
from ..schemas import (
    TaskActivityResponse,
    TaskCommentCreate,
    TaskCommentResponse,
    TaskCommentUpdate,
    TaskCreate,
    TaskResponse,
    TaskStatus,
    TaskStatusUpdate,
)
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
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def get_accessible_tasks_query(current_user, db):
    is_project_member = db.query(ProjectMember.id).filter(
        ProjectMember.project_id == Project.id,
        ProjectMember.user_id == current_user.id,
    ).exists()
    return (
        db.query(Task)
        .outerjoin(Project, Project.id == Task.project_id)
        .filter(
            or_(
                and_(Task.project_id.is_(None), Task.user_id == current_user.id),
                Project.user_id == current_user.id,
                is_project_member,
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


def get_project_users(project, user_ids, db):
    if not user_ids:
        return []
    users = (
        db.query(User)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == User.id,
            ),
        )
        .filter(
            User.id.in_(user_ids),
            or_(User.id == project.user_id, ProjectMember.user_id.is_not(None)),
        )
        .all()
    )
    users_by_id = {user.id: user for user in users}
    if len(users_by_id) != len(user_ids):
        raise HTTPException(
            status_code=422,
            detail="Mentioned users must belong to the task's project",
        )
    return [users_by_id[user_id] for user_id in user_ids]


def validate_comment_mentions(project, body, mentioned_user_ids, current_user, db):
    mention_name = (current_user.first_name or current_user.email.split("@")[0]).strip()
    mentions_self = re.search(
        rf"(^|\s)@{re.escape(mention_name)}(?=[\s.,!?;:]|$)",
        body,
        flags=re.IGNORECASE,
    )
    if current_user.id in mentioned_user_ids or mentions_self:
        raise HTTPException(status_code=422, detail="You cannot mention yourself")
    return get_project_users(project, mentioned_user_ids, db)


def apply_task_filters_and_sorting(
    query,
    *,
    due,
    due_from,
    due_to,
    task_status,
    search,
    assignee_user_id,
    unassigned,
    priority,
    tag,
    sort_by,
    sort_order,
):
    if due_from and due_to and due_from > due_to:
        raise HTTPException(status_code=422, detail="due_from must be on or before due_to")
    if assignee_user_id is not None and unassigned:
        raise HTTPException(
            status_code=422,
            detail="assignee_user_id and unassigned cannot be combined",
        )
    if tag is not None and not tag.strip():
        raise HTTPException(status_code=422, detail="tag cannot be empty")

    today = date.today()
    if due == "today":
        query = query.filter(Task.due_date == today)
    elif due == "upcoming":
        query = query.filter(Task.due_date > today)
    elif due == "overdue":
        query = query.filter(Task.due_date < today, Task.status != "done")
    elif due == "dated":
        query = query.filter(Task.due_date.is_not(None))
    elif due == "undated":
        query = query.filter(Task.due_date.is_(None))

    if due_from is not None:
        query = query.filter(Task.due_date >= due_from)
    if due_to is not None:
        query = query.filter(Task.due_date <= due_to)
    if task_status is not None:
        query = query.filter(Task.status == task_status)
    if search:
        escaped_search = (
            search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        if escaped_search:
            pattern = f"%{escaped_search}%"
            query = query.filter(
                or_(
                    Task.title.ilike(pattern, escape="\\"),
                    Task.description.ilike(pattern, escape="\\"),
                )
            )
    if assignee_user_id is not None:
        query = query.filter(Task.assignee_user_id == assignee_user_id)
    if unassigned:
        query = query.filter(Task.assignee_user_id.is_(None))
    if priority is not None:
        query = query.filter(Task.priority == priority)
    if tag:
        query = query.filter(Task.tags.contains([{"name": tag.strip()}]))

    sort_column = {
        "title": Task.title,
        "due_date": Task.due_date,
        "created_at": Task.created_at,
        "updated_at": Task.updated_at,
        "priority": case(
            (Task.priority == "high", 3),
            (Task.priority == "medium", 2),
            else_=1,
        ),
        "status": case(
            (Task.status == "backlog", 1),
            (Task.status == "in_progress", 2),
            (Task.status == "blocked", 3),
            else_=4,
        ),
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


def serialize_user(user):
    if not user:
        return None
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
    }


def user_activity_label(user):
    if not user:
        return None
    full_name = " ".join(filter(None, [user.first_name, user.last_name])).strip()
    return full_name or user.email


def add_task_activity(
    db,
    task_id,
    actor_user_id,
    event_type,
    field_name=None,
    old_value=None,
    new_value=None,
):
    db.add(TaskActivity(
        task_id=task_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
    ))


def serialize_task(task, db):
    project = None
    if task.project_id is not None:
        project = db.query(Project).filter(Project.id == task.project_id).first()
    creator = db.query(User).filter(User.id == task.user_id).first()
    updater = db.query(User).filter(User.id == task.updated_by_user_id).first()
    assignee = db.query(User).filter(User.id == task.assignee_user_id).first()

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
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Task could not be saved because its project membership changed",
        ) from error
    add_task_activity(
        db,
        new_task.id,
        current_user.id,
        "task_created",
    )
    commit_task(db)
    db.refresh(new_task)
    return serialize_task(new_task, db)


@router.get("/get-tasks", response_model=list[TaskResponse])
def get_tasks(
    response: Response,
    project_id: int | None = None,
    search: str | None = Query(default=None, max_length=200),
    assignee_user_id: int | None = Query(default=None, gt=0),
    unassigned: bool = False,
    priority: Literal["low", "medium", "high"] | None = None,
    tag: str | None = Query(default=None, min_length=1, max_length=30),
    due: Literal["today", "upcoming", "overdue", "dated", "undated"] | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    task_status: TaskStatus | None = Query(default=None, alias="status"),
    sort_by: Literal[
        "title", "due_date", "created_at", "updated_at", "priority", "status"
    ] = "title",
    sort_order: Literal["asc", "desc"] = "asc",
    page: int | None = Query(default=None, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
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
        search=search,
        assignee_user_id=assignee_user_id,
        unassigned=unassigned,
        priority=priority,
        tag=tag,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    total = query.count()
    if page is not None:
        query = query.offset((page - 1) * page_size).limit(page_size)
        total_pages = (total + page_size - 1) // page_size
        response.headers["X-Page"] = str(page)
        response.headers["X-Page-Size"] = str(page_size)
        response.headers["X-Total-Pages"] = str(total_pages)
    response.headers["X-Total-Count"] = str(total)
    tasks = query.all()
    return [serialize_task(task, db) for task in tasks]


@router.get("/my-tasks", response_model=list[TaskResponse])
def get_my_tasks(
    response: Response,
    project_id: int | None = None,
    search: str | None = Query(default=None, max_length=200),
    priority: Literal["low", "medium", "high"] | None = None,
    tag: str | None = Query(default=None, min_length=1, max_length=30),
    due: Literal["today", "upcoming", "overdue", "dated", "undated"] | None = None,
    due_from: date | None = None,
    due_to: date | None = None,
    task_status: TaskStatus | None = Query(default=None, alias="status"),
    sort_by: Literal[
        "title", "due_date", "created_at", "updated_at", "priority", "status"
    ] = "due_date",
    sort_order: Literal["asc", "desc"] = "asc",
    page: int | None = Query(default=None, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
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
        search=search,
        assignee_user_id=current_user.id,
        unassigned=False,
        priority=priority,
        tag=tag,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    total = query.count()
    if page is not None:
        query = query.offset((page - 1) * page_size).limit(page_size)
        total_pages = (total + page_size - 1) // page_size
        response.headers["X-Page"] = str(page)
        response.headers["X-Page-Size"] = str(page_size)
        response.headers["X-Total-Pages"] = str(total_pages)
    response.headers["X-Total-Count"] = str(total)
    tasks = query.all()
    return [serialize_task(task, db) for task in tasks]


@router.get("/tag-recommendations")
def get_tag_recommendations(
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    tasks = (
        get_accessible_tasks_query(current_user, db)
        .order_by(Task.updated_at.desc(), Task.id.desc())
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


def serialize_comment(comment, db):
    author = db.query(User).filter(User.id == comment.user_id).first()
    mentioned_ids = comment.mentioned_user_ids or []
    mentioned_users_by_id = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(mentioned_ids)).all()
    } if mentioned_ids else {}
    return {
        "id": comment.id,
        "task_id": comment.task_id,
        "body": comment.body,
        "author": serialize_user(author),
        "mentioned_users": [
            serialize_user(mentioned_users_by_id[user_id])
            for user_id in mentioned_ids
            if user_id in mentioned_users_by_id
        ],
        "created_at": comment.created_at,
    }


@router.get("/{task_id}/comments", response_model=list[TaskCommentResponse])
def get_task_comments(
    task_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    get_accessible_task(task_id, current_user, db)
    comments = (
        db.query(TaskComment)
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc(), TaskComment.id.asc())
        .all()
    )
    return [serialize_comment(comment, db) for comment in comments]


@router.post(
    "/{task_id}/comments",
    response_model=TaskCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task_comment(
    task_id: int,
    payload: TaskCommentCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    task = get_accessible_task(task_id, current_user, db)
    if task.project_id is None:
        raise HTTPException(status_code=422, detail="Comments require a project task")
    project = get_accessible_project(task.project_id, current_user, db)
    validate_comment_mentions(
        project, payload.body, payload.mentioned_user_ids, current_user, db
    )

    comment = TaskComment(
        task_id=task.id,
        user_id=current_user.id,
        body=payload.body,
        mentioned_user_ids=payload.mentioned_user_ids,
    )
    db.add(comment)
    add_task_activity(
        db,
        task.id,
        current_user.id,
        "comment_added",
    )
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Comment could not be added because task access changed",
        ) from error
    db.refresh(comment)
    return serialize_comment(comment, db)


@router.put(
    "/{task_id}/comments/{comment_id}",
    response_model=TaskCommentResponse,
)
def update_task_comment(
    task_id: int,
    comment_id: int,
    payload: TaskCommentUpdate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    task = get_accessible_task(task_id, current_user, db)
    comment = (
        db.query(TaskComment)
        .filter(
            TaskComment.id == comment_id,
            TaskComment.task_id == task.id,
            TaskComment.user_id == current_user.id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if task.project_id is None:
        raise HTTPException(status_code=422, detail="Comments require a project task")
    project = get_accessible_project(task.project_id, current_user, db)
    validate_comment_mentions(
        project, payload.body, payload.mentioned_user_ids, current_user, db
    )

    comment.body = payload.body
    comment.mentioned_user_ids = payload.mentioned_user_ids
    commit_task(db)
    db.refresh(comment)
    return serialize_comment(comment, db)


@router.delete("/{task_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_comment(
    task_id: int,
    comment_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    task = get_accessible_task(task_id, current_user, db)
    comment = (
        db.query(TaskComment)
        .filter(
            TaskComment.id == comment_id,
            TaskComment.task_id == task.id,
            TaskComment.user_id == current_user.id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(comment)
    commit_task(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{task_id}/activity", response_model=list[TaskActivityResponse])
def get_task_activity(
    task_id: int,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    get_accessible_task(task_id, current_user, db)
    activities = (
        db.query(TaskActivity)
        .filter(TaskActivity.task_id == task_id)
        .order_by(TaskActivity.created_at.desc(), TaskActivity.id.desc())
        .all()
    )
    actor_ids = {activity.actor_user_id for activity in activities}
    actors = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(actor_ids)).all()
    } if actor_ids else {}
    return [
        {
            "id": activity.id,
            "task_id": activity.task_id,
            "event_type": activity.event_type,
            "field_name": activity.field_name,
            "old_value": activity.old_value,
            "new_value": activity.new_value,
            "actor": serialize_user(actors.get(activity.actor_user_id)),
            "created_at": activity.created_at,
        }
        for activity in activities
    ]


@router.put("/update-task", response_model=TaskResponse)
def update_task(
    id: int,
    task: TaskCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_complete_user),
):
    existing_task = get_accessible_task(id, current_user, db)
    old_status = existing_task.status
    old_assignee_user_id = existing_task.assignee_user_id
    old_assignee = db.query(User).filter(User.id == existing_task.assignee_user_id).first()
    old_priority = existing_task.priority
    old_due_date = existing_task.due_date
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
    new_assignee = None
    if assignee_user_id is not None:
        if project is None:
            raise HTTPException(status_code=422, detail="Assigned tasks require a project")
        new_assignee = get_project_assignee(project, assignee_user_id, db)

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

    if existing_task.status != old_status:
        add_task_activity(
            db, id, current_user.id, "status_changed", "status", old_status, existing_task.status
        )
    if existing_task.assignee_user_id != old_assignee_user_id:
        add_task_activity(
            db,
            id,
            current_user.id,
            "assignment_changed",
            "assignee",
            user_activity_label(old_assignee),
            user_activity_label(new_assignee),
        )
    if existing_task.priority != old_priority:
        add_task_activity(
            db,
            id,
            current_user.id,
            "priority_changed",
            "priority",
            old_priority,
            existing_task.priority,
        )
    if existing_task.due_date != old_due_date:
        add_task_activity(
            db,
            id,
            current_user.id,
            "due_date_changed",
            "due_date",
            old_due_date.isoformat() if old_due_date else None,
            existing_task.due_date.isoformat() if existing_task.due_date else None,
        )

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
    old_status = task.status
    task.status = payload.status
    task.completed = payload.status == "done"
    task.updated_by_user_id = current_user.id
    if task.status != old_status:
        add_task_activity(
            db, id, current_user.id, "status_changed", "status", old_status, task.status
        )
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
