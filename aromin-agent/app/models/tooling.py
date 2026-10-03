"""Phase 2 tables: task steps, tool executions, approvals, external effect ledger, LLM usage.

- ``task_steps``: the per-task journal (reference §9.6, statuses per Phase 2 spec).
- ``tool_executions``: one row per tool request, whatever the outcome (denied rows included).
- ``approvals``: human decisions for tools that need them (blueprint §14).
- ``side_effects``: the external effect ledger (reference §9.7), separate from executions:
  an execution is "we ran a tool"; a side effect is "something left our system".
- ``llm_usage``: one row per model invocation (blueprint §17), for cost and monitoring.

Nothing here stores secrets or model reasoning: inputs are sanitized before they are written.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONType, TZDateTime, utcnow

STEP_STATUSES = ("pending", "running", "succeeded", "failed", "cancelled", "waiting_approval", "skipped")
STEP_TYPES = ("model_call", "tool_call")
EXECUTION_STATUSES = ("pending", "running", "succeeded", "failed", "denied", "waiting_approval", "cancelled")
ERROR_TYPES = (
    "validation_error", "authorization_error", "policy_denied", "approval_required", "timeout",
    "provider_error", "network_error", "business_error", "unknown_error",
)  # fmt: skip
APPROVAL_STATUSES = ("pending", "approved", "rejected", "expired", "cancelled")
EFFECT_STATUSES = ("pending", "succeeded", "failed", "unknown")


class TaskStep(Base):
    __tablename__ = "task_steps"
    __table_args__ = (
        UniqueConstraint("task_id", "generation", "step_no", name="uq_task_steps_task_generation_step"),
        CheckConstraint(f"status IN {STEP_STATUSES}", name="status"),
        CheckConstraint(f"type IN {STEP_TYPES}", name="type"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    step_no: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(128))  # tool name or model name
    status: Mapped[str] = mapped_column(String(20))
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    replay_input: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    state_after: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    lease_token: Mapped[int | None] = mapped_column(Integer)
    parent_step_no: Mapped[int | None] = mapped_column(Integer)
    tool_call_id: Mapped[str | None] = mapped_column(String(80))
    input: Mapped[dict[str, Any] | None] = mapped_column(JSONType)  # sanitized, pinned tool args
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONType)  # compact, sanitized
    error_type: Mapped[str | None] = mapped_column(String(32))
    error_code: Mapped[str | None] = mapped_column(String(64))
    execution_id: Mapped[str | None] = mapped_column(String(40))
    approval_id: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class ToolExecution(Base):
    __tablename__ = "tool_executions"
    __table_args__ = (
        CheckConstraint(f"output_status IN {EXECUTION_STATUSES}", name="output_status"),
        CheckConstraint(f"error_type IS NULL OR error_type IN {ERROR_TYPES}", name="error_type"),
        Index("uq_tool_executions_task_id_step_no", "task_id", "generation", "step_no", unique=True),
        Index(
            "uq_tool_executions_succeeded_key",
            "idempotency_key",
            unique=True,
            postgresql_where=text("output_status = 'succeeded' AND idempotency_key IS NOT NULL"),
            sqlite_where=text("output_status = 'succeeded' AND idempotency_key IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    step_no: Mapped[int | None] = mapped_column(Integer)
    conversation_id: Mapped[str | None] = mapped_column(String(40), index=True)
    tool_name: Mapped[str] = mapped_column(String(128), index=True)
    tool_version: Mapped[str] = mapped_column(String(16))
    actor_type: Mapped[str] = mapped_column(String(32))
    actor_id: Mapped[str] = mapped_column(String(80))
    input_hash: Mapped[str | None] = mapped_column(String(64))
    sanitized_input: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    output_status: Mapped[str] = mapped_column(String(20))
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    error_type: Mapped[str | None] = mapped_column(String(32))
    error_code: Mapped[str | None] = mapped_column(String(64))
    policy_decision: Mapped[str | None] = mapped_column(String(20))
    risk_level: Mapped[str | None] = mapped_column(String(10))
    started_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    completed_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    approval_id: Mapped[str | None] = mapped_column(String(40))
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class Approval(Base):
    __tablename__ = "approvals"
    __table_args__ = (
        CheckConstraint(f"status IN {APPROVAL_STATUSES}", name="status"),
        Index(
            "uq_approvals_pending_step",
            "task_id",
            "generation",
            "step_no",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    step_no: Mapped[int] = mapped_column(Integer)
    execution_id: Mapped[str | None] = mapped_column(String(40))
    conversation_id: Mapped[str | None] = mapped_column(String(40), index=True)
    tool_name: Mapped[str] = mapped_column(String(128))
    tool_version: Mapped[str] = mapped_column(String(16))
    risk_level: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str] = mapped_column(String(64))
    sanitized_input: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    requested_by: Mapped[str] = mapped_column(String(80))  # principal that started the turn
    status: Mapped[str] = mapped_column(String(16), default="pending")
    expires_at: Mapped[datetime] = mapped_column(TZDateTime)
    decided_by: Mapped[str | None] = mapped_column(String(80))
    decided_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    decision_note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)


class SideEffectRecord(Base):
    __tablename__ = "side_effects"
    __table_args__ = (CheckConstraint(f"status IN {EFFECT_STATUSES}", name="status"),)

    idempotency_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
    generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    step_no: Mapped[int | None] = mapped_column(Integer)
    execution_id: Mapped[str | None] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(64))
    request_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))
    provider_ref: Mapped[str | None] = mapped_column(String(128))
    response: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, onupdate=utcnow)


class LLMUsage(Base):
    __tablename__ = "llm_usage"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(40), index=True)
    generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    step_no: Mapped[int | None] = mapped_column(Integer)
    provider: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    tier: Mapped[str | None] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))  # succeeded | failed
    error_type: Mapped[str | None] = mapped_column(String(64))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost: Mapped[float | None] = mapped_column(Numeric(14, 6))
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
