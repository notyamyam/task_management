from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


TagColor = Literal["slate", "emerald", "blue", "violet", "amber", "rose"]
TaskStatus = Literal["backlog", "in_progress", "blocked", "done"]


class TaskTag(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    color: TagColor = "slate"

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Task tag name cannot be empty")
        return name


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    completed: bool = False
    project_id: int | None = Field(default=None, gt=0)
    assignee_user_id: int | None = Field(default=None, gt=0)
    due_date: date | None = None
    status: TaskStatus = "backlog"
    tags: list[TaskTag] = Field(default_factory=list, max_length=10)
    priority: Literal["low", "medium", "high"] = "medium"

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Task title cannot be empty")
        return title

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("tags", mode="before")
    @classmethod
    def upgrade_legacy_tags(cls, values):
        if not isinstance(values, list):
            return values
        return [
            {"name": value, "color": "slate"} if isinstance(value, str) else value
            for value in values
        ]

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[TaskTag]) -> list[TaskTag]:
        tags = []
        seen = set()
        for tag in values:
            normalized_tag = tag.name.casefold()
            if normalized_tag not in seen:
                seen.add(normalized_tag)
                tags.append(tag)
        return tags


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskUserResponse(BaseModel):
    id: int
    email: str
    first_name: str | None
    last_name: str | None


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str | None
    completed: bool
    status: TaskStatus
    user_id: int
    created_by: TaskUserResponse | None
    updated_by: TaskUserResponse | None
    assignee_user_id: int | None
    assignee: TaskUserResponse | None
    project_id: int | None
    project_name: str | None
    due_date: date | None
    tags: list[TaskTag]
    priority: Literal["low", "medium", "high"]
    created_at: datetime
    updated_at: datetime
