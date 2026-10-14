from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


NotificationType = Literal[
    "assignment",
    "mention",
    "status_change",
    "due_soon",
    "overdue",
]


class NotificationResponse(BaseModel):
    id: int
    notification_type: NotificationType
    title: str
    body: str
    task_id: int | None
    actor_user_id: int | None
    read_at: datetime | None
    created_at: datetime


class NotificationPreferenceUpdate(BaseModel):
    assignment_notifications: bool = True
    mention_notifications: bool = True
    status_notifications: bool = True
    reminder_notifications: bool = True
    email_reminders: bool = False
    reminder_days_before: int = Field(default=1, ge=0, le=30)


class NotificationPreferenceResponse(NotificationPreferenceUpdate):
    updated_at: datetime | None = None


class ReminderProcessingResponse(BaseModel):
    notifications_created: int
    emails_sent: int
    email_failures: int
    email_available: bool
