from ..database import Base
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('backlog', 'in_progress', 'blocked', 'done')",
            name="ck_tasks_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String)
    completed = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"))  # Foreign key to User model (assuming user_id is an integer)
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    assignee_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    due_date = Column(Date, nullable=True, index=True)
    status = Column(
        String(20),
        nullable=False,
        default="backlog",
        server_default="backlog",
        index=True,
    )
    tags = Column(JSONB, nullable=False, default=list)
    priority = Column(String(10), nullable=False, default="medium")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
