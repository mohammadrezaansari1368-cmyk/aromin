"""Lease safety tests; PostgreSQL tests must not be counted as SQLite proof."""

import asyncio
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.core.ids import new_id
from app.models.base import utcnow
from app.models.task import Task
from app.tasks.claim import Lease, LeaseLost, LeaseStore


async def queued(container, *, key=None):
    task_id = new_id("task")
    async with container.uow_factory() as uow:
        uow.tasks.add(
            Task(
                id=task_id,
                kind="test.noop",
                kind_version=1,
                lane=0,
                mode="background",
                status="queued",
                run_at=utcnow() - timedelta(seconds=1),
                concurrency_key=key,
                input={},
                state={},
            )
        )
    return task_id


def require_pg(container):
    if container.engine.dialect.name != "postgresql":
        pytest.skip("real PostgreSQL required for lease locking")


async def claim(container, owner):
    async with container.uow_factory() as uow:
        return await LeaseStore().claim(uow.session, owner=owner, lane=0, kinds=("test.noop@1",))


async def test_sqlite_cannot_masquerade_as_worker_queue(container):
    if container.engine.dialect.name != "sqlite":
        pytest.skip("SQLite-specific guard")
    async with container.uow_factory() as uow:
        with pytest.raises(RuntimeError, match="require PostgreSQL"):
            await LeaseStore().claim(uow.session, owner="worker:a", lane=0, kinds=("test.noop@1",))


async def test_concurrent_claim_has_one_owner(container):
    require_pg(container)
    task_id = await queued(container)
    leases = await asyncio.gather(claim(container, "worker:a"), claim(container, "worker:b"))
    winners = [lease for lease in leases if lease]
    assert len(winners) == 1
    assert winners[0].task_id == task_id
    async with container.uow_factory() as uow:
        task = await uow.tasks.get(task_id)
        assert task.attempt == 1
        assert task.lease_token == 1


async def test_expired_owner_cannot_heartbeat_or_write(container):
    require_pg(container)
    await queued(container)
    lease = await claim(container, "worker:a")
    async with container.uow_factory() as uow:
        await uow.session.execute(
            text("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=:id"), {"id": lease.task_id}
        )
    for operation in (LeaseStore().heartbeat, LeaseStore().lock_owned, LeaseStore().release):
        async with container.uow_factory() as uow:
            with pytest.raises(LeaseLost):
                await operation(uow.session, lease)


async def test_reclaimed_token_rejects_old_owner_and_honors_cancel(container):
    require_pg(container)
    await queued(container)
    old = await claim(container, "worker:a")
    async with container.uow_factory() as uow:
        await LeaseStore().release(uow.session, old)
    new = await claim(container, "worker:b")
    assert new.token == old.token + 1
    async with container.uow_factory() as uow:
        with pytest.raises(LeaseLost):
            await LeaseStore().lock_owned(uow.session, old)
    async with container.uow_factory() as uow:
        with pytest.raises(LeaseLost):
            await LeaseStore().heartbeat(uow.session, Lease(new.task_id, "wrong-owner", new.token))
    async with container.uow_factory() as uow:
        task = await uow.tasks.get_for_update(new.task_id)
        task.cancel_requested = True
    async with container.uow_factory() as uow:
        assert await LeaseStore().release(uow.session, new)
    assert await claim(container, "worker:c") is None
    async with container.uow_factory() as uow:
        task = await uow.tasks.get(new.task_id)
        assert task.status == "cancelled"
        assert task.lease_owner is None
