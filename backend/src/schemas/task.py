from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


TagColor = Literal["slate", "emerald", "blue", "violet", "amber", "rose"]
TaskStatus = Literal["backlog", "in_progress", "blocked", "done"]
TaskActivityType = Literal[
    "task_created",
    "comment_added",
    "status_changed",
    "assignment_changed",
    "priority_changed",
    "due_date_changed",
]


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
    priority: Literal["low", "medium", "high"] | None = None

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
    priority: Literal["low", "medium", "high"] | None
    created_at: datetime
    updated_at: datetime
    subtask_count: int = 0
    completed_subtask_count: int = 0
    unresolved_dependency_count: int = 0


class TaskCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    mentioned_user_ids: list[int] = Field(default_factory=list, max_length=25)

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        body = value.strip()
        if not body:
            raise ValueError("Comment cannot be empty")
        return body

    @field_validator("mentioned_user_ids")
    @classmethod
    def normalize_mentioned_user_ids(cls, values: list[int]) -> list[int]:
        if any(user_id <= 0 for user_id in values):
            raise ValueError("Mentioned user IDs must be positive")
        return list(dict.fromkeys(values))


class TaskCommentUpdate(TaskCommentCreate):
    pass


class TaskCommentResponse(BaseModel):
    id: int
    task_id: int
    body: str
    author: TaskUserResponse
    mentioned_users: list[TaskUserResponse]
    created_at: datetime


class TaskActivityResponse(BaseModel):
    id: int
    task_id: int
    event_type: TaskActivityType
    field_name: str | None
    old_value: str | None
    new_value: str | None
    actor: TaskUserResponse
    created_at: datetime


class SubtaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    completed: bool = False
    assignee_user_id: int | None = Field(default=None, gt=0)
    due_date: date | None = None
    position: int = Field(default=0, ge=0, le=100000)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Subtask title cannot be empty")
        return title

    @field_validator("description")
    @classmethod
    def normalize_subtask_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class SubtaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    completed: bool | None = None
    assignee_user_id: int | None = Field(default=None, gt=0)
    due_date: date | None = None
    position: int | None = Field(default=None, ge=0, le=100000)

    @field_validator("title")
    @classmethod
    def normalize_optional_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        title = value.strip()
        if not title:
            raise ValueError("Subtask title cannot be empty")
        return title

    @field_validator("description")
    @classmethod
    def normalize_optional_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def require_update(self):
        if not self.model_fields_set:
            raise ValueError("At least one subtask field is required")
        non_nullable_fields = {"title", "completed", "position"}
        if any(
            field in self.model_fields_set and getattr(self, field) is None
            for field in non_nullable_fields
        ):
            raise ValueError("title, completed, and position cannot be null")
        return self


class SubtaskResponse(BaseModel):
    id: int
    task_id: int
    title: str
    description: str | None
    completed: bool
    assignee_user_id: int | None
    assignee: TaskUserResponse | None
    due_date: date | None
    position: int
    created_at: datetime
    updated_at: datetime


class TaskDependencyCreate(BaseModel):
    blocked_by_task_id: int = Field(gt=0)


class DependencyTaskResponse(BaseModel):
    id: int
    title: str
    status: TaskStatus
    completed: bool
    due_date: date | None


class TaskDependencyResponse(BaseModel):
    id: int
    task_id: int
    blocked_by_task: DependencyTaskResponse
    resolved: bool
    created_at: datetime
