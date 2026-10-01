"""Public API contracts (blueprint §16). Inputs are validated strictly; unknown fields
are rejected so typos fail loudly instead of being ignored.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.ids import id_pattern

ApiChannel = Literal["web", "api"]  # SMS conversations are created by the SMS webhook in a later phase


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CreateConversationRequest(StrictModel):
    channel: ApiChannel = "api"
    customer_ref: str | None = Field(default=None, max_length=80)
    metadata: dict[str, str] = Field(default_factory=dict, max_length=20)

    @field_validator("metadata")
    @classmethod
    def _small_metadata(cls, v: dict[str, str]) -> dict[str, str]:
        for key, value in v.items():
            if len(key) > 64 or len(value) > 256:
                raise ValueError("metadata keys must be ≤ 64 chars and values ≤ 256 chars")
        return v


class MessageOut(BaseModel):
    id: str
    seq: int
    role: str
    content: str
    created_at: datetime


class ConversationOut(BaseModel):
    id: str
    channel: str
    status: str
    agent_profile: str
    created_at: datetime
    last_message_at: datetime | None
    metadata: dict[str, Any]


class ConversationWithMessages(ConversationOut):
    messages: list[MessageOut]
    next_cursor: int | None


class ChatRequestIn(StrictModel):
    conversation_id: str | None = Field(default=None, pattern=id_pattern("conv"))
    message: str = Field(min_length=1, max_length=4000)
    client_msg_id: str | None = Field(default=None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")
    channel: ApiChannel = "api"


class UsageOut(BaseModel):
    input_tokens: int
    output_tokens: int


class ChatResponseOut(BaseModel):
    conversation_id: str
    task_id: str
    user_message_id: str
    message: MessageOut
    sources: list[dict[str, Any]] = Field(default_factory=list)
    usage: UsageOut | None = None
    replayed: bool = False


class TaskErrorOut(BaseModel):
    code: str
    error_class: str | None = None


class TaskOut(BaseModel):
    id: str
    kind: str
    status: str
    mode: str
    lane: int
    conversation_id: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: TaskErrorOut | None = None


class HealthOut(BaseModel):
    status: Literal["ok"]
    version: str


class ReadyOut(BaseModel):
    status: Literal["ready", "not_ready"]
    checks: dict[str, str]
