import pytest
from sqlalchemy import select

from app.core.errors import Forbidden, TaskFinished
from app.core.ids import new_id
from app.models import AuditLog, OutboxEvent
from app.models.base import utcnow
from app.models.task import Task
from app.models.tooling import SideEffectRecord, TaskStep
from app.tasks.operators import OperatorStore
from app.tasks.replay import ReplayUnavailable, journal_key
from tests.conftest import create_key


async def prepare(container):
    raw = await create_key(container, ["admin"])
    principal = await container.authenticator.authenticate(f"Bearer {raw}")
    task_id = new_id("task")
    async with container.uow_factory() as uow:
        uow.tasks.add(
            Task(
                id=task_id,
                kind="agent.run",
                lane=0,
                mode="background",
                status="dead",
                initial_state={"start": True},
                state={"old": True},
                consecutive_failures=5,
                last_error={"code": "old_failure"},
            )
        )
        await uow.tasks.flush()
        for number in (1, 2, 3):
            uow.steps.add(
                TaskStep(
                    id=new_id("step"),
                    task_id=task_id,
                    generation=0,
                    step_no=number,
                    type="model_call" if number != 2 else "tool_call",
                    name="test.echo",
                    status="succeeded" if number < 3 else "failed",
                    parent_step_no=1 if number == 2 else None,
                    idempotency_key=journal_key(task_id, 0, number),
                    replay_input={},
                    state_after={"through": number} if number < 3 else None,
                    output={"step": number},
                )
            )
    return task_id, principal


async def test_rewind_copies_prefix_keeps_keys_and_failure_history(container):
    task_id, principal = await prepare(container)
    async with container.uow_factory() as uow:
        task = await OperatorStore().retry(uow, task_id, principal, rewind_to_step=3)
        assert task.generation == 1 and task.state == {"through": 2}
    async with container.uow_factory() as uow:
        old, new = await uow.steps.for_task(task_id, generation=0), await uow.steps.for_task(task_id)
        assert [s.step_no for s in new] == [1, 2]
        assert [s.idempotency_key for s in new] == [s.idempotency_key for s in old[:2]]
        assert [s.id for s in new] != [s.id for s in old[:2]]
        assert journal_key(task_id, 1, 3) != old[2].idempotency_key
        task = await uow.tasks.get(task_id)
        assert task.status == "queued" and task.last_error == {"code": "old_failure"}
        assert task.consecutive_failures == task.total_failures == task.expiries_since_progress == 0
        assert (await uow.session.execute(select(AuditLog).where(AuditLog.action == "task.retry"))).scalar_one()
        assert (await uow.session.execute(select(OutboxEvent).where(OutboxEvent.type == "task.created"))).scalar_one()


async def test_rewind_refuses_batch_middle_and_unrecoverable_prefix(container):
    task_id, principal = await prepare(container)
    with pytest.raises(ValueError, match="batch boundary"):
        async with container.uow_factory() as uow:
            await OperatorStore().retry(uow, task_id, principal, rewind_to_step=2)
    async with container.uow_factory() as uow:
        for step in await uow.steps.for_task(task_id):
            step.state_after = None
    with pytest.raises(ReplayUnavailable):
        async with container.uow_factory() as uow:
            await OperatorStore().retry(uow, task_id, principal, rewind_to_step=3)
    async with container.uow_factory() as uow:
        assert (await uow.tasks.get(task_id)).status == "dead"
        assert len(await uow.steps.for_task(task_id)) == 3


async def test_live_authority_and_unknown_effect_are_required(container):
    task_id, principal = await prepare(container)
    async with container.uow_factory() as uow:
        uow.side_effects.add(
            SideEffectRecord(
                idempotency_key="uncertain", task_id=task_id, kind="fake.send", request_hash="hash", status="unknown"
            )
        )
    with pytest.raises(TaskFinished, match="uncertain"):
        async with container.uow_factory() as uow:
            await OperatorStore().retry(uow, task_id, principal)
    async with container.uow_factory() as uow:
        (await uow.api_keys.get(principal.id)).revoked_at = utcnow()
    with pytest.raises(Forbidden):
        async with container.uow_factory() as uow:
            await OperatorStore().retry(uow, task_id, principal)


@pytest.mark.parametrize(
    "kind,ref,expected",
    [("human", "side_effect:receipt", None), ("time", None, None), ("approval", "approval:apr_fixture", "apr_fixture")],
)
async def test_only_approval_wait_renders_pending_approval_id(container, client, service_headers, kind, ref, expected):
    task_id = new_id("task")
    async with container.uow_factory() as uow:
        uow.tasks.add(
            Task(
                id=task_id, kind="agent.run", lane=1, mode="background", status="waiting", wait_kind=kind, wait_ref=ref
            )
        )
    response = await client.get(f"/v1/tasks/{task_id}", headers=service_headers)
    assert response.status_code == 200
    assert response.json()["pending_approval_id"] == expected
