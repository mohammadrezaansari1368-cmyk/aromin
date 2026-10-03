"""Fenced write-ahead journal primitives; callers own short transactions.

Not a ToolExecutor replacement: plan/complete never dispatch tools. A caller must
commit model completion and its entire proposed batch before executing any tool.
Only protected, permitted payloads may reach this layer; audit previews are separate.
"""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ids import new_id
from app.models.task import Task
from app.models.tooling import LLMUsage, TaskStep
from app.tasks.claim import Lease, LeaseStore
from app.tasks.replay import ReplayUnavailable, exact_json, journal_key, replay_input


class BoundaryStopped(Exception):
    """Cancellation/deadline prevents starting new work."""


@dataclass(frozen=True)
class ToolPlan:
    name: str
    call_id: str
    replay_input: dict[str, Any]
    audit_input: dict[str, Any]


class JournalStore:
    def __init__(self, leases: LeaseStore | None = None):
        self.leases = leases or LeaseStore()

    async def owned_task(self, session: AsyncSession, lease: Lease, *, starting: bool = False) -> Task:
        cancelled = await self.leases.lock_owned(session, lease)
        task = await session.get(Task, lease.task_id, populate_existing=True)
        if starting:
            now = (await session.execute(select(func.current_timestamp()))).scalar_one()
            if cancelled or (task.deadline_at is not None and task.deadline_at <= now):
                raise BoundaryStopped(lease.task_id)
        return task

    async def plan(
        self,
        session: AsyncSession,
        lease: Lease,
        *,
        type: str,
        name: str,
        payload: dict[str, Any],
        audit_input: dict[str, Any] | None = None,
        parent_step_no: int | None = None,
        call_id: str | None = None,
    ) -> TaskStep:
        task = await self.owned_task(session, lease, starting=True)
        if type not in ("model_call", "tool_call") or not name or len(name) > 128:
            raise ValueError("unsupported journal step")
        permitted = exact_json(payload)
        last = (
            await session.execute(
                select(func.max(TaskStep.step_no)).where(
                    TaskStep.task_id == task.id, TaskStep.generation == task.generation
                )
            )
        ).scalar_one()
        number = (last or 0) + 1
        step = TaskStep(
            id=new_id("step"),
            task_id=task.id,
            generation=task.generation,
            step_no=number,
            type=type,
            name=name,
            status="pending",
            idempotency_key=journal_key(task.id, task.generation, number),
            replay_input=permitted,
            input=exact_json(audit_input or {}),
            parent_step_no=parent_step_no,
            tool_call_id=call_id,
            lease_token=lease.token,
        )
        session.add(step)
        await session.flush()
        return step

    async def _step(self, session: AsyncSession, task: Task, number: int) -> TaskStep:
        step = (
            await session.execute(
                select(TaskStep)
                .where(TaskStep.task_id == task.id, TaskStep.generation == task.generation, TaskStep.step_no == number)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if step is None:
            raise ReplayUnavailable("step missing from current generation")
        return step

    async def start(self, session: AsyncSession, lease: Lease, number: int) -> TaskStep:
        task = await self.owned_task(session, lease, starting=True)
        step = await self._step(session, task, number)
        if step.status not in ("pending", "running"):
            raise ValueError("step is not runnable")
        replay_input(step)  # legacy previews cannot be executed accidentally
        step.status = "running"
        step.lease_token = lease.token
        step.started_at = func.current_timestamp()
        await session.flush()
        return step

    async def complete(
        self, session: AsyncSession, lease: Lease, number: int, *, output: dict[str, Any], state_after: dict[str, Any]
    ) -> TaskStep:
        # An already in-flight bounded effect may finish after cancellation.
        task = await self.owned_task(session, lease)
        step = await self._step(session, task, number)
        if step.status != "running" or step.lease_token != lease.token:
            raise ValueError("step was not started by this owner")
        step.output = exact_json(output)
        step.state_after = exact_json(state_after, max_bytes=8192)
        step.status = "succeeded"
        step.finished_at = func.current_timestamp()
        task.state = step.state_after
        task.step_count = max(task.step_count, number)
        task.consecutive_failures = 0
        task.expiries_since_progress = 0
        await session.flush()
        return step

    async def complete_model(
        self,
        session: AsyncSession,
        lease: Lease,
        number: int,
        *,
        response: dict[str, Any],
        state_after: dict[str, Any],
        tools: tuple[ToolPlan, ...] = (),
        usage: LLMUsage | None = None,
    ) -> tuple[TaskStep, ...]:
        # Don't persist provider chain-of-thought/raw provider metadata.
        if set(response) - {"text", "tool_calls", "finish_reason"}:
            raise ValueError("unsupported model response fields")
        task = await self.owned_task(session, lease, starting=bool(tools))
        model = await self._step(session, task, number)
        if model.type != "model_call":
            raise ValueError("expected a model step")
        proposed = [
            {"id": tool.call_id, "name": tool.name, "arguments": exact_json(tool.replay_input)} for tool in tools
        ]
        if "tool_calls" in response and response["tool_calls"] != proposed:
            raise ValueError("model proposal and journal batch disagree")
        if len({tool.call_id for tool in tools}) != len(tools):
            raise ValueError("duplicate tool call IDs")
        durable_response = {**response, "tool_calls": proposed}
        await self.complete(session, lease, number, output=durable_response, state_after=state_after)
        planned = []
        for tool in tools:
            planned.append(
                await self.plan(
                    session,
                    lease,
                    type="tool_call",
                    name=tool.name,
                    payload=tool.replay_input,
                    audit_input=tool.audit_input,
                    parent_step_no=number,
                    call_id=tool.call_id,
                )
            )
        if usage is not None:
            if usage.task_id != task.id or usage.step_no != number:
                raise ValueError("usage binding mismatch")
            usage.generation = task.generation
            session.add(usage)
        await session.flush()
        return tuple(planned)
