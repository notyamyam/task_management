from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)

from ..database import Base


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "notification_type IN ('assignment', 'mention', 'status_change', "
            "'due_soon', 'overdue')",
            name="ck_notifications_type",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    notification_type = Column(String(30), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    in_app = Column(Boolean, nullable=False, default=True, server_default="true")
    dedupe_key = Column(String(255), nullable=True, unique=True)
    read_at = Column(DateTime(timezone=True), nullable=True, index=True)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (
        CheckConstraint(
            "reminder_days_before BETWEEN 0 AND 30",
            name="ck_notification_preferences_reminder_days",
        ),
    )

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    assignment_notifications = Column(Boolean, nullable=False, default=True, server_default="true")
    mention_notifications = Column(Boolean, nullable=False, default=True, server_default="true")
    status_notifications = Column(Boolean, nullable=False, default=True, server_default="true")
    reminder_notifications = Column(Boolean, nullable=False, default=True, server_default="true")
    email_reminders = Column(Boolean, nullable=False, default=False, server_default="false")
    reminder_days_before = Column(Integer, nullable=False, default=1, server_default="1")
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
