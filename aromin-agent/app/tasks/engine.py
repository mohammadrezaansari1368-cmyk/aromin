"""Task Engine — Phase 1 subset: durable rows for inline (immediate) agent turns.

Implemented now (Task Engine reference §9.1, §9.3, §9.5 rule 5):
- every agent turn gets its task row in the same transaction as the user's message;
- status transitions are validated against the reference transition table;
- one running turn per conversation via ``concurrency_key = conv:<id>`` and a unique index.

Not implemented yet (later phase): worker claim loop, step journal, side-effect ledger,
retries/backoff, waiting states, escalation to background, reaper, schedules, fallback tasks.
Because there is no reaper yet, an inline turn whose lease has expired (API crash) is
marked ``failed`` when the next message for that conversation arrives, so the
conversation never stays blocked.
"""

from __future__ import annotations

import os
import socket
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.exc import IntegrityError

from app.core.errors import ConversationBusy
from app.core.ids import new_id
from app.core.logging import get_logger
from app.db.uow import UnitOfWork
from app.models.base import utcnow
from app.models.task import TERMINAL_STATUSES, Task

log = get_logger(__name__)

# (from, to) pairs allowed by the reference §9.3 transition table.
ALLOWED_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("queued", "running"), ("queued", "cancelled"),
        ("running", "succeeded"), ("running", "failed"), ("running", "cancelled"),
        ("running", "queued"), ("running", "waiting"), ("running", "dead"),
        ("waiting", "queued"), ("waiting", "running"), ("waiting", "cancelled"),
        ("queued", "failed"), ("waiting", "failed"),
        ("failed", "queued"), ("dead", "queued"),
    }
)  # fmt: skip

LANE_INTERACTIVE = 0
AGENT_TURN_KIND = "agent.run"


class IllegalTransition(Exception):
    pass


def conversation_key(conversation_id: str) -> str:
    return f"conv:{conversation_id}"


def api_owner() -> str:
    return f"api:{socket.gethostname()}:{os.getpid()}"


class TaskEngine:
    def __init__(self, lease_seconds: int) -> None:
        self._lease = timedelta(seconds=lease_seconds)

    @staticmethod
    def transition(task: Task, to_status: str) -> None:
        if (task.status, to_status) not in ALLOWED_TRANSITIONS:
            raise IllegalTransition(f"illegal task transition {task.status} -> {to_status}")
        task.status = to_status
        if to_status != "running":
            task.lease_owner = None
            task.lease_until = None
        if to_status in TERMINAL_STATUSES:
            task.finished_at = utcnow()
        task.updated_at = utcnow()

    async def start_inline_turn(
        self,
        uow: UnitOfWork,
        *,
        conversation_id: str,
        trigger_seq: int,
        created_by: str,
        input_extra: dict[str, Any] | None = None,
    ) -> Task:
        key = conversation_key(conversation_id)
        current = await uow.tasks.running_with_key(key)
        now = utcnow()
        if current is not None:
            if current.lease_until is not None and _aware(current.lease_until) < now:
                # No reaper in Phase 1: an expired inline lease means the owning process died.
                self.transition(current, "failed")
                current.total_failures += 1
                current.last_error = {"code": "lease_expired", "error_class": "lease_lost"}
                await uow.tasks.flush()
                log.warning("task.lease_expired", task_id=current.id, conversation_id=conversation_id)
            else:
                raise ConversationBusy()
        if await uow.tasks.waiting_for_conversation(conversation_id):
            raise ConversationBusy("A previous turn is waiting for an approval decision")
        task = Task(
            id=new_id("task"),
            kind=AGENT_TURN_KIND,
            kind_version=1,
            lane=LANE_INTERACTIVE,
            mode="immediate",
            status="running",
            run_at=now,
            lease_owner=api_owner(),
            lease_token=1,
            lease_until=now + self._lease,
            heartbeat_at=now,
            attempt=1,
            concurrency_key=key,
            conversation_id=conversation_id,
            input={"trigger_seq": trigger_seq, **(input_extra or {})},
            state={},
            emit_events=True,
            created_by=created_by,
            created_at=now,
            updated_at=now,
            started_at=now,
        )
        uow.tasks.add(task)
        try:
            await uow.tasks.flush()
        except IntegrityError as exc:  # lost a race on tasks_one_running_per_key
            raise ConversationBusy() from exc
        return task

    def enter_wait(self, task: Task, *, wait_kind: str, wait_ref: str) -> None:
        """running -> waiting: the slot and lease are released while a human decides."""
        self.transition(task, "waiting")
        task.wait_kind, task.wait_ref = wait_kind, wait_ref

    async def resume(self, uow: UnitOfWork, task: Task) -> None:
        """waiting -> running under a fresh lease; still one running turn per conversation."""
        now = utcnow()
        self.transition(task, "running")
        task.wait_kind = None
        task.lease_owner, task.lease_until, task.heartbeat_at = api_owner(), now + self._lease, now
        task.lease_token += 1
        task.attempt += 1
        try:
            await uow.tasks.flush()
        except IntegrityError as exc:
            raise ConversationBusy() from exc

    def cancel(self, task: Task, reason: str) -> None:
        self.transition(task, "cancelled")
        task.wait_kind = None
        task.last_error = {"code": "cancelled", "error_class": "cancelled", "message": reason[:200]}

    def succeed(self, task: Task, result: dict[str, Any]) -> None:
        self.transition(task, "succeeded")
        task.result = result
        task.consecutive_failures = 0

    def fail(self, task: Task, *, code: str, error_class: str, message: str) -> None:
        self.transition(task, "failed")
        task.consecutive_failures += 1
        task.total_failures += 1
        task.last_error = {"code": code, "error_class": error_class, "message": message}


def _aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; all stored values are UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
