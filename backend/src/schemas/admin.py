import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .task import (
    SubtaskResponse,
    TaskActivityResponse,
    TaskCommentResponse,
    TaskDependencyResponse,
    TaskResponse,
)
from .user import EMAIL_PATTERN


PERMISSION_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$")
ROLE_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Enter a valid email address")
    return email


def normalize_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise ValueError("Name is required")
    if len(name) > 100:
        raise ValueError("Name must be 100 characters or fewer")
    return name


def validate_role_ids(values: list[int]) -> list[int]:
    if len(values) != len(set(values)):
        raise ValueError("Role IDs must be unique")
    return values


def normalize_permission_keys(values: list[str]) -> list[str]:
    keys = [value.strip() for value in values]
    if len(keys) != len(set(keys)):
        raise ValueError("Permission keys must be unique")
    if any(not PERMISSION_KEY_PATTERN.fullmatch(key) for key in keys):
        raise ValueError("Permission keys must use module.action format")
    return keys


class AdminMeResponse(BaseModel):
    permissions: list[str]
    is_super_admin: bool


class AdminUserCreate(BaseModel):
    email: str
    first_name: str
    last_name: str
    temp_password: str
    role_ids: list[int] = Field(default_factory=list)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return normalize_name(value)

    @field_validator("temp_password")
    @classmethod
    def validate_temp_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(value) > 128:
            raise ValueError("Password must be 128 characters or fewer")
        return value

    @field_validator("role_ids")
    @classmethod
    def validate_role_ids(cls, value: list[int]) -> list[int]:
        return validate_role_ids(value)


class AdminUserUpdate(BaseModel):
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    status: Literal["active", "disabled"] | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Email cannot be null")
        return normalize_email(value)

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Name cannot be null")
        return normalize_name(value)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Status cannot be null")
        return value

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one user field is required")
        return self


class AdminUserRoleReplace(BaseModel):
    role_ids: list[int]

    @field_validator("role_ids")
    @classmethod
    def validate_role_ids(cls, value: list[int]) -> list[int]:
        return validate_role_ids(value)


class AdminUserRoleResponse(BaseModel):
    id: int
    slug: str
    name: str
    is_system: bool
    is_protected: bool


class AdminCountSummary(BaseModel):
    count: int


class AdminUserTaskSummary(BaseModel):
    created_count: int
    assigned_count: int


class AdminUserResponse(BaseModel):
    id: int
    email: str | None
    first_name: str | None
    last_name: str | None
    status: Literal["active", "disabled", "deleted"]
    profile_complete: bool
    has_password: bool
    google_linked: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    roles: list[AdminUserRoleResponse]


class AdminUserDetailResponse(AdminUserResponse):
    effective_permissions: list[str]
    owned_projects: AdminCountSummary | None = None
    project_memberships: AdminCountSummary | None = None
    task_activity: AdminUserTaskSummary | None = None


class AdminProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    owner_id: int = Field(gt=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Project name cannot be empty")
        return name

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class AdminProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Project name cannot be null")
        name = value.strip()
        if not name:
            raise ValueError("Project name cannot be empty")
        return name

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one project field is required")
        return self


class AdminProjectTransfer(BaseModel):
    new_owner_id: int = Field(gt=0)


class AdminProjectMemberCreate(BaseModel):
    user_id: int = Field(gt=0)


class AdminProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    owner_id: int
    created_at: datetime
    updated_at: datetime


class AdminProjectMemberResponse(BaseModel):
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminTaskResponse(TaskResponse):
    pass


class AdminSubtaskResponse(SubtaskResponse):
    pass


class AdminTaskDependencyResponse(TaskDependencyResponse):
    pass


class AdminTaskCommentResponse(TaskCommentResponse):
    pass


class AdminTaskActivityResponse(TaskActivityResponse):
    pass


class PermissionResponse(BaseModel):
    id: int
    key: str
    module: str
    action: str
    description: str
    is_protected: bool

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    slug: str
    name: str
    description: str | None = None
    permission_keys: list[str] = Field(default_factory=list)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        slug = value.strip().lower()
        if len(slug) > 100 or not ROLE_SLUG_PATTERN.fullmatch(slug):
            raise ValueError("Role slug must contain lowercase letters, numbers, hyphens, or underscores")
        return slug

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name or len(name) > 100:
            raise ValueError("Role name must be between 1 and 100 characters")
        return name

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        description = value.strip()
        return description or None

    @field_validator("permission_keys")
    @classmethod
    def validate_permission_keys(cls, value: list[str]) -> list[str]:
        return normalize_permission_keys(value)


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Role name cannot be null")
        name = value.strip()
        if not name or len(name) > 100:
            raise ValueError("Role name must be between 1 and 100 characters")
        return name

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        description = value.strip()
        return description or None

    @model_validator(mode="after")
    def require_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one role field is required")
        return self


class RolePermissionReplace(BaseModel):
    version: int = Field(ge=1)
    permission_keys: list[str]

    @field_validator("permission_keys")
    @classmethod
    def validate_permission_keys(cls, value: list[str]) -> list[str]:
        return normalize_permission_keys(value)


class RoleResponse(BaseModel):
    id: int
    slug: str
    name: str
    description: str | None
    is_system: bool
    is_protected: bool
    version: int
    created_at: datetime
    updated_at: datetime
    permission_keys: list[str]
    assignment_count: int


class AdminNotificationResponse(BaseModel):
    id: int
    user_id: int
    notification_type: Literal[
        "assignment",
        "mention",
        "status_change",
        "due_soon",
        "overdue",
    ]
    title: str
    body: str
    task_id: int | None
    actor_user_id: int | None
    read_at: datetime | None
    created_at: datetime


class AdminNotificationPreferenceResponse(BaseModel):
    user_id: int
    assignment_notifications: bool
    mention_notifications: bool
    status_notifications: bool
    reminder_notifications: bool
    email_reminders: bool
    reminder_days_before: int
    updated_at: datetime | None


class AdminAuditActorResponse(BaseModel):
    id: int
    label: str


class AdminAuditLogResponse(BaseModel):
    id: int
    actor_user_id: int | None
    actor: AdminAuditActorResponse | None
    action: str
    resource_type: str
    resource_id: str
    target_user_id: int | None
    metadata: dict[str, object]
    correlation_id: str | None
    outcome: str
    created_at: datetime


class AdminSummarySection(BaseModel):
    count: int
    unread_count: int | None = None


class AdminUserSummary(AdminSummarySection):
    status_counts: dict[Literal["active", "disabled", "deleted"], int]


class AdminTaskSummary(AdminSummarySection):
    open_count: int
    overdue_count: int


class AdminSummaryActivity(BaseModel):
    actor: AdminAuditActorResponse | None
    action: str
    resource_type: str
    resource_id: str
    timestamp: datetime


class AdminSummaryWarning(BaseModel):
    code: Literal[
        "no_backup_super_admin",
        "email_unavailable",
        "ai_unavailable",
    ]
    message: str


class AdminIntegrationHealthResponse(BaseModel):
    email_configured: bool
    ai_configured: bool


class AdminSummaryResponse(BaseModel):
    users: AdminUserSummary | None = None
    roles: AdminSummarySection | None = None
    projects: AdminSummarySection | None = None
    project_members: AdminSummarySection | None = None
    tasks: AdminTaskSummary | None = None
    subtasks: AdminSummarySection | None = None
    task_dependencies: AdminSummarySection | None = None
    task_comments: AdminSummarySection | None = None
    task_activity: AdminSummarySection | None = None
    notifications: AdminSummarySection | None = None
    notification_preferences: AdminSummarySection | None = None
    audit_logs: AdminSummarySection | None = None
    system_integrations: AdminIntegrationHealthResponse | None = None
    recent_activity: list[AdminSummaryActivity] | None = None
    warnings: list[AdminSummaryWarning] | None = None
