"""Task row (subset of Task Engine reference §9.2 needed for inline agent turns).

The status set, lanes, modes, lease/fencing columns and the one-running-per-key index
follow the reference so later phases extend this table instead of replacing it.
``task_steps``, ``side_effects``, ``schedules`` and the claim loop are later phases.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONType, TZDateTime, utcnow

TASK_STATUSES = ("queued", "running", "waiting", "succeeded", "failed", "cancelled", "dead")
TASK_MODES = ("immediate", "background", "scheduled")
TERMINAL_STATUSES = frozenset({"succeeded", "failed", "cancelled", "dead"})


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(f"status IN {TASK_STATUSES}", name="status"),
        CheckConstraint(f"mode IN {TASK_MODES}", name="mode"),
        CheckConstraint("lane BETWEEN 0 AND 3", name="lane"),
        CheckConstraint("(status = 'running') = (lease_owner IS NOT NULL AND lease_until IS NOT NULL)", name="lease"),
        Index(
            "tasks_one_running_per_key",
            "concurrency_key",
            unique=True,
            postgresql_where=text("status = 'running' AND concurrency_key IS NOT NULL"),
            sqlite_where=text("status = 'running' AND concurrency_key IS NOT NULL"),
        ),
        Index("ix_tasks_lane_run_at", "lane", "run_at"),
        Index("ix_tasks_conversation_id_status", "conversation_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    kind: Mapped[str] = mapped_column(String(64))
    kind_version: Mapped[int] = mapped_column(SmallInteger, default=1)
    lane: Mapped[int] = mapped_column(SmallInteger)
    mode: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))
    run_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    deadline_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    lease_owner: Mapped[str | None] = mapped_column(String(128))
    lease_token: Mapped[int] = mapped_column(BigInteger, default=0)
    lease_until: Mapped[datetime | None] = mapped_column(TZDateTime)
    heartbeat_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    total_failures: Mapped[int] = mapped_column(Integer, default=0)
    generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    initial_state: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict, server_default="{}")
    expiries_since_progress: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    max_consecutive_failures: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    max_total_failures: Mapped[int] = mapped_column(Integer, default=20, server_default="20")
    concurrency_key: Mapped[str | None] = mapped_column(String(128))
    dedupe_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    parent_task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[str | None] = mapped_column(ForeignKey("conversations.id", ondelete="SET NULL"))
    customer_id: Mapped[str | None] = mapped_column(String(40))
    lead_id: Mapped[str | None] = mapped_column(String(40))
    input: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    state: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    last_error: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    progress: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    wait_kind: Mapped[str | None] = mapped_column(String(16))  # approval | human | time (Phase 2: approval)
    wait_ref: Mapped[str | None] = mapped_column(String(80))  # e.g. "approval:<id>"
    step_count: Mapped[int] = mapped_column(Integer, default=0)
    emit_events: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow, onupdate=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    finished_at: Mapped[datetime | None] = mapped_column(TZDateTime)
