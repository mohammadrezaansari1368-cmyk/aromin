"""Approval decisions and task cancellation (blueprint §14 approvals).

Rules enforced here, server-side:
- only principals with ``approval:decide`` reach ``decide`` (checked by the API);
- the principal that started the turn cannot approve its own request;
- only a ``pending``, unexpired approval whose task is waiting on it can be decided;
- the model has no path to this service: no tool exists for it and tool arguments cannot
  carry approval fields.
Every state change is audited in the same transaction.
"""

from __future__ import annotations

from app.core.errors import (
    ApprovalExpired,
    ApprovalNotPending,
    NotFound,
    SelfApprovalForbidden,
    TaskFinished,
)
from app.db.uow import UnitOfWork, UowFactory
from app.events.recorder import EventRecorder
from app.events.types import EventType
from app.models.base import utcnow
from app.models.task import TERMINAL_STATUSES, Task
from app.models.tooling import Approval
from app.security.auth import Principal
from app.services.audit import AuditLogger
from app.tasks.engine import TaskEngine, _aware


class ApprovalService:
    def __init__(self, uow_factory: UowFactory, tasks: TaskEngine, audit: AuditLogger, events: EventRecorder) -> None:
        self._uow_factory = uow_factory
        self._tasks = tasks
        self._audit = audit
        self._events = events

    async def get(self, approval_id: str) -> Approval:
        async with self._uow_factory() as uow:
            approval = await uow.approvals.get_for_update(approval_id)
            if approval is None:
                raise NotFound("Approval not found")
            await self._expire_if_due(uow, approval)
            return approval

    async def decide(self, approval_id: str, principal: Principal, *, approve: bool, note: str | None) -> Approval:
        decision = "approved" if approve else "rejected"
        async with self._uow_factory() as uow:
            approval = await uow.approvals.get_for_update(approval_id)
            if approval is None:
                raise NotFound("Approval not found")
            if principal.id == approval.requested_by:
                self._audit.record(
                    uow, actor_type=principal.type, actor_id=principal.id, action="approval.self_decision_denied",
                    target=approval.id,
                )  # fmt: skip
                self_decision = True
            else:
                self_decision = False
        if self_decision:  # raised after commit so the denied attempt stays in the audit log
            raise SelfApprovalForbidden()
        async with self._uow_factory() as uow:
            approval = await uow.approvals.get_for_update(approval_id)
            task = await uow.tasks.get_for_update(approval.task_id)
            waiting_on_it = task is not None and task.status == "waiting" and task.wait_ref == f"approval:{approval.id}"
            if approval.status == decision and waiting_on_it:
                return approval  # repeated identical decision: allow the caller to resume the task
            if approval.status != "pending":
                raise ApprovalNotPending()
            if await self._expire_if_due(uow, approval):
                expired = True
            else:
                expired = False
                if not waiting_on_it or task.cancel_requested:
                    raise TaskFinished("The task is no longer waiting for this approval")
                approval.status, approval.decided_by, approval.decided_at = decision, principal.id, utcnow()
                approval.decision_note = (note or "")[:500] or None
                self._audit.record(
                    uow, actor_type=principal.type, actor_id=principal.id, action=f"approval.{decision}",
                    target=approval.id, details={"task_id": approval.task_id, "tool": approval.tool_name},
                )  # fmt: skip
                self._events.record(
                    uow, EventType.approval_resolved,
                    subject={"approval_id": approval.id, "task_id": approval.task_id},
                    data={"status": decision, "tool": approval.tool_name},
                )  # fmt: skip
        if expired:
            raise ApprovalExpired()
        return approval

    async def expire_due_for_conversation(self, uow: UnitOfWork, conversation_id: str) -> None:
        for task in await uow.tasks.waiting_for_conversation(conversation_id):
            for approval in await uow.approvals.pending_for_task(task.id):
                await self._expire_if_due(uow, approval, task)

    async def cancel_task(self, task_id: str, principal: Principal, reason: str = "cancelled by request") -> Task:
        async with self._uow_factory() as uow:
            task = await uow.tasks.get_for_update(task_id)
            if task is None:
                raise NotFound("Task not found")
            if task.status in TERMINAL_STATUSES:
                raise TaskFinished()
            if task.status == "running":
                task.cancel_requested = True  # observed by the runtime at the next step boundary
                action = "task.cancel_requested"
            else:
                self._tasks.cancel(task, reason)
                await self._close_open_steps(uow, task, approval_status="cancelled", principal=principal)
                action = "task.cancelled"
            self._audit.record(uow, actor_type=principal.type, actor_id=principal.id, action=action, target=task.id)
            return task

    async def _expire_if_due(self, uow: UnitOfWork, approval: Approval, task: Task | None = None) -> bool:
        if approval.status != "pending" or _aware(approval.expires_at) > utcnow():
            return False
        approval.status = "expired"
        self._audit.record(uow, actor_type="system", actor_id=None, action="approval.expired", target=approval.id)
        task = task or await uow.tasks.get_for_update(approval.task_id)
        if task is not None and task.status == "waiting" and task.wait_ref == f"approval:{approval.id}":
            self._tasks.transition(task, "failed")
            task.wait_kind = None
            task.last_error = {"code": "approval_expired", "error_class": "permanent", "message": "approval expired"}
            await self._close_open_steps(uow, task, approval_status=None, principal=None)
        return True

    async def _close_open_steps(
        self, uow: UnitOfWork, task: Task, *, approval_status: str | None, principal: Principal | None
    ) -> None:
        now = utcnow()
        for step in await uow.steps.waiting_for_task(task.id):
            step.status, step.finished_at = "cancelled", now
            if step.execution_id:
                execution = await uow.executions.get(step.execution_id)
                if execution is not None and execution.output_status in ("pending", "waiting_approval", "running"):
                    execution.output_status, execution.completed_at = "cancelled", now
                    self._audit.record(
                        uow, actor_type="agent", actor_id=execution.actor_id, action="tool.cancelled",
                        target=execution.id, details={"tool": execution.tool_name, "task_id": task.id},
                    )  # fmt: skip
        if approval_status:
            for approval in await uow.approvals.pending_for_task(task.id):
                approval.status, approval.decided_at = approval_status, now
                approval.decided_by = principal.id if principal else None
                self._audit.record(
                    uow, actor_type=principal.type if principal else "system",
                    actor_id=principal.id if principal else None, action=f"approval.{approval_status}",
                    target=approval.id,
                )  # fmt: skip
