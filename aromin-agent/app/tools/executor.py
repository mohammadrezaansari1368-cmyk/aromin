"""ToolExecutor: the only path from a model tool request to a handler.

Order of checks (Phase 2 spec §3), each recorded on the step, the execution row and the audit log:

1. tool name is registered and offered to this profile      -> else UnknownToolRequested (turn fails closed)
2. arguments are a JSON object matching the input schema    -> validation_error
3. unknown arguments rejected, strict types (no coercion)   -> validation_error
4. RBAC: actor holds every required permission              -> authorization_error
5. policy (server-side, PolicyEngine)                       -> policy_denied | approval_required
6. approval state for this exact step (approvals table)     -> waits / denied when rejected
7. idempotency: a step that already succeeded is not re-run -> stored result returned
8. handler with timeout and the tool's retry policy (never retrying a non-idempotent effect)

Scope (actor, conversation, customer, task) comes from ``ExecutionScope``, built by the runtime
from the authenticated principal and server-side rows. Model arguments can never set it.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from pydantic import BaseModel, ValidationError

from app.core.errors import AgentError
from app.core.ids import new_id
from app.core.logging import REDACTED, get_logger, redact_mapping
from app.db.uow import UnitOfWork, UowFactory
from app.events.recorder import EventRecorder
from app.events.types import EventType
from app.models.base import utcnow
from app.models.tooling import Approval, TaskStep, ToolExecution
from app.policy.engine import ApprovalState, Decision, PolicyEngine, PolicyInput
from app.providers.base import ToolCall
from app.services.audit import AuditLogger
from app.tools.data import ToolDataAccess
from app.tools.errors import RETRYABLE_TYPES, ToolErrorType, ToolFailure, ToolTimeoutError
from app.tools.ledger import EffectLedger, EffectOutcomeUnknown
from app.tools.registry import ToolRegistry
from app.tools.spec import IdempotencyPolicy, SideEffect, ToolContext, ToolSpec

log = get_logger(__name__)
MAX_RESULT_CHARS = 4000
MAX_STORED_STRING = 500


class UnknownToolRequested(AgentError):
    """The model asked for a tool that is not offered to it. Fail closed: end the turn."""

    def __init__(self) -> None:
        super().__init__("The model requested a tool that is not available")


class TaskCancelled(Exception):
    pass


@dataclass(frozen=True)
class ExecutionScope:
    actor_id: str
    actor_type: str
    roles: tuple[str, ...]
    permissions: frozenset[str]
    task_id: str
    conversation_id: str | None
    customer_id: str | None
    active: bool = True  # False when the requester's credential was revoked or no longer exists


@dataclass
class ToolOutcome:
    tool_name: str
    call_id: str
    step_no: int
    status: str  # succeeded | failed | denied | waiting_approval | cancelled
    execution_id: str | None = None
    approval_id: str | None = None
    result: dict[str, Any] | None = None
    error_type: str | None = None
    error_code: str | None = None
    message: str | None = None
    deduplicated: bool = False
    extra: dict[str, Any] = field(default_factory=dict)

    def as_model_content(self) -> str:
        """What the model sees. Tool output is data only: it never changes policy or scope."""
        if self.status == "succeeded":
            body: dict[str, Any] = {"ok": True, "result": self.result}
        else:
            body = {"ok": False, "error_type": self.error_type, "error_code": self.error_code, "message": self.message}
        text = json.dumps(body, ensure_ascii=False, default=str)
        return text if len(text) <= MAX_RESULT_CHARS else text[: MAX_RESULT_CHARS - 20] + '…"truncated"}'


def step_idempotency_key(task_id: str, step_no: int) -> str:
    return hashlib.sha256(f"{task_id}|{step_no}".encode()).hexdigest()[:32]


def input_hash(args: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(args, sort_keys=True, default=str).encode()).hexdigest()


def _truncate(value: Any) -> Any:
    if isinstance(value, str):
        return value if len(value) <= MAX_STORED_STRING else value[:MAX_STORED_STRING] + "…"
    if isinstance(value, dict):
        return {k: _truncate(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_truncate(v) for v in value[:50]]
    return value


def sanitize_args(spec: ToolSpec | None, args: dict[str, Any]) -> dict[str, Any]:
    cleaned = {k: (REDACTED if spec and k in spec.sensitive_fields else v) for k, v in args.items()}
    return _truncate(redact_mapping(cleaned))


class ToolExecutor:
    def __init__(
        self,
        *,
        uow_factory: UowFactory,
        registry: ToolRegistry,
        policy: PolicyEngine,
        audit: AuditLogger,
        events: EventRecorder,
        approval_ttl_seconds: int,
    ) -> None:
        self.uow_factory = uow_factory
        self.registry = registry
        self.policy = policy
        self.audit = audit
        self.events = events
        self.approval_ttl = timedelta(seconds=approval_ttl_seconds)
        self.data = ToolDataAccess(uow_factory)
        self.ledger = EffectLedger(uow_factory)

    # -- public entry points ---------------------------------------------------------------

    async def execute(
        self, call: ToolCall, scope: ExecutionScope, *, step_no: int, allowed: frozenset[str]
    ) -> ToolOutcome:
        """Handle a new tool request from the model as step ``step_no`` of ``scope.task_id``."""
        spec = self.registry.find(call.name) if call.name in allowed else None
        key = step_idempotency_key(scope.task_id, step_no)
        raw_preview = call.arguments if isinstance(call.arguments, dict) else {"raw": str(call.arguments)[:200]}
        async with self.uow_factory() as uow:
            step, execution = self._new_records(uow, call, spec, scope, step_no, key, sanitize_args(spec, raw_preview))
            self._audit(uow, scope, "tool.requested", execution, tool=call.name[:128], step_no=step_no)
            if spec is None:
                self._finish(step, execution, "failed", "failed", ToolErrorType.validation_error, "unknown_tool")
                self._audit(uow, scope, "tool.denied", execution, reason="unknown_tool")
        if spec is None:
            log.warning("tool.unknown_requested", step_no=step_no, status="denied", error_type="validation_error")
            raise UnknownToolRequested()

        try:
            args = self.registry.validate_arguments(spec, call.arguments)
        except ToolFailure as exc:
            return await self._reject(scope, step_no, execution.id, spec, call.id, ToolErrorType.validation_error, exc)

        clean = sanitize_args(spec, args.model_dump(mode="json"))
        async with self.uow_factory() as uow:
            step = await uow.steps.get(scope.task_id, step_no)
            ex = await uow.executions.get(execution.id)
            step.input, ex.sanitized_input = clean, clean
            ex.input_hash = input_hash(args.model_dump(mode="json"))
        return await self._authorize_and_run(spec, call.id, args, scope, step_no, execution.id, ApprovalState.none)

    async def resume_step(self, scope: ExecutionScope, step_no: int) -> ToolOutcome:
        """Re-enter an existing step from its pinned input: after an approval decision, or a
        retry of the same execution. Policy and idempotency are evaluated again, so a step that
        already succeeded returns its stored result instead of running twice."""
        async with self.uow_factory() as uow:
            step = await uow.steps.get(scope.task_id, step_no)
            approval = await uow.approvals.for_step(scope.task_id, step_no)
            execution = await uow.executions.get(step.execution_id) if step and step.execution_id else None
        if step is None or execution is None or step.type != "tool_call":
            raise AgentError("no tool step to resume")
        spec = self.registry.find(step.name)
        if spec is None:
            raise AgentError("tool is no longer registered")
        args = self.registry.validate_arguments(spec, step.input or {})
        state = ApprovalState(approval.status) if approval else ApprovalState.none
        return await self._authorize_and_run(spec, step.tool_call_id or "", args, scope, step_no, execution.id, state)

    # -- pipeline --------------------------------------------------------------------------

    async def _authorize_and_run(
        self,
        spec: ToolSpec,
        call_id: str,
        args: BaseModel,
        scope: ExecutionScope,
        step_no: int,
        execution_id: str,
        approval_state: ApprovalState,
    ) -> ToolOutcome:
        if not scope.active or not spec.permissions_required <= scope.permissions:
            code = "actor_revoked" if not scope.active else "missing_permission"
            failure = ToolFailure("not permitted for this actor", code=code)
            return await self._reject(
                scope, step_no, execution_id, spec, call_id, ToolErrorType.authorization_error, failure
            )

        decision = self.policy.decide(
            PolicyInput(
                actor_id=scope.actor_id, actor_type=scope.actor_type, roles=scope.roles,
                permissions=scope.permissions, tool=spec, conversation_id=scope.conversation_id,
                customer_id=scope.customer_id, approval_state=approval_state,
            )
        )  # fmt: skip
        async with self.uow_factory() as uow:
            ex = await uow.executions.get(execution_id)
            ex.policy_decision, ex.risk_level = decision.decision.value, decision.risk_level.value

        if decision.decision == Decision.DENY:
            failure = ToolFailure("denied by policy", code=decision.reason)
            if decision.reason.startswith("approval_"):
                return await self._skip_after_approval(scope, step_no, execution_id, spec, call_id, decision.reason)
            return await self._reject(scope, step_no, execution_id, spec, call_id, ToolErrorType.policy_denied, failure)
        if decision.decision == Decision.REQUIRE_APPROVAL and spec.sensitive_fields:
            # sensitive inputs are never stored, so such a call could not be resumed after approval
            failure = ToolFailure("this action cannot wait for approval", code="approval_unsupported")
            return await self._reject(scope, step_no, execution_id, spec, call_id, ToolErrorType.policy_denied, failure)
        if decision.decision == Decision.REQUIRE_APPROVAL:
            return await self._request_approval(scope, step_no, execution_id, spec, call_id, decision.reason)

        async with self.uow_factory() as uow:
            ex = await uow.executions.get(execution_id)
            self._audit(uow, scope, "tool.allowed", ex, reason=decision.reason, risk=decision.risk_level.value)

        if spec.idempotency_policy != IdempotencyPolicy.none:
            async with self.uow_factory() as uow:
                prior = await uow.executions.succeeded_with_key(step_idempotency_key(scope.task_id, step_no))
            if prior is not None:
                return ToolOutcome(
                    spec.name, call_id, step_no, "succeeded", execution_id=prior.id, result=prior.output,
                    deduplicated=True,
                )  # fmt: skip
        return await self._run_handler(spec, call_id, args, scope, step_no, execution_id)

    async def _run_handler(
        self, spec: ToolSpec, call_id: str, args: BaseModel, scope: ExecutionScope, step_no: int, execution_id: str
    ) -> ToolOutcome:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get(scope.task_id)
            step = await uow.steps.get(scope.task_id, step_no)
            ex = await uow.executions.get(execution_id)
            if task is not None and task.cancel_requested:
                self._finish(step, ex, "cancelled", "cancelled", None, "task_cancelled")
                self._audit(uow, scope, "tool.cancelled", ex)
                cancelled = True
            else:
                cancelled = False
                now = utcnow()
                step.status, step.started_at = "running", now
                ex.output_status, ex.started_at = "running", now
                self._audit(uow, scope, "tool.started", ex)
        if cancelled:
            raise TaskCancelled()

        key = step_idempotency_key(scope.task_id, step_no)
        external = spec.side_effect in (SideEffect.external_idempotent, SideEffect.external_unsafe)
        ctx = ToolContext(
            actor_id=scope.actor_id, actor_type=scope.actor_type, permissions=scope.permissions,
            conversation_id=scope.conversation_id, customer_id=scope.customer_id, task_id=scope.task_id,
            step_no=step_no, idempotency_key=key if spec.idempotency_policy != IdempotencyPolicy.none else None,
            data=self.data, effects=self.ledger if external else None,
        )  # fmt: skip
        retry_ok = spec.side_effect == SideEffect.none or (
            spec.idempotency_policy != IdempotencyPolicy.none and spec.side_effect != SideEffect.external_unsafe
        )
        attempts = spec.retry_policy.max_attempts if retry_ok else 1
        started = time.monotonic()
        failure: ToolFailure | None = None
        output: dict[str, Any] | None = None
        retries = 0
        for attempt in range(attempts):
            try:
                async with asyncio.timeout(spec.timeout_s):
                    result = await spec.handler(ctx, args)
                output = spec.output_model.model_validate(
                    result.model_dump() if isinstance(result, BaseModel) else result
                ).model_dump(mode="json")
                failure = None
                break
            except EffectOutcomeUnknown as exc:
                failure = exc  # never retried: the effect may already have happened
                break
            except TimeoutError:
                failure = ToolTimeoutError(f"tool timed out after {spec.timeout_s}s")
            except ToolFailure as exc:
                failure = exc
            except ValidationError:
                failure = ToolFailure("tool returned an invalid result", code="invalid_output")
                break
            except Exception as exc:  # noqa: BLE001 - classified, never leaked to the model
                log.error(
                    "tool.handler_crashed", tool=spec.name, error_type="unknown_error", exc_type=type(exc).__name__
                )
                failure = ToolFailure("tool failed unexpectedly", code="unexpected")
                break
            if failure.error_type not in RETRYABLE_TYPES or attempt + 1 >= attempts:
                break
            retries += 1
            await asyncio.sleep(spec.retry_policy.backoff_s * (2**attempt))

        latency = int((time.monotonic() - started) * 1000)
        async with self.uow_factory() as uow:
            step = await uow.steps.get(scope.task_id, step_no)
            ex = await uow.executions.get(execution_id)
            ex.latency_ms, ex.retry_count = latency, retries
            if failure is None:
                stored = _truncate(redact_mapping(output or {}))
                step.output, ex.output = stored, stored
                self._finish(step, ex, "succeeded", "succeeded", None, None)
                self._audit(uow, scope, "tool.succeeded", ex, latency_ms=latency)
            else:
                self._finish(step, ex, "failed", "failed", failure.error_type, failure.code)
                self._audit(uow, scope, "tool.failed", ex, error_type=failure.error_type.value, code=failure.code)
        log.info(
            "tool.executed", tool=spec.name, step_no=step_no, latency_ms=latency, retries=retries,
            status="failed" if failure else "succeeded", error_type=failure.error_type.value if failure else None,
        )  # fmt: skip
        if failure is not None:
            return ToolOutcome(
                spec.name, call_id, step_no, "failed", execution_id=execution_id,
                error_type=failure.error_type.value, error_code=failure.code, message=failure.message,
            )  # fmt: skip
        return ToolOutcome(spec.name, call_id, step_no, "succeeded", execution_id=execution_id, result=output)

    async def _reject(
        self,
        scope: ExecutionScope,
        step_no: int,
        execution_id: str,
        spec: ToolSpec,
        call_id: str,
        error_type: ToolErrorType,
        failure: ToolFailure,
    ) -> ToolOutcome:
        status = "failed" if error_type == ToolErrorType.validation_error else "denied"
        async with self.uow_factory() as uow:
            step = await uow.steps.get(scope.task_id, step_no)
            ex = await uow.executions.get(execution_id)
            self._finish(step, ex, "failed", status, error_type, failure.code)
            self._audit(uow, scope, "tool.denied", ex, reason=failure.code, error_type=error_type.value)
        log.info("tool.denied", tool=spec.name, step_no=step_no, status=status, error_type=error_type.value)
        return ToolOutcome(
            spec.name, call_id, step_no, status, execution_id=execution_id,
            error_type=error_type.value, error_code=failure.code, message=failure.message,
        )  # fmt: skip

    async def _request_approval(
        self, scope: ExecutionScope, step_no: int, execution_id: str, spec: ToolSpec, call_id: str, reason: str
    ) -> ToolOutcome:
        async with self.uow_factory() as uow:
            step = await uow.steps.get(scope.task_id, step_no)
            ex = await uow.executions.get(execution_id)
            approval = Approval(
                id=new_id("apr"), task_id=scope.task_id, step_no=step_no, execution_id=execution_id,
                conversation_id=scope.conversation_id, tool_name=spec.name, tool_version=spec.version,
                risk_level=self.policy.effective_risk(spec).value, reason=reason, sanitized_input=step.input,
                requested_by=scope.actor_id, status="pending", expires_at=utcnow() + self.approval_ttl,
                created_at=utcnow(),
            )  # fmt: skip
            uow.approvals.add(approval)
            step.status, step.approval_id = "waiting_approval", approval.id
            ex.output_status, ex.approval_id = "waiting_approval", approval.id
            ex.error_type = ToolErrorType.approval_required.value
            self._audit(uow, scope, "approval.requested", ex, approval_id=approval.id, reason=reason)
            self.events.record(
                uow, EventType.approval_requested,
                subject={
                    "approval_id": approval.id, "task_id": scope.task_id, "conversation_id": scope.conversation_id,
                },
                data={"tool": spec.name, "risk_level": approval.risk_level},
            )  # fmt: skip
        log.info("tool.approval_requested", tool=spec.name, step_no=step_no, approval_id=approval.id)
        return ToolOutcome(
            spec.name, call_id, step_no, "waiting_approval", execution_id=execution_id, approval_id=approval.id,
            error_type=ToolErrorType.approval_required.value, error_code=reason,
        )  # fmt: skip

    async def _skip_after_approval(
        self, scope: ExecutionScope, step_no: int, execution_id: str, spec: ToolSpec, call_id: str, reason: str
    ) -> ToolOutcome:
        """Approval rejected/expired/cancelled: the tool is not executed."""
        async with self.uow_factory() as uow:
            step = await uow.steps.get(scope.task_id, step_no)
            ex = await uow.executions.get(execution_id)
            self._finish(step, ex, "skipped", "denied", ToolErrorType.policy_denied, reason)
            self._audit(uow, scope, "tool.denied", ex, reason=reason)
        return ToolOutcome(
            spec.name, call_id, step_no, "denied", execution_id=execution_id, approval_id=step.approval_id,
            error_type=ToolErrorType.policy_denied.value, error_code=reason,
            message="the request was not approved, so the action was not performed",
        )  # fmt: skip

    # -- records ---------------------------------------------------------------------------

    def _new_records(
        self,
        uow: UnitOfWork,
        call: ToolCall,
        spec: ToolSpec | None,
        scope: ExecutionScope,
        step_no: int,
        key: str,
        preview: dict[str, Any],
    ) -> tuple[TaskStep, ToolExecution]:
        now = utcnow()
        execution = ToolExecution(
            id=new_id("exec"), task_id=scope.task_id, step_no=step_no, conversation_id=scope.conversation_id,
            tool_name=(spec.name if spec else call.name)[:128], tool_version=spec.version if spec else "-",
            actor_type=scope.actor_type, actor_id=scope.actor_id, sanitized_input=preview, output_status="pending",
            retry_count=0, idempotency_key=key if spec and spec.idempotency_policy != IdempotencyPolicy.none else None,
            created_at=now,
        )  # fmt: skip
        step = TaskStep(
            id=new_id("step"), task_id=scope.task_id, step_no=step_no, type="tool_call",
            name=(spec.name if spec else call.name)[:128], status="pending", tool_call_id=call.id[:80],
            input=preview, execution_id=execution.id, created_at=now,
        )  # fmt: skip
        uow.executions.add(execution)
        uow.steps.add(step)
        return step, execution

    @staticmethod
    def _finish(
        step: TaskStep | None,
        execution: ToolExecution | None,
        step_status: str,
        execution_status: str,
        error_type: ToolErrorType | None,
        code: str | None,
    ) -> None:
        now = utcnow()
        if step is not None:
            step.status, step.finished_at = step_status, now
            step.error_type = error_type.value if error_type else None
            step.error_code = code
        if execution is not None:
            execution.output_status, execution.completed_at = execution_status, now
            execution.error_type = error_type.value if error_type else None
            execution.error_code = code

    def _audit(self, uow: UnitOfWork, scope: ExecutionScope, action: str, execution: ToolExecution, **details) -> None:
        self.audit.record(
            uow, actor_type="agent", actor_id=scope.actor_id, action=action, target=execution.id,
            details={"tool": execution.tool_name, "task_id": scope.task_id, **details},
        )  # fmt: skip
