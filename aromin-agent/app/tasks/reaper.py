"""Recovery for expired PostgreSQL task leases.

The reaper never trusts Redis and never steals a live lease.  It first locks a
small SKIP LOCKED batch, then transitions only rows whose exact fencing token is
still expired.  A heartbeat that wins the row lock makes the task ineligible;
a reaper that wins the row lock invalidates the old owner by clearing ownership
and the next claim increments the token.

This module deliberately does not execute tasks.  It only restores durable
eligibility after an owner disappears.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.tasks.claim import _postgres


@dataclass(frozen=True)
class ReapResult:
    requeued: tuple[str, ...] = ()
    cancelled: tuple[str, ...] = ()
    dead: tuple[str, ...] = ()


class TaskReaper:
    def __init__(self, *, batch_size: int = 100, max_consecutive_failures: int = 5) -> None:
        if not 1 <= batch_size <= 1000:
            raise ValueError("batch_size must be between 1 and 1000")
        if not 1 <= max_consecutive_failures <= 100:
            raise ValueError("max_consecutive_failures must be between 1 and 100")
        self.batch_size = batch_size
        self.max_consecutive_failures = max_consecutive_failures

    async def reap_batch(self, session: AsyncSession) -> ReapResult:
        """Recover one bounded batch. Caller owns the surrounding transaction."""
        _postgres(session)
        rows = (
            await session.execute(
                select(Task.id, Task.lease_token, Task.cancel_requested, Task.consecutive_failures)
                .where(
                    Task.status == "running",
                    Task.lease_until.is_not(None),
                    Task.lease_until <= func.statement_timestamp(),
                )
                .order_by(Task.lease_until, Task.id)
                .limit(self.batch_size)
                .with_for_update(skip_locked=True)
            )
        ).all()

        requeued: list[str] = []
        cancelled: list[str] = []
        dead: list[str] = []
        for task_id, token, cancel_requested, consecutive_failures in rows:
            failures = int(consecutive_failures or 0) + 1
            if cancel_requested:
                status = "cancelled"
            elif failures >= self.max_consecutive_failures:
                status = "dead"
            else:
                status = "queued"

            values = {
                "status": status,
                "lease_owner": None,
                "lease_until": None,
                "heartbeat_at": None,
                "updated_at": func.statement_timestamp(),
                "consecutive_failures": failures,
                "total_failures": Task.total_failures + 1,
                "last_error": {
                    "code": "lease_expired",
                    "error_class": "worker_lost",
                    "message": "task owner lease expired before a safe completion boundary",
                },
            }
            if status == "queued":
                values["run_at"] = func.statement_timestamp()
                values["mode"] = "background"
            else:
                values["finished_at"] = func.statement_timestamp()
                values["wait_kind"] = None

            changed = (
                await session.execute(
                    update(Task)
                    .where(
                        Task.id == task_id,
                        Task.status == "running",
                        Task.lease_token == token,
                        Task.lease_until.is_not(None),
                        Task.lease_until <= func.statement_timestamp(),
                    )
                    .values(**values)
                    .returning(Task.id)
                    .execution_options(synchronize_session=False)
                )
            ).scalar_one_or_none()
            if changed is None:
                continue
            if status == "queued":
                requeued.append(task_id)
            elif status == "cancelled":
                cancelled.append(task_id)
            else:
                dead.append(task_id)

        return ReapResult(tuple(requeued), tuple(cancelled), tuple(dead))
