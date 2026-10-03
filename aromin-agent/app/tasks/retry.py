"""Durable retry decisions: equal jitter, deadlines and explicit effect ambiguity.

No caller may classify an unsafe external request as unsent without proof from
its adapter. Unknown outcomes are never converted into automatic retries.
"""

import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.tasks.claim import Lease
from app.tasks.journal import JournalStore


class FailureClass(StrEnum):
    transient = "transient"
    dependency_unavailable = "dependency_unavailable"
    outcome_unknown = "outcome_unknown"
    permanent = "permanent"
    bug = "bug"
    lease_lost = "lease_lost"


@dataclass(frozen=True)
class RetryPlan:
    status: str
    delay_seconds: float
    consecutive_failures: int
    total_failures: int
    expiries_since_progress: int
    code: str


def backoff(lane: int, failures: int, *, fraction: float | None = None) -> float:
    if lane not in range(4) or failures < 1:
        raise ValueError("invalid backoff position")
    if fraction is None:
        fraction = random.SystemRandom().random()
    if not 0 <= fraction <= 1:
        raise ValueError("invalid jitter fraction")
    base, cap = ((2, 30), (15, 600), (30, 1800), (60, 7200))[lane]
    bound = min(cap, base * 2 ** min(failures - 1, 16))
    return bound * (1 + fraction) / 2


def classify_external(
    *, unsafe: bool, definitely_unsent: bool = False, status_code: int | None = None, credentials_failed: bool = False
) -> FailureClass:
    if status_code is not None and 200 <= status_code < 300:
        raise ValueError("successful provider outcome is not a failure")
    if credentials_failed or status_code in (401, 403):
        return FailureClass.dependency_unavailable
    if status_code == 429:
        return FailureClass.transient  # definite provider rejection
    if unsafe and not definitely_unsent:
        if status_code is None or status_code == 408 or status_code >= 500:
            return FailureClass.outcome_unknown
    if status_code is not None and 400 <= status_code < 500:
        return FailureClass.permanent
    return FailureClass.transient


def retry_plan(
    task: Task,
    failure: FailureClass,
    *,
    now: datetime,
    expired: bool = False,
    retry_after: float = 0,
    fraction: float | None = None,
) -> RetryPlan:
    if not math.isfinite(retry_after) or retry_after < 0:
        raise ValueError("invalid retry_after")
    failures, total, expiries = task.consecutive_failures, task.total_failures, task.expiries_since_progress
    if task.cancel_requested:
        return RetryPlan("cancelled", 0, failures, total, expiries, "cancelled")
    if failure == FailureClass.lease_lost:
        raise ValueError("lost owners must not write a retry")
    if failure == FailureClass.outcome_unknown:
        raise ValueError("unknown effect requires ledger reconciliation/resolution")
    if task.deadline_at is not None and task.deadline_at <= now:
        return RetryPlan("failed", 0, failures, total, expiries, "deadline_exceeded")
    if failure == FailureClass.permanent:
        return RetryPlan("failed", 0, failures, total, expiries, "permanent_failure")
    if failure == FailureClass.dependency_unavailable:
        delay = max(60, retry_after)
    else:
        failures += 1
        total += 1
        expiries += int(expired)
        if failures >= task.max_consecutive_failures or total >= task.max_total_failures or expiries >= 3:
            return RetryPlan("dead", 0, failures, total, expiries, "failure_limit")
        delay = max(backoff(task.lane, failures, fraction=fraction), retry_after)
    if task.deadline_at is not None:
        # A retry that cannot run before an absolute deadline fails now, never strands a queued row.
        if now + timedelta(seconds=delay) >= task.deadline_at:
            return RetryPlan("failed", 0, failures, total, expiries, "deadline_exceeded")
    return RetryPlan("queued", delay, failures, total, expiries, failure.value)


def apply_plan(task: Task, plan: RetryPlan, *, now: datetime):
    task.status = plan.status
    task.lease_owner = task.lease_until = task.heartbeat_at = None
    task.wait_kind = None
    task.consecutive_failures = plan.consecutive_failures
    task.total_failures = plan.total_failures
    task.expiries_since_progress = plan.expiries_since_progress
    task.updated_at = now
    task.last_error = {"code": plan.code, "error_class": plan.code}
    if plan.status == "queued":
        task.run_at = now + timedelta(seconds=plan.delay_seconds)
        task.mode = "background"
        task.finished_at = None
    else:
        task.finished_at = now


class RetryStore:
    def __init__(self, journal: JournalStore | None = None):
        self.journal = journal or JournalStore()

    async def fail(self, session: AsyncSession, lease: Lease, failure: FailureClass, *, retry_after: float = 0):
        task = await self.journal.owned_task(session, lease)
        now = (await session.execute(select(func.current_timestamp()))).scalar_one()
        plan = retry_plan(task, failure, now=now, retry_after=retry_after)
        apply_plan(task, plan, now=now)
        await session.flush()
        return plan
