from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_

from ...database import get_db
from ...models import (
    Notification,
    Project,
    Subtask,
    Task,
    TaskActivity,
    TaskComment,
    TaskDependency,
    User,
)
from ...schemas import (
    SubtaskCreate,
    SubtaskUpdate,
    TaskDependencyCreate,
    TaskStatus,
    TaskCreate,
)
from ...schemas.admin import (
    AdminSubtaskResponse,
    AdminTaskActivityResponse,
    AdminTaskCommentResponse,
    AdminTaskDependencyResponse,
    AdminTaskResponse,
)
from ...security.authorization import require_permission
from ...services.admin import (
    audit_admin_action,
    commit_admin_mutation,
    flush_admin_mutation,
)
from ...services.notifications import add_notification
from ..task import (
    add_task_activity,
    apply_task_filters_and_sorting,
    dependency_would_cycle,
    ensure_dependencies_resolved,
    get_project_assignee,
    serialize_comment,
    serialize_dependency,
    serialize_subtask,
    serialize_task,
    serialize_user,
    user_activity_label,
)


router = APIRouter(prefix="/tasks")


def get_task_or_404(db, task_id: int, *, lock: bool = False) -> Task:
    query = db.query(Task).filter(Task.id == task_id)
    if lock:
        query = query.with_for_update()
    task = query.one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def get_project_or_404(db, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def set_pagination_headers(response: Response, *, total: int, page: int, page_size: int) -> None:
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    response.headers["X-Total-Pages"] = str((total + page_size - 1) // page_size)


def validate_task_project(db, project_id: int | None) -> Project:
    if project_id is None:
        raise HTTPException(status_code=422, detail="Select a project for this task")
    return get_project_or_404(db, project_id)


def validate_subtask_assignee(task: Task, assignee_user_id: int | None, db) -> None:
    if assignee_user_id is None:
        return
    if task.project_id is None:
        raise HTTPException(status_code=422, detail="Assigned subtasks require a project")
    project = get_project_or_404(db, task.project_id)
    get_project_assignee(project, assignee_user_id, db)


def audit_task_mutation(db, actor, action: str, task: Task, metadata=None) -> None:
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action=action,
        resource_type="task",
        resource_id=task.id,
        metadata=metadata,
    )


@router.get("", response_model=list[AdminTaskResponse])
def list_tasks(
    response: Response,
    project_id: int | None = Query(default=None, ge=1),
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
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db=Depends(get_db),
    actor=Depends(require_permission("tasks.read")),
):
    query = db.query(Task)
    if project_id is not None:
        get_project_or_404(db, project_id)
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
    tasks = query.offset((page - 1) * page_size).limit(page_size).all()
    set_pagination_headers(response, total=total, page=page, page_size=page_size)
    return [serialize_task(task, db) for task in tasks]


@router.post("", response_model=AdminTaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db=Depends(get_db),
    actor=Depends(require_permission("tasks.create")),
):
    project = validate_task_project(db, payload.project_id)
    if payload.assignee_user_id is not None:
        get_project_assignee(project, payload.assignee_user_id, db)

    task_data = payload.model_dump(exclude={"status"})
    task_status = (
        payload.status
        if "status" in payload.model_fields_set
        else ("done" if payload.completed else "backlog")
    )
    task_data["status"] = task_status
    task_data["completed"] = task_status == "done"
    task = Task(
        **task_data,
        user_id=actor.id,
        updated_by_user_id=actor.id,
    )
    db.add(task)
    flush_admin_mutation(db)
    add_task_activity(db, task.id, actor.id, "task_created")
    if task.assignee_user_id is not None:
        add_notification(
            db,
            user_id=task.assignee_user_id,
            actor_user_id=actor.id,
            task_id=task.id,
            notification_type="assignment",
            title="Task assigned to you",
            body=f'You were assigned “{task.title}”.',
        )
    audit_task_mutation(db, actor, "tasks.create", task, {"status": task.status})
    commit_admin_mutation(db)
    db.refresh(task)
    return serialize_task(task, db)


@router.get("/{task_id}", response_model=AdminTaskResponse)
def get_task(
    task_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("tasks.read")),
):
    return serialize_task(get_task_or_404(db, task_id), db)


