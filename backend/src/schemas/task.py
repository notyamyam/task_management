from typing import Literal

from pydantic import BaseModel, Field, field_validator


TagColor = Literal["slate", "emerald", "blue", "violet", "amber", "rose"]


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
