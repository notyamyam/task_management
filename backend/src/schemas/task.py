from typing import Literal

from pydantic import BaseModel, Field, field_validator


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    completed: bool = False
    project_id: int | None = Field(default=None, gt=0)
    tags: list[str] = Field(default_factory=list, max_length=10)
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

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        tags = []
        seen = set()
        for value in values:
            tag = value.strip()
            if not tag:
                continue
            if len(tag) > 30:
                raise ValueError("Each task tag must be 30 characters or fewer")
            normalized_tag = tag.casefold()
            if normalized_tag not in seen:
                seen.add(normalized_tag)
                tags.append(tag)
        return tags
