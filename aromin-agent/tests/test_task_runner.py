"""Runner contract tests use a declared test fence, not real ownership evidence."""

import asyncio

import pytest
from pydantic import BaseModel

from app.core.ids import new_id
from app.models.task import Task
from app.tasks.claim import Lease, LeaseLost
from app.tasks.runner import PureKind, PurePlan, PureResult, TaskRunner
from tests.test_task_journal import TestFence


class Input(BaseModel):
    value: int


class RunnerFence(TestFence):
    async def heartbeat(self, session, lease):
        return await self.lock_owned(session, lease)

    async def release(self, session, lease):
        task = await session.get(Task, lease.task_id)
        task.status = "cancelled" if task.cancel_requested else "queued"
        return task.cancel_requested


async def prepare(container, **kwargs):
    task_id = new_id("task")
    async with container.uow_factory() as uow:
        uow.tasks.add(
            Task(
                id=task_id,
                kind="test.compute",
                kind_version=1,
                lane=2,
                status="queued",
                mode="background",
                input={"value": 4},
                **kwargs,
            )
        )
    fence = RunnerFence()
    runner = TaskRunner(
        container.uow_factory, heartbeat_uow_factory=container.uow_factory, leases=fence, heartbeat_seconds=0.01
    )
    return Lease(task_id, "fixture", 1), runner, fence


def kind(compute):
    def next_step(state, payload):
        if state.get("done"):
            return None
        return PurePlan("internal.double", payload, compute)

    return PureKind("test.compute", 1, Input, next_step)


async def test_completed_work_is_not_regenerated_on_recovery(container):
    lease, runner, _ = await prepare(container)
    calls = []

    async def compute(args):
        calls.append(args)
        return PureResult({"value": args["value"] * 2}, {"done": True, "value": args["value"] * 2})

    assert await runner.run(lease, kind(compute)) == "succeeded"
    assert calls == [{"value": 4}]
    # Simulate crash AFTER checkpoint commit but BEFORE task completion: only final transition repeats.
    async with container.uow_factory() as uow:
        task = await uow.tasks.get(lease.task_id)
        task.status = "queued"
    assert await runner.run(lease, kind(compute)) == "succeeded"
    assert len(calls) == 1
    async with container.uow_factory() as uow:
        assert len(await uow.steps.for_task(lease.task_id)) == 1
        assert (await uow.tasks.get(lease.task_id)).result == {"state": {"done": True, "value": 8}}


async def test_heartbeat_loss_cancels_compute_without_checkpoint_write(container):
    lease, runner, fence = await prepare(container)
    started, cancelled = asyncio.Event(), asyncio.Event()

    async def compute(args):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    work = asyncio.create_task(runner.run(lease, kind(compute)))
    await asyncio.wait_for(started.wait(), 1)
    fence.lost = True
    with pytest.raises(LeaseLost):
        await asyncio.wait_for(work, 1)
    assert cancelled.is_set()
    async with container.uow_factory() as uow:
        assert (await uow.tasks.get(lease.task_id)).state == {}
        assert (await uow.steps.get(lease.task_id, 1)).status == "running"


async def test_shutdown_releases_at_boundary_without_failure(container):
    lease, runner, _ = await prepare(container)
    stop = asyncio.Event()
    stop.set()

    async def compute(args):
        raise AssertionError("shutdown must prevent new compute")

    assert await runner.run(lease, kind(compute), stop=stop) == "queued"
    async with container.uow_factory() as uow:
        task = await uow.tasks.get(lease.task_id)
        assert task.total_failures == 0
        assert await uow.steps.for_task(lease.task_id) == []


def test_agent_and_business_kinds_cannot_use_pure_runner():
    for name in ("agent.run", "sms.send", "crm.write"):
        with pytest.raises(ValueError):
            PureKind(name, 1, Input, lambda state, payload: None)


async def test_recovery_executes_persisted_input_not_changed_producer_input(container):
    lease, runner, _ = await prepare(container)
    async with container.uow_factory() as uow:
        await runner.journal.plan(uow.session, lease, type="tool_call", name="internal.double", payload={"value": 9})
        await runner.journal.start(uow.session, lease, 1)
    seen = []

    async def compute(args):
        seen.append(args["value"])
        return PureResult({"value": args["value"]}, {"done": True})

    assert await runner.run(lease, kind(compute)) == "succeeded"
    assert seen == [9]  # producer currently proposes 4; durable input remains 9


async def test_real_postgres_runner_completion(container):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.db.uow import make_uow_factory
    from app.tasks.claim import LeaseStore
    from tests.test_task_leases import require_pg

    require_pg(container)
    task_id = new_id("task")
    async with container.uow_factory() as uow:
        uow.tasks.add(
            Task(
                id=task_id,
                kind="test.compute",
                kind_version=1,
                lane=2,
                status="queued",
                mode="background",
                input={"value": 4},
            )
        )
    async with container.uow_factory() as uow:
        lease = await LeaseStore().claim(uow.session, owner="worker:runner-test", lane=2, kinds=("test.compute@1",))
    heartbeat_engine = create_async_engine(container.settings.database_url.get_secret_value(), pool_size=2)
    try:
        heartbeat_uows = make_uow_factory(async_sessionmaker(heartbeat_engine, expire_on_commit=False))
        runner = TaskRunner(container.uow_factory, heartbeat_uow_factory=heartbeat_uows)

        async def compute(args):
            return PureResult({"value": 8}, {"done": True})

        assert await runner.run(lease, kind(compute)) == "succeeded"
        async with container.uow_factory() as uow:
            task = await uow.tasks.get(task_id)
            assert task.lease_owner is None and task.status == "succeeded"
            assert (await uow.steps.get(task_id, 1)).status == "succeeded"
    finally:
        await heartbeat_engine.dispose()
