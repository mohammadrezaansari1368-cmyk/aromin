import hashlib
import json

import pytest
from pydantic import BaseModel

from app.core.ids import new_id
from app.models.task import Task
from app.models.tooling import TaskStep
from app.tasks.replay import ReplayUnavailable, exact_json, journal_key, replay_input, tool_replay_input
from app.tools.spec import ToolSpec, sensitive


class LongInput(BaseModel):
    text: str
    items: list[int]


class SecretInput(BaseModel):
    secret: str = sensitive()


async def unused(ctx, args):
    raise AssertionError("replay persistence must never execute a handler")


def spec(model):
    return ToolSpec(
        name="test.replay", description="fixture", input_model=model, output_model=LongInput, handler=unused
    )


def test_key_uses_canonical_position_and_generation():
    assert (
        journal_key("task_الف", 0, 1)
        == hashlib.sha256(
            json.dumps(["task_الف", 0, 1], ensure_ascii=False, separators=(",", ":")).encode()
        ).hexdigest()[:32]
    )
    assert journal_key("a|1", 0, 1) != journal_key("a", 1, 1)
    assert journal_key("a", 0, 1) != journal_key("a", 1, 1)
    with pytest.raises(ValueError):
        journal_key("a", 0, 0)


def test_long_inputs_roundtrip_without_preview_truncation():
    args = {"text": "متن" * 1000, "items": list(range(100))}
    result = tool_replay_input(spec(LongInput), args)
    assert result == args
    args["items"].clear()
    assert len(result["items"]) == 100


def test_sensitive_legacy_and_unsupported_payloads_fail_closed():
    with pytest.raises(ReplayUnavailable):
        tool_replay_input(spec(SecretInput), {"secret": "never persist"})
    step = TaskStep(input={"text": "redacted preview"}, idempotency_key="legacy")
    with pytest.raises(ReplayUnavailable):
        replay_input(step)
    for payload in ({"x": float("nan")}, {"x": object()}, {"x": "x" * 70000}):
        with pytest.raises(ReplayUnavailable):
            exact_json(payload)


async def test_reads_are_scoped_to_current_generation(container):
    task_id = new_id("task")
    async with container.uow_factory() as uow:
        uow.tasks.add(Task(id=task_id, kind="agent.run", lane=0, mode="background", status="queued", generation=1))
        await uow.tasks.flush()
        for generation in (0, 1):
            uow.steps.add(
                TaskStep(
                    id=new_id("step"),
                    task_id=task_id,
                    generation=generation,
                    step_no=1,
                    type="tool_call",
                    name="test.echo",
                    status="pending",
                )
            )
    async with container.uow_factory() as uow:
        assert (await uow.steps.get(task_id, 1)).generation == 1
        assert (await uow.steps.get(task_id, 1, generation=0)).generation == 0
        assert [s.generation for s in await uow.steps.for_task(task_id)] == [1]
        assert [s.generation for s in await uow.steps.waiting_for_task(task_id)] == [1]


@pytest.mark.parametrize("payload", [{1: "ambiguous"}, {"x": (1, 2)}, {"x": {2: "bad"}}])
def test_non_json_shapes_rejected_without_conversion(payload):
    with pytest.raises(ReplayUnavailable):
        exact_json(payload)
