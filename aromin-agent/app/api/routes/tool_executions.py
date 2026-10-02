from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path

from app.api.deps import ContainerDep, require
from app.api.schemas import ToolExecutionOut
from app.core.errors import NotFound
from app.core.ids import id_pattern
from app.security.auth import Principal
from app.security.permissions import Permission

router = APIRouter(prefix="/v1/tool-executions", tags=["tools"])


@router.get("/{execution_id}", response_model=ToolExecutionOut)
async def get_tool_execution(
    execution_id: Annotated[str, Path(pattern=id_pattern("exec"))],
    container: ContainerDep,
    _: Annotated[Principal, Depends(require(Permission.task_read))],
) -> ToolExecutionOut:
    async with container.uow_factory() as uow:
        e = await uow.executions.get(execution_id)
        if e is None:
            raise NotFound("Tool execution not found")
        return ToolExecutionOut(
            id=e.id, task_id=e.task_id, step_no=e.step_no, conversation_id=e.conversation_id, tool_name=e.tool_name,
            tool_version=e.tool_version, actor_type=e.actor_type, actor_id=e.actor_id, input_hash=e.input_hash,
            sanitized_input=e.sanitized_input, output_status=e.output_status, error_type=e.error_type,
            error_code=e.error_code, policy_decision=e.policy_decision, risk_level=e.risk_level,
            started_at=e.started_at, completed_at=e.completed_at, latency_ms=e.latency_ms,
            retry_count=e.retry_count, approval_id=e.approval_id, idempotency_key=e.idempotency_key,
        )  # fmt: skip
