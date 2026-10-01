from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path

from app.api.deps import ContainerDep, require
from app.api.schemas import TaskErrorOut, TaskOut
from app.core.errors import NotFound
from app.core.ids import id_pattern
from app.security.auth import Principal
from app.security.permissions import Permission

router = APIRouter(prefix="/v1/tasks", tags=["tasks"])


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: Annotated[str, Path(pattern=id_pattern("task"))],
    container: ContainerDep,
    _: Annotated[Principal, Depends(require(Permission.task_read))],
) -> TaskOut:
    async with container.uow_factory() as uow:
        task = await uow.tasks.get(task_id)
        if task is None:
            raise NotFound("Task not found")
        error = None
        if task.last_error:
            error = TaskErrorOut(
                code=task.last_error.get("code", "unknown"), error_class=task.last_error.get("error_class")
            )
        return TaskOut(
            id=task.id, kind=task.kind, status=task.status, mode=task.mode, lane=task.lane,
            conversation_id=task.conversation_id, created_at=task.created_at, started_at=task.started_at,
            finished_at=task.finished_at, error=error,
        )  # fmt: skip
