"""Approval endpoints.

Deciding requires ``approval:decide`` (human roles only; service keys cannot decide) and the
decider must not be the principal that started the turn. After a decision the paused turn is
resumed inline in this request (the Task Engine worker takes this over in a later phase):
approved -> the tool runs; rejected -> it does not, and the model is told so.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path

from app.api.deps import ContainerDep, require
from app.api.schemas import ApprovalDecisionIn, ApprovalDecisionOut, ApprovalOut, MessageOut
from app.api.turns import collect
from app.core.ids import id_pattern
from app.models.tooling import Approval
from app.security.auth import Principal
from app.security.permissions import Permission

router = APIRouter(prefix="/v1/approvals", tags=["approvals"])
ApprovalId = Annotated[str, Path(pattern=id_pattern("apr"))]


def _out(a: Approval) -> ApprovalOut:
    return ApprovalOut(
        id=a.id, task_id=a.task_id, step_no=a.step_no, conversation_id=a.conversation_id, tool_name=a.tool_name,
        tool_version=a.tool_version, risk_level=a.risk_level, reason=a.reason, sanitized_input=a.sanitized_input,
        requested_by=a.requested_by, status=a.status, expires_at=a.expires_at, decided_by=a.decided_by,
        decided_at=a.decided_at, decision_note=a.decision_note, created_at=a.created_at,
    )  # fmt: skip


@router.get("/{approval_id}", response_model=ApprovalOut)
async def get_approval(
    approval_id: ApprovalId,
    container: ContainerDep,
    _: Annotated[Principal, Depends(require(Permission.approval_read))],
) -> ApprovalOut:
    return _out(await container.approvals.get(approval_id))


async def _decide(
    container, approval_id: str, principal: Principal, body: ApprovalDecisionIn | None, approve: bool
) -> ApprovalDecisionOut:
    approval = await container.approvals.decide(
        approval_id, principal, approve=approve, note=body.note if body else None
    )
    result = await collect(container.runtime.resume(approval.task_id))
    async with container.uow_factory() as uow:
        task = await uow.tasks.get(approval.task_id)
        fresh = await uow.approvals.get(approval.id)
    message = None
    if result.completed is not None:
        c = result.completed
        message = MessageOut(id=c.message_id, seq=c.seq, role="assistant", content=c.content, created_at=c.created_at)
    return ApprovalDecisionOut(
        approval=_out(fresh), task_id=task.id, task_status=task.status, message=message,
        next_approval_id=result.waiting.approval_id if result.waiting else None,
        error_code=result.failed.code if result.failed else None,
    )  # fmt: skip


@router.post("/{approval_id}/approve", response_model=ApprovalDecisionOut)
async def approve(
    approval_id: ApprovalId,
    container: ContainerDep,
    principal: Annotated[Principal, Depends(require(Permission.approval_decide))],
    body: ApprovalDecisionIn | None = None,
) -> ApprovalDecisionOut:
    return await _decide(container, approval_id, principal, body, approve=True)


@router.post("/{approval_id}/reject", response_model=ApprovalDecisionOut)
async def reject(
    approval_id: ApprovalId,
    container: ContainerDep,
    principal: Annotated[Principal, Depends(require(Permission.approval_decide))],
    body: ApprovalDecisionIn | None = None,
) -> ApprovalDecisionOut:
    return await _decide(container, approval_id, principal, body, approve=False)
