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


class ToolCallOut(BaseModel):
    tool: str
    step_no: int
    status: str
    error_type: str | None = None


class ChatResponseOut(BaseModel):
    conversation_id: str
    task_id: str
    user_message_id: str
    status: Literal["completed", "waiting_approval"] = "completed"
    message: MessageOut | None = None
    approval_id: str | None = None
    tool_calls: list[ToolCallOut] = Field(default_factory=list)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    usage: UsageOut | None = None
    replayed: bool = False


class TaskErrorOut(BaseModel):
    code: str
    error_class: str | None = None


class TaskUsageOut(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost: float | None


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
    wait_kind: str | None = None
    pending_approval_id: str | None = None
    cancel_requested: bool = False
    step_count: int = 0
    usage: TaskUsageOut | None = None


class TaskStepOut(BaseModel):
    step_no: int
    type: str
    name: str
    status: str
    error_type: str | None
    error_code: str | None
    execution_id: str | None
    approval_id: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class TaskStepsOut(BaseModel):
    task_id: str
    steps: list[TaskStepOut]


class ToolExecutionOut(BaseModel):
    id: str
    task_id: str | None
    step_no: int | None
    conversation_id: str | None
    tool_name: str
    tool_version: str
    actor_type: str
    actor_id: str
    input_hash: str | None
    sanitized_input: dict[str, Any] | None
    output_status: str
    error_type: str | None
    error_code: str | None
    policy_decision: str | None
    risk_level: str | None
    started_at: datetime | None
    completed_at: datetime | None
    latency_ms: int | None
    retry_count: int
    approval_id: str | None
    idempotency_key: str | None


class ApprovalOut(BaseModel):
    id: str
    task_id: str
    step_no: int
    conversation_id: str | None
    tool_name: str
    tool_version: str
    risk_level: str
    reason: str
    sanitized_input: dict[str, Any] | None
    requested_by: str
    status: str
    expires_at: datetime
    decided_by: str | None
    decided_at: datetime | None
    decision_note: str | None
    created_at: datetime


class ApprovalDecisionIn(StrictModel):
    note: str | None = Field(default=None, max_length=500)


class ApprovalDecisionOut(BaseModel):
    approval: ApprovalOut
    task_id: str
    task_status: str
    message: MessageOut | None = None
    next_approval_id: str | None = None
    error_code: str | None = None


class CancelTaskOut(BaseModel):
    task_id: str
    status: str
    cancel_requested: bool


class HealthOut(BaseModel):
    status: Literal["ok"]
    version: str


class ReadyOut(BaseModel):
    status: Literal["ready", "not_ready"]
    checks: dict[str, str]