@router.patch("/{task_id}", response_model=AdminTaskResponse)
def update_task(
    task_id: int,
    payload: TaskCreate,
    db=Depends(get_db),
    actor=Depends(require_permission("tasks.update")),
):
    task = get_task_or_404(db, task_id, lock=True)
    old_status = task.status
    old_assignee_user_id = task.assignee_user_id
    old_assignee = db.query(User).filter(User.id == old_assignee_user_id).first()
    old_priority = task.priority
    old_due_date = task.due_date

    if task.project_id is not None and payload.project_id is None:
        raise HTTPException(status_code=422, detail="Select a project for this task")
    if payload.project_id != task.project_id:
        has_dependencies = db.query(TaskDependency.id).filter(
            or_(
                TaskDependency.task_id == task.id,
                TaskDependency.blocked_by_task_id == task.id,
            )
        ).first()
        if has_dependencies:
            raise HTTPException(
                status_code=409,
                detail="Remove task dependencies before changing the project",
            )

    project = validate_task_project(db, payload.project_id)
    assignee_user_id = (
        payload.assignee_user_id
        if "assignee_user_id" in payload.model_fields_set
        else task.assignee_user_id
    )
    new_assignee = None
    if assignee_user_id is not None:
        assignment_changed = (
            payload.project_id != task.project_id
            or assignee_user_id != old_assignee_user_id
        )
        new_assignee = get_project_assignee(
            project,
            assignee_user_id,
            db,
            require_active=assignment_changed,
        )

    completed_changed = payload.completed != task.completed
    task_data = payload.model_dump(
        exclude={"assignee_user_id", "completed", "due_date", "status"}
    )
    for key, value in task_data.items():
        setattr(task, key, value)
    if "assignee_user_id" in payload.model_fields_set:
        task.assignee_user_id = payload.assignee_user_id
    if "due_date" in payload.model_fields_set:
        task.due_date = payload.due_date

    if "status" in payload.model_fields_set:
        task.status = payload.status
        task.completed = payload.status == "done"
    elif "completed" in payload.model_fields_set and completed_changed:
        task.status = "done" if payload.completed else "backlog"
        task.completed = payload.completed
    if task.status == "done" and old_status != "done":
        ensure_dependencies_resolved(task, db)
    task.updated_by_user_id = actor.id

    if task.status != old_status:
        add_task_activity(
            db, task.id, actor.id, "status_changed", "status", old_status, task.status
        )
    if task.assignee_user_id != old_assignee_user_id:
        add_task_activity(
            db,
            task.id,
            actor.id,
            "assignment_changed",
            "assignee",
            user_activity_label(old_assignee),
            user_activity_label(new_assignee),
        )
        if task.assignee_user_id is not None:
            add_notification(
                db,
                user_id=task.assignee_user_id,
                actor_user_id=actor.id,
                task_id=task.id,
                notification_type="assignment",
                title="Task assigned to you",
                body=f'You were assigned “{task.title}”.',
            )
    if task.priority != old_priority:
        add_task_activity(
            db, task.id, actor.id, "priority_changed", "priority", old_priority, task.priority
        )
    if task.due_date != old_due_date:
        add_task_activity(
            db,
            task.id,
            actor.id,
            "due_date_changed",
            "due_date",
            old_due_date.isoformat() if old_due_date else None,
            task.due_date.isoformat() if task.due_date else None,
        )
    if task.status != old_status and task.assignee_user_id is not None:
        add_notification(
            db,
            user_id=task.assignee_user_id,
            actor_user_id=actor.id,
            task_id=task.id,
            notification_type="status_change",
            title="Task status changed",
            body=(
                f'“{task.title}” moved from {old_status.replace("_", " ")} '
                f'to {task.status.replace("_", " ")}. '
            ),
        )

    audit_task_mutation(db, actor, "tasks.update", task)
    commit_admin_mutation(db)
    db.refresh(task)
    return serialize_task(task, db)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("tasks.delete")),
):
    task = get_task_or_404(db, task_id, lock=True)
    subtask_count = db.query(Subtask).filter(Subtask.task_id == task.id).count()
    dependency_count = db.query(TaskDependency).filter(
        or_(
            TaskDependency.task_id == task.id,
            TaskDependency.blocked_by_task_id == task.id,
        )
    ).count()
    comment_count = db.query(TaskComment).filter(TaskComment.task_id == task.id).count()
    activity_count = db.query(TaskActivity).filter(TaskActivity.task_id == task.id).count()
    notification_count = db.query(Notification).filter(Notification.task_id == task.id).count()

    db.query(Subtask).filter(Subtask.task_id == task.id).delete(synchronize_session=False)
    db.query(TaskDependency).filter(
        or_(
            TaskDependency.task_id == task.id,
            TaskDependency.blocked_by_task_id == task.id,
        )
    ).delete(synchronize_session=False)
    db.query(TaskComment).filter(TaskComment.task_id == task.id).delete(synchronize_session=False)
    db.query(TaskActivity).filter(TaskActivity.task_id == task.id).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.task_id == task.id).delete(synchronize_session=False)
    audit_task_mutation(
        db,
        actor,
        "tasks.delete",
        task,
        {
            "subtask_count": subtask_count,
            "dependency_count": dependency_count,
            "comment_count": comment_count,
            "activity_count": activity_count,
            "notification_count": notification_count,
        },
    )
    db.delete(task)
    commit_admin_mutation(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{task_id}/subtasks", response_model=list[AdminSubtaskResponse])
def list_subtasks(
    task_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("subtasks.read")),
):
    task = get_task_or_404(db, task_id)
    subtasks = (
        db.query(Subtask)
        .filter(Subtask.task_id == task.id)
        .order_by(Subtask.position.asc(), Subtask.created_at.asc(), Subtask.id.asc())
        .all()
    )
    return [serialize_subtask(subtask, db) for subtask in subtasks]


