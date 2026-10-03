"""PostgreSQL recovery tests for expired leased tasks."""

import pytest
from sqlalchemy import text

from app.tasks.claim import LeaseLost, LeaseStore
from app.tasks.reaper import TaskReaper
from tests.test_task_leases import claim, queued, require_pg


async def expire(container, task_id: str) -> None:
    async with container.uow_factory() as uow:
        await uow.session.execute(
            text("UPDATE tasks SET lease_until=now()-interval '1 second' WHERE id=:id"),
            {"id": task_id},
        )


async def test_reaper_requeues_expired_owner_and_fences_old_token(container):
    require_pg(container)
    task_id = await queued(container)
    old = await claim(container, "worker:old")
    await expire(container, task_id)

    async with container.uow_factory() as uow:
        result = await TaskReaper().reap_batch(uow.session)
    assert result.requeued == (task_id,)

    async with container.uow_factory() as uow:
        task = await uow.tasks.get(task_id)
        assert task.status == "queued"
        assert task.lease_owner is None
        assert task.consecutive_failures == 1
        assert task.total_failures == 1

    async with container.uow_factory() as uow:
        with pytest.raises(LeaseLost):
            await LeaseStore().lock_owned(uow.session, old)

    new = await claim(container, "worker:new")
    assert new is not None
    assert new.task_id == task_id
    assert new.token == old.token + 1


async def test_reaper_honors_cancel_before_retry(container):
    require_pg(container)
    task_id = await queued(container)
    lease = await claim(container, "worker:a")
    async with container.uow_factory() as uow:
        task = await uow.tasks.get_for_update(task_id)
        task.cancel_requested = True
    await expire(container, task_id)

    async with container.uow_factory() as uow:
        result = await TaskReaper().reap_batch(uow.session)
    assert result.cancelled == (task_id,)
    assert await claim(container, "worker:b") is None

    async with container.uow_factory() as uow:
        with pytest.raises(LeaseLost):
            await LeaseStore().heartbeat(uow.session, lease)


async def test_reaper_moves_crash_loop_to_dead(container):
    require_pg(container)
    task_id = await queued(container)
    await claim(container, "worker:a")
    async with container.uow_factory() as uow:
        task = await uow.tasks.get_for_update(task_id)
        task.consecutive_failures = 2
    await expire(container, task_id)

    async with container.uow_factory() as uow:
        result = await TaskReaper(max_consecutive_failures=3).reap_batch(uow.session)
    assert result.dead == (task_id,)

    async with container.uow_factory() as uow:
        task = await uow.tasks.get(task_id)
        assert task.status == "dead"
        assert task.finished_at is not None


async def test_reaper_does_not_touch_live_lease(container):
    require_pg(container)
    task_id = await queued(container)
    lease = await claim(container, "worker:live")

    async with container.uow_factory() as uow:
        result = await TaskReaper().reap_batch(uow.session)
    assert task_id not in result.requeued + result.cancelled + result.dead

    async with container.uow_factory() as uow:
        assert await LeaseStore().heartbeat(uow.session, lease) is False
