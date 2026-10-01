from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task


class TaskRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, task: Task) -> None:
        self._s.add(task)

    async def flush(self) -> None:
        await self._s.flush()

    async def get(self, task_id: str) -> Task | None:
        return await self._s.get(Task, task_id)

    async def get_for_update(self, task_id: str) -> Task | None:
        stmt = select(Task).where(Task.id == task_id).with_for_update()
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def running_with_key(self, concurrency_key: str) -> Task | None:
        stmt = select(Task).where(Task.concurrency_key == concurrency_key, Task.status == "running").with_for_update()
        return (await self._s.execute(stmt)).scalar_one_or_none()