@router.post(
    "/{task_id}/subtasks",
    response_model=AdminSubtaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_subtask(
    task_id: int,
    payload: SubtaskCreate,
    db=Depends(get_db),
    actor=Depends(require_permission("subtasks.create")),
):
    task = get_task_or_404(db, task_id)
    validate_subtask_assignee(task, payload.assignee_user_id, db)
    subtask = Subtask(task_id=task.id, **payload.model_dump())
    db.add(subtask)
    if subtask.assignee_user_id is not None:
        add_notification(
            db,
            user_id=subtask.assignee_user_id,
            actor_user_id=actor.id,
            task_id=task.id,
            notification_type="assignment",
            title="Subtask assigned to you",
            body=f'You were assigned “{subtask.title}” on “{task.title}”.',
        )
    flush_admin_mutation(db)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="subtasks.create",
        resource_type="subtask",
        resource_id=subtask.id,
        metadata={"subtask_count": 1},
    )
    commit_admin_mutation(db)
    db.refresh(subtask)
    return serialize_subtask(subtask, db)


@router.patch("/{task_id}/subtasks/{subtask_id}", response_model=AdminSubtaskResponse)
def update_subtask(
    task_id: int,
    subtask_id: int,
    payload: SubtaskUpdate,
    db=Depends(get_db),
    actor=Depends(require_permission("subtasks.update")),
):
    task = get_task_or_404(db, task_id)
    subtask = (
        db.query(Subtask)
        .filter(Subtask.id == subtask_id, Subtask.task_id == task.id)
        .one_or_none()
    )
    if subtask is None:
        raise HTTPException(status_code=404, detail="Subtask not found")
    old_assignee_user_id = subtask.assignee_user_id
    if (
        "assignee_user_id" in payload.model_fields_set
        and payload.assignee_user_id != old_assignee_user_id
    ):
        validate_subtask_assignee(task, payload.assignee_user_id, db)
    for field in payload.model_fields_set:
        setattr(subtask, field, getattr(payload, field))
    if subtask.assignee_user_id is not None and subtask.assignee_user_id != old_assignee_user_id:
        add_notification(
            db,
            user_id=subtask.assignee_user_id,
            actor_user_id=actor.id,
            task_id=task.id,
            notification_type="assignment",
            title="Subtask assigned to you",
            body=f'You were assigned “{subtask.title}” on “{task.title}”.',
        )
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="subtasks.update",
        resource_type="subtask",
        resource_id=subtask.id,
    )
    commit_admin_mutation(db)
    db.refresh(subtask)
    return serialize_subtask(subtask, db)


