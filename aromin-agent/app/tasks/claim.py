"""PostgreSQL ownership primitives, not yet connected to the inline runtime.

A future runner must fence every authoritative write in the same transaction
as lock_owned. A lease does not grant tool permissions or replace policy checks.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import exists, func, or_, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.task import Task


class LeaseLost(Exception):
    """The caller no longer owns a live task lease."""


@dataclass(frozen=True)
class Lease:
    task_id: str
    owner: str
    token: int


def _postgres(session: AsyncSession) -> None:
    if session.get_bind().dialect.name != "postgresql":
        raise RuntimeError("Durable worker leases require PostgreSQL; SQLite is not a locking substitute")


class LeaseStore:
    """Caller owns transactions. A returned claim is valid only after commit.

    Roll back a concurrency-key unique violation before retrying a claim.
    Waiting-task wakes are excluded until the deadline/wait protocol is ready.
    """

    def __init__(self, lease_seconds: int = 60) -> None:
        if not 1 <= lease_seconds <= 3600:
            raise ValueError("lease_seconds must be between 1 and 3600")
        self.duration = timedelta(seconds=lease_seconds)

    async def claim(
        self,
        session: AsyncSession,
        *,
        owner: str,
        lane: int,
        kinds: tuple[str, ...],
        excluded: tuple[str, ...] = (),
    ) -> Lease | None:
        _postgres(session)
        if not owner or len(owner) > 128:
            raise ValueError("owner must contain 1 to 128 characters")
        if lane not in range(4):
            raise ValueError("lane must be 0 through 3")
        if not kinds:
            return None
        supported = []
        for item in kinds:
            kind, version = item.rsplit("@", 1)
            supported.append((kind, int(version)))
        running = aliased(Task)
        occupied = exists(
            select(running.id).where(
                running.concurrency_key == Task.concurrency_key,
                running.status == "running",
            )
        )
        candidate = (
            select(Task.id)
            .where(
                Task.status == "queued",
                Task.lane == lane,
                Task.run_at <= func.statement_timestamp(),
                Task.cancel_requested.is_(False),
                or_(Task.deadline_at.is_(None), Task.deadline_at > func.statement_timestamp()),
                tuple_(Task.kind, Task.kind_version).in_(supported),
                Task.kind.not_in(excluded),
                or_(Task.concurrency_key.is_(None), ~occupied),
            )
            .order_by(Task.run_at, Task.id)
            .limit(1)
            .with_for_update(skip_locked=True)
            .cte("candidate")
        )
        statement = (
            update(Task)
            .where(Task.id == candidate.c.id)
            .values(
                status="running",
                lease_owner=owner,
                lease_token=Task.lease_token + 1,
                lease_until=func.statement_timestamp() + self.duration,
                heartbeat_at=func.statement_timestamp(),
                attempt=Task.attempt + 1,
                started_at=func.coalesce(Task.started_at, func.statement_timestamp()),
                updated_at=func.statement_timestamp(),
                wait_kind=None,
            )
            .returning(Task.id, Task.lease_token)
            .execution_options(synchronize_session=False)
        )
        row = (await session.execute(statement)).one_or_none()
        return Lease(row[0], owner, row[1]) if row else None

    @staticmethod
    def _owned(lease: Lease):
        return (
            Task.id == lease.task_id,
            Task.lease_owner == lease.owner,
            Task.lease_token == lease.token,
            Task.status == "running",
            Task.lease_until > func.statement_timestamp(),
        )

    async def lock_owned(self, session: AsyncSession, lease: Lease) -> bool:
        """Lock before writes; zero rows means stop, never revive expired leases."""
        _postgres(session)
        row = (
            await session.execute(select(Task.cancel_requested).where(*self._owned(lease)).with_for_update())
        ).one_or_none()
        if row is None:
            raise LeaseLost(lease.task_id)
        return bool(row[0])

    async def heartbeat(self, session: AsyncSession, lease: Lease) -> bool:
        _postgres(session)
        row = (
            await session.execute(
                update(Task)
                .where(*self._owned(lease))
                .values(
                    lease_until=func.statement_timestamp() + self.duration,
                    heartbeat_at=func.statement_timestamp(),
                    updated_at=func.statement_timestamp(),
                )
                .returning(Task.cancel_requested)
                .execution_options(synchronize_session=False)
            )
        ).one_or_none()
        if row is None:
            raise LeaseLost(lease.task_id)
        return bool(row[0])

    async def release(self, session: AsyncSession, lease: Lease) -> bool:
        """Release only at a safe boundary; cancellation takes precedence."""
        cancelled = await self.lock_owned(session, lease)
        result = await session.execute(
            update(Task)
            .where(*self._owned(lease))
            .values(
                status="cancelled" if cancelled else "queued",
                lease_owner=None,
                lease_until=None,
                wait_kind=None,
                mode="background",
                updated_at=func.statement_timestamp(),
                run_at=func.statement_timestamp(),
                finished_at=func.statement_timestamp() if cancelled else None,
            )
            .returning(Task.id)
            .execution_options(synchronize_session=False)
        )
        if result.scalar_one_or_none() is None:
            raise LeaseLost(lease.task_id)
        return cancelled
