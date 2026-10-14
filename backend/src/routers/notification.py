import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError

from ..database import get_db
from ..models import Notification, NotificationPreference, Project, ProjectMember, Task
from ..schemas import (
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
    NotificationResponse,
    ReminderProcessingResponse,
)
from ..security import auth
from ..services.email import is_smtp_configured, send_task_reminder
from ..services.notifications import add_notification, get_notification_preference

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Notifications"])


def serialize_notification(notification):
    return {
        "id": notification.id,
        "notification_type": notification.notification_type,
        "title": notification.title,
        "body": notification.body,
        "task_id": notification.task_id,
        "actor_user_id": notification.actor_user_id,
        "read_at": notification.read_at,
        "created_at": notification.created_at,
    }


def serialize_preferences(preference):
    if preference is None:
        return {
            "assignment_notifications": True,
            "mention_notifications": True,
            "status_notifications": True,
            "reminder_notifications": True,
            "email_reminders": False,
            "reminder_days_before": 1,
            "updated_at": None,
        }
    return {
        "assignment_notifications": preference.assignment_notifications,
        "mention_notifications": preference.mention_notifications,
        "status_notifications": preference.status_notifications,
        "reminder_notifications": preference.reminder_notifications,
        "email_reminders": preference.email_reminders,
        "reminder_days_before": preference.reminder_days_before,
        "updated_at": preference.updated_at,
    }


def get_reminder_tasks(current_user, days_before, db):
    today = date.today()
    last_reminder_date = today + timedelta(days=days_before)
    is_project_member = db.query(ProjectMember.id).filter(
        ProjectMember.project_id == Project.id,
        ProjectMember.user_id == current_user.id,
    ).exists()
    return (
        db.query(Task)
        .outerjoin(Project, Project.id == Task.project_id)
        .filter(
            Task.status != "done",
            Task.due_date.is_not(None),
            Task.due_date <= last_reminder_date,
            or_(
                Task.assignee_user_id == current_user.id,
                and_(Task.assignee_user_id.is_(None), Task.user_id == current_user.id),
            ),
            or_(
                and_(Task.project_id.is_(None), Task.user_id == current_user.id),
                Project.user_id == current_user.id,
                is_project_member,
            ),
        )
        .order_by(Task.due_date.asc(), Task.id.asc())
        .all()
    )


def materialize_reminders(current_user, db):
    preference = get_notification_preference(current_user.id, db)
    in_app_enabled = preference is None or preference.reminder_notifications
    email_enabled = bool(preference and preference.email_reminders)
    if not in_app_enabled and not email_enabled:
        return []
    days_before = preference.reminder_days_before if preference is not None else 1
    today = date.today()
    created = []
    for task in get_reminder_tasks(current_user, days_before, db):
        notification_type = "overdue" if task.due_date < today else "due_soon"
        if notification_type == "overdue":
            title = "Task overdue"
            body = f'“{task.title}” was due {task.due_date.isoformat()}.'
        else:
            title = "Task due soon"
            body = f'“{task.title}” is due {task.due_date.isoformat()}.'
        dedupe_key = (
            f"reminder:{current_user.id}:{task.id}:"
            f"{notification_type}:{task.due_date.isoformat()}"
        )
        with db.no_autoflush:
            notification = (
                db.query(Notification)
                .filter(Notification.dedupe_key == dedupe_key)
                .first()
            )
        if notification is not None:
            if in_app_enabled and not notification.in_app:
                notification.in_app = True
            continue
        if in_app_enabled:
            notification = add_notification(
                db,
                user_id=current_user.id,
                notification_type=notification_type,
                title=title,
                body=body,
                task_id=task.id,
                dedupe_key=dedupe_key,
            )
        else:
            notification = Notification(
                user_id=current_user.id,
                task_id=task.id,
                notification_type=notification_type,
                title=title,
                body=body,
                dedupe_key=dedupe_key,
                in_app=False,
            )
            db.add(notification)
        if notification is not None:
            created.append(notification)
    return created


def commit_notifications(db):
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Notifications changed while the request was being processed",
        ) from error


@router.get("", response_model=list[NotificationResponse])
def get_notifications(
    response: Response,
    unread_only: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db=Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    created = materialize_reminders(current_user, db)
    if created or db.dirty:
        commit_notifications(db)

    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.in_app.is_(True),
    )
    if unread_only:
        query = query.filter(Notification.read_at.is_(None))
    total = query.count()
    notifications = (
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    response.headers["X-Total-Pages"] = str((total + page_size - 1) // page_size)
    return [serialize_notification(item) for item in notifications]


@router.get("/preferences", response_model=NotificationPreferenceResponse)
def get_preferences(
    db=Depends(get_db), current_user=Depends(auth.get_current_user)
):
    return serialize_preferences(get_notification_preference(current_user.id, db))


@router.put("/preferences", response_model=NotificationPreferenceResponse)
def update_preferences(
    payload: NotificationPreferenceUpdate,
    db=Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    preference = get_notification_preference(current_user.id, db)
    if preference is None:
        preference = NotificationPreference(user_id=current_user.id)
        db.add(preference)
    for field, value in payload.model_dump().items():
        setattr(preference, field, value)
    commit_notifications(db)
    db.refresh(preference)
    return serialize_preferences(preference)


@router.post("/process-reminders", response_model=ReminderProcessingResponse)
def process_reminders(
    db=Depends(get_db), current_user=Depends(auth.get_current_user)
):
    created = materialize_reminders(current_user, db)
    commit_notifications(db)

    preference = get_notification_preference(current_user.id, db)
    email_enabled = bool(preference and preference.email_reminders)
    email_available = is_smtp_configured()
    emails_sent = 0
    email_failures = 0
    if email_enabled and email_available:
        reminders = (
            db.query(Notification, Task)
            .join(Task, Task.id == Notification.task_id)
            .filter(
                Notification.user_id == current_user.id,
                Notification.notification_type.in_(("due_soon", "overdue")),
                Notification.email_sent_at.is_(None),
                Task.status != "done",
            )
            .all()
        )
        for notification, task in reminders:
            try:
                send_task_reminder(current_user.email, task.title, notification.body)
                notification.email_sent_at = datetime.now(timezone.utc)
                db.commit()
                emails_sent += 1
            except Exception:
                db.rollback()
                email_failures += 1
                logger.exception("Unable to send task reminder email")

    return {
        "notifications_created": len(created),
        "emails_sent": emails_sent,
        "email_failures": email_failures,
        "email_available": email_available,
    }


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    db=Depends(get_db), current_user=Depends(auth.get_current_user)
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.in_app.is_(True),
        Notification.read_at.is_(None),
    ).update({Notification.read_at: datetime.now(timezone.utc)}, synchronize_session=False)
    commit_notifications(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db=Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        commit_notifications(db)
        db.refresh(notification)
    return serialize_notification(notification)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    db=Depends(get_db),
    current_user=Depends(auth.get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(notification)
    commit_notifications(db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
