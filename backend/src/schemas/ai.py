from typing import Literal

from pydantic import BaseModel, Field


class AIChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[AIChatHistoryMessage] = Field(default_factory=list, max_length=8)
    project_id: int | None = None


class AIChatAction(BaseModel):
    type: Literal["choose_task_csv_scope"]


class AIChatResponse(BaseModel):
    answer: str
    scope: Literal["workspace", "project"]
    action: AIChatAction | None = None


class AIReportContent(BaseModel):
    summary: str = Field(min_length=1, max_length=2000)
    insights: dict[str, str] = Field(default_factory=dict)
