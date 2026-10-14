from ..models import Notification, NotificationPreference


PREFERENCE_FIELDS = {
    "assignment": "assignment_notifications",
    "mention": "mention_notifications",
    "status_change": "status_notifications",
    "due_soon": "reminder_notifications",
    "overdue": "reminder_notifications",
}


def get_notification_preference(user_id, db):
    return (
        db.query(NotificationPreference)
        .filter(NotificationPreference.user_id == user_id)
        .first()
    )


def preference_enabled(user_id, notification_type, db):
    preference = get_notification_preference(user_id, db)
    if preference is None:
        return True
    return bool(getattr(preference, PREFERENCE_FIELDS[notification_type]))


def add_notification(
    db,
    *,
    user_id,
    notification_type,
    title,
    body,
    task_id=None,
    actor_user_id=None,
    dedupe_key=None,
):
    if actor_user_id == user_id:
        return None
    with db.no_autoflush:
        if not preference_enabled(user_id, notification_type, db):
            return None
        if dedupe_key and db.query(Notification.id).filter(
            Notification.dedupe_key == dedupe_key
        ).first():
            return None
    notification = Notification(
        user_id=user_id,
        actor_user_id=actor_user_id,
        task_id=task_id,
        notification_type=notification_type,
        title=title,
        body=body,
        dedupe_key=dedupe_key,
    )
    db.add(notification)
    return notification
