"""Bounded PostgreSQL expired-owner recovery; never steals a live lease.

Caller owns the transaction. Journal/ledger/fallback transition integration is
still required before this primitive is enabled in a production worker.
"""

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.tasks.claim import _postgres
from app.tasks.retry import FailureClass, apply_plan, retry_plan


@dataclass(frozen=True)
class ReapResult:
    requeued: tuple[str, ...] = ()
    cancelled: tuple[str, ...] = ()
    dead: tuple[str, ...] = ()
    failed: tuple[str, ...] = ()


class TaskReaper:
    def __init__(self, *, batch_size: int = 100, max_consecutive_failures: int | None = None):
        if not 1 <= batch_size <= 1000:
            raise ValueError("batch_size must be between 1 and 1000")
        if max_consecutive_failures is not None and not 1 <= max_consecutive_failures <= 100:
            raise ValueError("max_consecutive_failures must be between 1 and 100")
        self.batch_size = batch_size
        self.max_consecutive_failures = max_consecutive_failures

    async def reap_batch(self, session: AsyncSession) -> ReapResult:
        _postgres(session)
        tasks = (
            (
                await session.execute(
                    select(Task)
                    .where(Task.status == "running", Task.lease_until <= func.statement_timestamp())
                    .order_by(Task.lease_until, Task.id)
                    .limit(self.batch_size)
                    .with_for_update(skip_locked=True)
                    .execution_options(populate_existing=True)
                )
            )
            .scalars()
            .all()
        )
        # Read database time AFTER acquiring locks; Python host time never coordinates ownership.
        now = (await session.execute(select(func.statement_timestamp()))).scalar_one()
        results = {status: [] for status in ("queued", "cancelled", "dead", "failed")}
        for task in tasks:
            if self.max_consecutive_failures is not None:
                task.max_consecutive_failures = self.max_consecutive_failures
            plan = retry_plan(task, FailureClass.bug, now=now, expired=True)
            old_owner, token = task.lease_owner, task.lease_token
            apply_plan(task, plan, now=now)
            task.last_error = {
                "code": "lease_expired" if plan.status in ("queued", "dead") else plan.code,
                "error_class": "worker_lost",
                "owner": old_owner,
                "token": token,
            }
            results[plan.status].append(task.id)
        await session.flush()
        return ReapResult(*(tuple(results[s]) for s in ("queued", "cancelled", "dead", "failed")))
