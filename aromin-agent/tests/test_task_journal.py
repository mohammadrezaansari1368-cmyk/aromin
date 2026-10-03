"""SQLite proves journal atomicity; it cannot prove PostgreSQL lease locking."""

import pytest

from app.core.ids import new_id
from app.models.task import Task
from app.tasks.claim import Lease, LeaseLost
from app.tasks.journal import BoundaryStopped, JournalStore, ToolPlan
from app.tasks.replay import ReplayUnavailable


class TestFence:
    __test__ = False

    def __init__(self):
        self.lost = False

    async def lock_owned(self, session, lease):
        if self.lost:
            raise LeaseLost(lease.task_id)
        task = await session.get(Task, lease.task_id)
        return task.cancel_requested


async def setup(container):
    task_id = new_id("task")
    async with container.uow_factory() as uow:
        uow.tasks.add(
            Task(
                id=task_id,
                kind="agent.run",
                lane=0,
                mode="background",
                status="queued",
                generation=2,
                consecutive_failures=3,
                expiries_since_progress=2,
            )
        )
    fence = TestFence()
    return Lease(task_id, "fixture", 7), JournalStore(fence), fence


async def test_write_ahead_and_atomic_batch_completion(container):
    lease, journal, _ = await setup(container)
    async with container.uow_factory() as uow:
        step = await journal.plan(
            uow.session, lease, type="model_call", name="mock", payload={"message_ids": ["msg_1"]}
        )
        assert step.status == "pending"
    async with container.uow_factory() as uow:
        await journal.start(uow.session, lease, 1)
    async with container.uow_factory() as uow:
        batch = await journal.complete_model(
            uow.session,
            lease,
            1,
            response={"text": "ok"},
            state_after={"v": 1},
            tools=(ToolPlan("test.echo", "call_1", {"text": "x" * 700}, {"text": "preview"}),),
        )
        assert batch[0].step_no == 2
        assert batch[0].parent_step_no == 1
    async with container.uow_factory() as uow:
        steps = await uow.steps.for_task(lease.task_id)
        assert [s.status for s in steps] == ["succeeded", "pending"]
        assert len(steps[1].replay_input["text"]) == 700
        task = await uow.tasks.get(lease.task_id)
        assert task.state == {"v": 1}
        assert task.consecutive_failures == task.expiries_since_progress == 0


async def test_batch_error_rolls_back_completion_and_checkpoint(container):
    lease, journal, _ = await setup(container)
    async with container.uow_factory() as uow:
        await journal.plan(uow.session, lease, type="model_call", name="mock", payload={})
        await journal.start(uow.session, lease, 1)
    with pytest.raises(ReplayUnavailable):
        async with container.uow_factory() as uow:
            await journal.complete_model(
                uow.session,
                lease,
                1,
                response={"text": "ok"},
                state_after={"new": 1},
                tools=(ToolPlan("test.echo", "call_1", {"bad": object()}, {}),),
            )
    async with container.uow_factory() as uow:
        assert (await uow.steps.get(lease.task_id, 1)).status == "running"
        assert len(await uow.steps.for_task(lease.task_id)) == 1
        assert (await uow.tasks.get(lease.task_id)).state == {}


async def test_lost_fence_and_cancel_block_new_plans(container):
    lease, journal, fence = await setup(container)
    fence.lost = True
    with pytest.raises(LeaseLost):
        async with container.uow_factory() as uow:
            await journal.plan(uow.session, lease, type="model_call", name="mock", payload={})
    fence.lost = False
    async with container.uow_factory() as uow:
        (await uow.tasks.get(lease.task_id)).cancel_requested = True
    with pytest.raises(BoundaryStopped):
        async with container.uow_factory() as uow:
            await journal.plan(uow.session, lease, type="model_call", name="mock", payload={})


async def test_postgres_reclaimed_owner_cannot_complete_journal(container):
    from app.tasks.claim import LeaseStore
    from app.tasks.reaper import TaskReaper
    from tests.test_task_leases import claim, queued, require_pg
    from tests.test_task_reaper import expire

    require_pg(container)
    task_id = await queued(container)
    old = await claim(container, "worker:old")
    journal = JournalStore(LeaseStore())
    async with container.uow_factory() as uow:
        await journal.plan(uow.session, old, type="model_call", name="mock", payload={})
        await journal.start(uow.session, old, 1)
    await expire(container, task_id)
    async with container.uow_factory() as uow:
        await TaskReaper().reap_batch(uow.session)
    new = await claim(container, "worker:new")
    assert new.token > old.token
    with pytest.raises(LeaseLost):
        async with container.uow_factory() as uow:
            await journal.complete(uow.session, old, 1, output={"stale": True}, state_after={"stale": True})
    async with container.uow_factory() as uow:
        assert (await uow.steps.get(task_id, 1)).status == "running"
        assert (await uow.tasks.get(task_id)).state == {}
        await journal.start(uow.session, new, 1)
        await journal.complete(uow.session, new, 1, output={"ok": True}, state_after={"new": True})
