from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from fastapi.responses import JSONResponse

from app.api.deps import ContainerDep, require
from app.api.schemas import CancelTaskOut, TaskErrorOut, TaskOut, TaskStepOut, TaskStepsOut, TaskUsageOut
from app.core.errors import NotFound
from app.core.ids import id_pattern
from app.security.auth import Principal
from app.security.permissions import Permission

router = APIRouter(prefix="/v1/tasks", tags=["tasks"])
TaskId = Annotated[str, Path(pattern=id_pattern("task"))]


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: TaskId,
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
        tin, tout, cost = await uow.usage.totals_for_task(task_id)
        pending = (
            task.wait_ref.split(":", 1)[1]
            if task.status == "waiting"
            and task.wait_kind == "approval"
            and task.wait_ref
            and task.wait_ref.startswith("approval:")
            else None
        )
        return TaskOut(
            id=task.id, kind=task.kind, status=task.status, mode=task.mode, lane=task.lane,
            conversation_id=task.conversation_id, created_at=task.created_at, started_at=task.started_at,
            finished_at=task.finished_at, error=error, wait_kind=task.wait_kind, pending_approval_id=pending,
            cancel_requested=task.cancel_requested, step_count=task.step_count,
            usage=TaskUsageOut(input_tokens=tin, output_tokens=tout, total_tokens=tin + tout, estimated_cost=cost),
        )  # fmt: skip


@router.get("/{task_id}/steps", response_model=TaskStepsOut)
async def get_task_steps(
    task_id: TaskId,
    container: ContainerDep,
    _: Annotated[Principal, Depends(require(Permission.task_read))],
) -> TaskStepsOut:
    async with container.uow_factory() as uow:
        if await uow.tasks.get(task_id) is None:
            raise NotFound("Task not found")
        steps = await uow.steps.for_task(task_id)
        return TaskStepsOut(
            task_id=task_id,
            steps=[
                TaskStepOut(
                    step_no=s.step_no,
                    type=s.type,
                    name=s.name,
                    status=s.status,
                    error_type=s.error_type,
                    error_code=s.error_code,
                    execution_id=s.execution_id,
                    approval_id=s.approval_id,
                    created_at=s.created_at,
                    started_at=s.started_at,
                    finished_at=s.finished_at,
                )  # fmt: skip
                for s in steps
            ],
        )


@router.post("/{task_id}/cancel", response_model=CancelTaskOut, responses={202: {"model": CancelTaskOut}})
async def cancel_task(
    task_id: TaskId,
    container: ContainerDep,
    principal: Annotated[Principal, Depends(require(Permission.task_cancel))],
):
    task = await container.approvals.cancel_task(task_id, principal)
    out = CancelTaskOut(task_id=task.id, status=task.status, cancel_requested=task.cancel_requested)
    return JSONResponse(out.model_dump(), status_code=202 if task.status == "running" else 200)