@router.delete("/{task_id}/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subtask(
    task_id: int,
    subtask_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("subtasks.delete")),
):
    task = get_task_or_404(db, task_id)
    subtask = (
        db.query(Subtask)
        .filter(Subtask.id == subtask_id, Subtask.task_id == task.id)
        .one_or_none()
    )
    if subtask is None:
        raise HTTPException(status_code=404, detail="Subtask not found")
    db.delete(subtask)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="subtasks.delete",
        resource_type="subtask",
        resource_id=subtask.id,
        metadata={"subtask_count": 1},
    )
    commit_admin_mutation(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{task_id}/dependencies", response_model=list[AdminTaskDependencyResponse])
def list_dependencies(
    task_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("task_dependencies.read")),
):
    task = get_task_or_404(db, task_id)
    dependencies = (
        db.query(TaskDependency)
        .filter(TaskDependency.task_id == task.id)
        .order_by(TaskDependency.created_at.asc(), TaskDependency.id.asc())
        .all()
    )
    return [serialize_dependency(dependency, db) for dependency in dependencies]


@router.post(
    "/{task_id}/dependencies",
    response_model=AdminTaskDependencyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_dependency(
    task_id: int,
    payload: TaskDependencyCreate,
    db=Depends(get_db),
    actor=Depends(require_permission("task_dependencies.create")),
):
    task = get_task_or_404(db, task_id)
    blocker = get_task_or_404(db, payload.blocked_by_task_id)
    if task.id == blocker.id:
        raise HTTPException(status_code=422, detail="A task cannot depend on itself")
    if task.project_id is None or task.project_id != blocker.project_id:
        raise HTTPException(
            status_code=422,
            detail="Dependencies must link tasks in the same project",
        )
    if task.status == "done" and blocker.status != "done":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot add an unresolved dependency to a completed task",
        )
    existing = db.query(TaskDependency.id).filter(
        TaskDependency.task_id == task.id,
        TaskDependency.blocked_by_task_id == blocker.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Task dependency already exists")
    if dependency_would_cycle(task.id, blocker.id, task.project_id, db):
        raise HTTPException(status_code=422, detail="Task dependency would create a cycle")

    dependency = TaskDependency(
        task_id=task.id,
        blocked_by_task_id=blocker.id,
        created_by_user_id=actor.id,
    )
    db.add(dependency)
    flush_admin_mutation(db)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="task_dependencies.create",
        resource_type="task_dependency",
        resource_id=dependency.id,
        metadata={"dependency_count": 1},
    )
    commit_admin_mutation(db)
    db.refresh(dependency)
    return serialize_dependency(dependency, db)


@router.delete(
    "/{task_id}/dependencies/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_dependency(
    task_id: int,
    dependency_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("task_dependencies.delete")),
):
    task = get_task_or_404(db, task_id)
    dependency = (
        db.query(TaskDependency)
        .filter(TaskDependency.id == dependency_id, TaskDependency.task_id == task.id)
        .one_or_none()
    )
    if dependency is None:
        raise HTTPException(status_code=404, detail="Task dependency not found")
    db.delete(dependency)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="task_dependencies.delete",
        resource_type="task_dependency",
        resource_id=dependency.id,
        metadata={"dependency_count": 1},
    )
    commit_admin_mutation(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{task_id}/comments", response_model=list[AdminTaskCommentResponse])
def list_comments(
    task_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("task_comments.read")),
):
    task = get_task_or_404(db, task_id)
    comments = (
        db.query(TaskComment)
        .filter(TaskComment.task_id == task.id)
        .order_by(TaskComment.created_at.asc(), TaskComment.id.asc())
        .all()
    )
    return [serialize_comment(comment, db) for comment in comments]


@router.delete("/{task_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    task_id: int,
    comment_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("task_comments.delete")),
):
    task = get_task_or_404(db, task_id)
    comment = (
        db.query(TaskComment)
        .filter(TaskComment.id == comment_id, TaskComment.task_id == task.id)
        .one_or_none()
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(comment)
    audit_admin_action(
        db,
        actor_user_id=actor.id,
        action="task_comments.delete",
        resource_type="task_comment",
        resource_id=comment.id,
        metadata={"comment_count": 1},
    )
    commit_admin_mutation(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{task_id}/activity", response_model=list[AdminTaskActivityResponse])
def list_activity(
    task_id: int,
    db=Depends(get_db),
    actor=Depends(require_permission("task_activity.read")),
):
    task = get_task_or_404(db, task_id)
    activities = (
        db.query(TaskActivity)
        .filter(TaskActivity.task_id == task.id)
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
