"""Internal operator retry/rewind transaction, not yet exposed as an HTTP route.

Only a live admin API-key principal can use the current authentication adapter.
No action executes a tool or resolves an uncertain external effect implicitly.
"""

from sqlalchemy import func, select

from app.core.errors import Forbidden, NotFound, TaskFinished
from app.core.ids import new_id
from app.db.uow import UnitOfWork
from app.events.recorder import EventRecorder
from app.events.types import EventType
from app.models.tooling import Approval, SideEffectRecord, TaskStep
from app.security.auth import Principal
from app.security.permissions import permissions_for
from app.services.audit import AuditLogger
from app.tasks.engine import _aware
from app.tasks.replay import ReplayUnavailable, exact_json

FINAL_STEPS = frozenset({"succeeded", "failed", "cancelled", "skipped"})


class OperatorStore:
    async def retry(self, uow: UnitOfWork, task_id: str, principal: Principal, *, rewind_to_step: int | None = None):
        # Re-resolve the live principal, rather than trusting a stale caller snapshot.
        key = await uow.api_keys.get(principal.id) if principal.type == "api_key" else None
        if key is None or key.revoked_at is not None or "admin" not in permissions_for(key.roles or ()):
            raise Forbidden("Live admin authority is required for task retry")
        task = await uow.tasks.get_for_update(task_id)
        if task is None:
            raise NotFound("Task not found")
        if task.status not in ("failed", "dead"):
            raise TaskFinished("Only failed or dead tasks can be retried")
        now = _aware((await uow.session.execute(select(func.current_timestamp()))).scalar_one())
        if task.deadline_at is not None and _aware(task.deadline_at) <= now:
            raise TaskFinished("Absolute deadline elapsed; retry cannot extend it")
        uncertain = (
            await uow.session.execute(
                select(SideEffectRecord.idempotency_key)
                .where(SideEffectRecord.task_id == task.id, SideEffectRecord.status.in_(("pending", "unknown")))
                .limit(1)
            )
        ).scalar_one_or_none()
        if uncertain is not None:
            raise TaskFinished("Resolve uncertain external effects before task retry")
        old_generation = task.generation
        steps = await uow.steps.for_task(task.id)
        if rewind_to_step is not None:
            target = next((step for step in steps if step.step_no == rewind_to_step), None)
            if target is None or target.parent_step_no is not None:
                raise ValueError("rewind target must be an existing batch boundary")
            prefix = [step for step in steps if step.step_no < rewind_to_step]
            if [s.step_no for s in prefix] != list(range(1, rewind_to_step)):
                raise ReplayUnavailable("journal prefix is not dense")
            if any(s.status not in FINAL_STEPS or not s.idempotency_key for s in prefix):
                raise ReplayUnavailable("rewind prefix must be final and retain persisted keys")
            checkpoints = [step.state_after for step in prefix if step.state_after is not None]
            if prefix and not checkpoints:
                raise ReplayUnavailable("legacy prefix has no trustworthy checkpoint")
            checkpoint = checkpoints[-1] if checkpoints else task.initial_state
            restored = exact_json(checkpoint, max_bytes=8192)
            for step in prefix:
                values = {column.name: getattr(step, column.name) for column in TaskStep.__table__.columns}
                values.update(id=new_id("step"), generation=old_generation + 1)
                uow.steps.add(TaskStep(**values))
            task.generation += 1
            task.state = restored
            task.step_count = rewind_to_step - 1
        elif any(
            step.status in ("pending", "running", "waiting_approval")
            and (step.replay_input is None or not step.idempotency_key)
            for step in steps
        ):
            raise ReplayUnavailable("legacy unfinished step needs operator recovery")
        # Historical approval decisions cannot authorize a new-generation suffix.
        approvals = (
            await uow.session.execute(
                select(Approval).where(Approval.task_id == task.id, Approval.status == "pending").with_for_update()
            )
        ).scalars()
        for approval in approvals:
            approval.status = "cancelled"
            approval.decided_by = principal.id
            approval.decided_at = now
        task.status = "queued"
        task.mode = "background"
        task.run_at = now
        task.finished_at = task.lease_owner = task.lease_until = task.heartbeat_at = None
        task.wait_kind = task.wait_ref = None
        task.cancel_requested = False
        task.consecutive_failures = task.total_failures = task.expiries_since_progress = 0
        task.updated_at = now
        # Keep last_error as historical evidence; do not destroy the failure diagnosis.
        AuditLogger().record(
            uow,
            actor_type=principal.type,
            actor_id=principal.id,
            action="task.retry",
            target=task.id,
            details={"old_generation": old_generation, "generation": task.generation, "rewind_to_step": rewind_to_step},
        )
        if task.emit_events:
            EventRecorder().record(
                uow,
                EventType.task_created,
                subject={"task_id": task.id},
                data={"reason": "operator_retry", "generation": task.generation},
            )
        await uow.session.flush()
        if uow.session.get_bind().dialect.name == "postgresql":
            await uow.session.execute(select(func.pg_notify("task_ready", str(task.lane))))
        return task
