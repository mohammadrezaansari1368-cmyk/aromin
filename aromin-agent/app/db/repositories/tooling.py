from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tooling import Approval, LLMUsage, SideEffectRecord, TaskStep, ToolExecution


class StepRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, step: TaskStep) -> None:
        self._s.add(step)

    async def flush(self) -> None:
        await self._s.flush()

    async def get(self, task_id: str, step_no: int) -> TaskStep | None:
        stmt = select(TaskStep).where(TaskStep.task_id == task_id, TaskStep.step_no == step_no)
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def for_task(self, task_id: str) -> list[TaskStep]:
        stmt = select(TaskStep).where(TaskStep.task_id == task_id).order_by(TaskStep.step_no)
        return list((await self._s.execute(stmt)).scalars())

    async def waiting_for_task(self, task_id: str) -> list[TaskStep]:
        stmt = (
            select(TaskStep)
            .where(TaskStep.task_id == task_id, TaskStep.status.in_(("waiting_approval", "pending", "running")))
            .order_by(TaskStep.step_no)
        )
        return list((await self._s.execute(stmt)).scalars())


class ExecutionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, execution: ToolExecution) -> None:
        self._s.add(execution)

    async def flush(self) -> None:
        await self._s.flush()

    async def get(self, execution_id: str) -> ToolExecution | None:
        return await self._s.get(ToolExecution, execution_id)

    async def succeeded_with_key(self, idempotency_key: str) -> ToolExecution | None:
        stmt = select(ToolExecution).where(
            ToolExecution.idempotency_key == idempotency_key, ToolExecution.output_status == "succeeded"
        )
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def for_task(self, task_id: str) -> list[ToolExecution]:
        stmt = select(ToolExecution).where(ToolExecution.task_id == task_id).order_by(ToolExecution.created_at)
        return list((await self._s.execute(stmt)).scalars())


class ApprovalRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, approval: Approval) -> None:
        self._s.add(approval)

    async def flush(self) -> None:
        await self._s.flush()

    async def get(self, approval_id: str) -> Approval | None:
        return await self._s.get(Approval, approval_id)

    async def get_for_update(self, approval_id: str) -> Approval | None:
        stmt = select(Approval).where(Approval.id == approval_id).with_for_update()
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def for_step(self, task_id: str, step_no: int) -> Approval | None:
        stmt = (
            select(Approval)
            .where(Approval.task_id == task_id, Approval.step_no == step_no)
            .order_by(Approval.created_at.desc())
            .limit(1)
        )
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def pending_for_task(self, task_id: str) -> list[Approval]:
        stmt = select(Approval).where(Approval.task_id == task_id, Approval.status == "pending").with_for_update()
        return list((await self._s.execute(stmt)).scalars())


class SideEffectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, record: SideEffectRecord) -> None:
        self._s.add(record)

    async def flush(self) -> None:
        await self._s.flush()

    async def get_for_update(self, key: str) -> SideEffectRecord | None:
        stmt = select(SideEffectRecord).where(SideEffectRecord.idempotency_key == key).with_for_update()
        return (await self._s.execute(stmt)).scalar_one_or_none()


class UsageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, usage: LLMUsage) -> None:
        self._s.add(usage)

    async def for_task(self, task_id: str) -> list[LLMUsage]:
        stmt = select(LLMUsage).where(LLMUsage.task_id == task_id).order_by(LLMUsage.created_at)
        return list((await self._s.execute(stmt)).scalars())

    async def totals_for_task(self, task_id: str) -> tuple[int, int, float | None]:
        stmt = select(
            func.coalesce(func.sum(LLMUsage.input_tokens), 0),
            func.coalesce(func.sum(LLMUsage.output_tokens), 0),
            func.sum(LLMUsage.estimated_cost),
        ).where(LLMUsage.task_id == task_id)
        tin, tout, cost = (await self._s.execute(stmt)).one()
        return int(tin), int(tout), float(cost) if cost is not None else None
