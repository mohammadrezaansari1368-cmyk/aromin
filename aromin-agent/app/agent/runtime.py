"""AgentRuntime — orchestrates an agent turn, now including controlled tool use (blueprint §3).

Every collaborator is injected (provider + router, memory, context engine, tool registry and
executor, task engine, event recorder, cost estimator), so the runtime stays provider- and
transport-independent.

Turn flow:
1. txn: lock conversation, dedupe ``client_msg_id``, store the user message, create the inline
   task row, record ``message.received`` (Phase 1, unchanged);
2. loop, bounded by ``AgentLimits``:
   context -> model (streamed; usage + cost recorded per invocation as a ``model_call`` step)
   -> no tool calls: final answer
   -> tool calls: each goes through ToolExecutor (validation, RBAC, policy, approval,
      idempotency, handler) and its result is appended to the turn transcript -> model again;
3. txn: store the reply, task ``succeeded``, record ``message.sent``.

A tool that needs approval pauses the turn (task ``waiting``); ``resume()`` continues it after a
human decision. Limits (tool iterations, turn time, token and cost budget) stop the turn
safely. Cancellation is observed before every model call and every tool execution.
Provider reasoning fields never reach events, the transcript or the database.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import structlog

from app.agent.events import (
    MessageDelta,
    RuntimeEvent,
    ToolCompleted,
    ToolStarted,
    TurnAwaitingApproval,
    TurnCompleted,
    TurnFailed,
    TurnStarted,
)
from app.agent.profile import AgentProfile
from app.agent.usage import CostEstimator, record_usage
from app.context.engine import ContextEngine, ContextTurn
from app.core.errors import (
    AgentError,
    AgentLimitExceeded,
    AppError,
    ConversationBusy,
    IdempotencyConflict,
    PreviousAttemptFailed,
    TaskFinished,
)
from app.core.ids import new_id
from app.core.logging import get_logger
from app.db.uow import UnitOfWork, UowFactory
from app.events.recorder import EventRecorder
from app.events.types import EventType
from app.memory.conversation import ConversationMemory, content_hash
from app.models.base import utcnow
from app.models.conversation import Message
from app.models.tooling import TaskStep
from app.providers.base import ChatMessage, LLMProvider, ToolCall, Usage
from app.providers.errors import ProviderError
from app.providers.factory import ModelRouter
from app.security.permissions import permissions_for
from app.tasks.engine import TaskEngine
from app.tools.executor import ExecutionScope, TaskCancelled, ToolExecutor, ToolOutcome, sanitize_args
from app.tools.registry import ToolRegistry

log = get_logger(__name__)


@dataclass(frozen=True)
class TurnInput:
    content: str
    actor_id: str
    channel: str = "api"
    conversation_id: str | None = None
    client_msg_id: str | None = None
    actor_type: str = "api_key"
    roles: tuple[str, ...] = ()
    permissions: frozenset[str] = frozenset()


@dataclass(frozen=True)
class AgentLimits:
    max_tool_iterations: int = 5
    turn_timeout_s: float = 120.0
    max_tokens_per_turn: int = 20000
    max_cost_per_turn: float | None = None


class _Stop(Exception):
    def __init__(self, error: AppError, reason: str | None = None) -> None:
        self.error, self.reason = error, reason


class AgentRuntime:
    def __init__(
        self,
        *,
        uow_factory: UowFactory,
        provider: LLMProvider,
        model_router: ModelRouter,
        memory: ConversationMemory,
        context: ContextEngine,
        tools: ToolRegistry,
        tasks: TaskEngine,
        events: EventRecorder,
        profile: AgentProfile,
        provider_timeout_s: float,
        executor: ToolExecutor | None = None,
        limits: AgentLimits | None = None,
        cost: CostEstimator | None = None,
        approvals: Any = None,
    ) -> None:
        self.uow_factory = uow_factory
        self.provider = provider
        self.model_router = model_router
        self.memory = memory
        self.context = context
        self.tools = tools
        self.tasks = tasks
        self.events = events
        self.profile = profile
        self.provider_timeout_s = provider_timeout_s
        self.executor = executor
        self.limits = limits or AgentLimits()
        self.cost = cost or CostEstimator({})
        self.approvals = approvals

    # -- entry points --------------------------------------------------------------------

    async def run_turn(self, turn: TurnInput) -> AsyncIterator[RuntimeEvent]:
        replay, started, customer_id = await self._intake(turn)
        yield started
        if replay is not None:
            yield replay
            return
        scope = ExecutionScope(
            actor_id=turn.actor_id, actor_type=turn.actor_type, roles=turn.roles, permissions=turn.permissions,
            task_id=started.task_id, conversation_id=started.conversation_id, customer_id=customer_id,
        )  # fmt: skip
        async for event in self._guarded_loop(scope, started.conversation_id, pending=None):
            yield event

    async def resume(self, task_id: str) -> AsyncIterator[RuntimeEvent]:
        """Continue a task that waited for an approval decision (inline; a worker later)."""
        async with self.uow_factory() as uow:
            task = await uow.tasks.get_for_update(task_id)
            if task is None or task.status != "waiting" or not (task.wait_ref or "").startswith("approval:"):
                raise TaskFinished("The task is not waiting for an approval")
            if task.cancel_requested:
                raise TaskFinished("The task was cancelled")
            approval = await uow.approvals.get(task.wait_ref.split(":", 1)[1])
            if approval is None or approval.status == "pending":
                raise TaskFinished("The approval has not been decided")
            await self.tasks.resume(uow, task)
            conversation = await uow.conversations.get(task.conversation_id) if task.conversation_id else None
            actor_type, actor_id = task.state.get("actor_type", "api_key"), task.created_by or ""
            roles, permissions, active = await self._current_authority(uow, actor_type, actor_id)
            pending = dict(task.state.get("pending") or {})
            trigger = await uow.messages.by_task_user(task.id)
            started = TurnStarted(
                conversation_id=task.conversation_id or "", task_id=task.id,
                user_message_id=trigger.id if trigger else "", resumed=True,
            )  # fmt: skip
        yield started
        scope = ExecutionScope(
            actor_id=actor_id, actor_type=actor_type, roles=roles, permissions=permissions, task_id=task_id,
            conversation_id=started.conversation_id, customer_id=conversation.customer_id if conversation else None,
            active=active,
        )  # fmt: skip
        async for event in self._guarded_loop(scope, started.conversation_id, pending=pending):
            yield event

    # -- loop ------------------------------------------------------------------------------

    async def _guarded_loop(
        self, scope: ExecutionScope, conversation_id: str, pending: dict[str, Any] | None
    ) -> AsyncIterator[RuntimeEvent]:
        task_id = scope.task_id
        with structlog.contextvars.bound_contextvars(conversation_id=conversation_id, task_id=task_id):
            try:
                async for event in self._loop(scope, conversation_id, pending):
                    yield event
            except _Stop as stop:
                await self._record_failure(task_id, stop.error, stop.reason)
                log.warning("agent.turn_stopped", status="failed", error_type=stop.error.code, reason=stop.reason)
                yield self._failed(conversation_id, task_id, stop.error)
            except TaskCancelled:
                await self._mark_cancelled(task_id)
                log.info("agent.turn_cancelled", status="cancelled")
                yield TurnFailed(
                    conversation_id=conversation_id, task_id=task_id, code="task_cancelled",
                    error_class="cancelled", retryable=False,
                )  # fmt: skip
            except (ProviderError, AgentError) as exc:
                await self._record_failure(task_id, exc)
                log.warning("agent.turn_failed", provider=self.provider.name, status="failed", error_type=exc.code)
                yield self._failed(conversation_id, task_id, exc)
            except Exception:
                # Unexpected bug: never leave the task running (it would block the conversation).
                await self._record_failure(task_id, AgentError("unexpected runtime error"))
                log.error("agent.turn_crashed", provider=self.provider.name, status="failed", error_type="bug")
                raise

    async def _loop(
        self, scope: ExecutionScope, conversation_id: str, pending: dict[str, Any] | None
    ) -> AsyncIterator[RuntimeEvent]:
        task_id = scope.task_id
        deadline = time.monotonic() + self.limits.turn_timeout_s  # active time: re-armed on resume
        state = await self._load_state(task_id)
        transcript: list[dict[str, Any]] = state.setdefault("transcript", [])

        if pending:  # continue the step that waited for approval, then the calls deferred behind it
            outcome = await self._executor().resume_step(scope, int(pending["step_no"]))
            yield ToolStarted(tool=outcome.tool_name, call_id=pending["call_id"], step_no=outcome.step_no)
            yield self._completed_event(outcome, pending["call_id"])
            transcript.append(self._tool_message(pending["call_id"], outcome))
            for deferred in pending.get("deferred", []):
                transcript.append({"role": "tool", "tool_call_id": deferred["call_id"], "content": _DEFERRED_RESULT})
            state.pop("pending", None)
            await self._save_state(task_id, state)

        model = self.model_router.select(self.profile.model_tier)
        while True:
            await self._raise_if_cancelled(task_id)
            iterations = int(state.get("iterations", 0))
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise _Stop(AgentLimitExceeded("The turn ran out of time"), "turn_timeout")
            if int(state.get("tokens", 0)) >= self.limits.max_tokens_per_turn:
                raise _Stop(AgentLimitExceeded("The turn's token budget is used up"), "token_budget_exceeded")
            if self.limits.max_cost_per_turn is not None and float(state.get("cost", 0.0)) >= (
                self.limits.max_cost_per_turn
            ):
                raise _Stop(AgentLimitExceeded("The turn's cost budget is used up"), "cost_budget_exceeded")

            offer_tools = iterations < self.limits.max_tool_iterations and self.executor is not None
            async with self.uow_factory() as uow:
                history = [ContextTurn(m.role, m.content) for m in await self.memory.recent(uow, conversation_id)]
            request = self.context.build(
                system_prompt=self.profile.system_prompt,
                history=history,
                model=model,
                max_output_tokens=self.profile.max_output_tokens,
                timeout_s=min(self.provider_timeout_s, remaining),
                turn_messages=[_to_chat_message(m) for m in transcript],
                tools=self.tools.definitions(self.profile.allowed_tools) if offer_tools else [],
            )
            parts: list[str] = []
            usage: Usage | None = None
            calls: list[ToolCall] = []
            started = time.monotonic()
            try:
                async for delta in self.provider.stream(request):
                    if delta.text:
                        parts.append(delta.text)
                        yield MessageDelta(text=delta.text)
                    if delta.done:
                        usage, calls = delta.usage, list(delta.tool_calls)
                        model = delta.model or model
            except ProviderError as exc:
                await self._record_model_call(scope, model, None, int((time.monotonic() - started) * 1000), exc.code)
                raise
            latency = int((time.monotonic() - started) * 1000)
            cost = await self._record_model_call(scope, model, usage, latency, None)
            state["tokens"] = int(state.get("tokens", 0)) + ((usage.input_tokens + usage.output_tokens) if usage else 0)
            state["cost"] = float(state.get("cost", 0.0)) + (cost or 0.0)
            state.setdefault("usage", {"input_tokens": 0, "output_tokens": 0})
            if usage:
                state["usage"]["input_tokens"] += usage.input_tokens
                state["usage"]["output_tokens"] += usage.output_tokens

            if not calls:
                content = "".join(parts)
                await self._save_state(task_id, state)
                reply = await self._complete(conversation_id, task_id, content, model, usage, latency)
                total = Usage(**state["usage"])
                log.info(
                    "agent.turn_completed", provider=self.provider.name, model=model, latency_ms=latency,
                    status="succeeded", output_chars=len(content), tokens_in=total.input_tokens,
                    tokens_out=total.output_tokens, tool_iterations=iterations,
                )  # fmt: skip
                yield TurnCompleted(
                    conversation_id=conversation_id, task_id=task_id, message_id=reply.id, seq=reply.seq,
                    created_at=reply.created_at, content=content, model=model, provider=self.provider.name,
                    usage=total, latency_ms=latency,
                )  # fmt: skip
                return

            if not offer_tools:
                raise _Stop(AgentLimitExceeded("Too many tool calls in one turn"), "tool_iteration_limit")

            transcript.append(_assistant_entry("".join(parts), calls, self.tools))
            state["iterations"] = iterations + 1
            await self._save_state(task_id, state)
            for index, call in enumerate(calls):
                await self._raise_if_cancelled(task_id)
                step_no = await self._next_step_no(task_id)
                yield ToolStarted(tool=call.name[:64], call_id=call.id, step_no=step_no)
                outcome = await self._executor().execute(
                    call, scope, step_no=step_no, allowed=self.profile.allowed_tools
                )
                yield self._completed_event(outcome, call.id)
                if outcome.status == "waiting_approval":
                    state["pending"] = {
                        "step_no": step_no, "call_id": call.id,
                        "deferred": [{"call_id": c.id, "name": c.name[:64]} for c in calls[index + 1 :]],
                    }  # fmt: skip
                    await self._wait_for_approval(task_id, state, outcome.approval_id or "")
                    yield TurnAwaitingApproval(
                        conversation_id=conversation_id, task_id=task_id, approval_id=outcome.approval_id or "",
                        tool=outcome.tool_name, step_no=step_no,
                    )  # fmt: skip
                    return
                transcript.append(self._tool_message(call.id, outcome))
                await self._save_state(task_id, state)

    # -- intake (Phase 1, plus waiting/expiry handling) ----------------------------------------

    async def _intake(self, turn: TurnInput) -> tuple[TurnCompleted | None, TurnStarted, str | None]:
        async with self.uow_factory() as uow:
            if turn.conversation_id is None:
                conversation = self.memory.new_conversation(turn.channel, self.profile.name)
                uow.conversations.add(conversation)
                await uow.conversations.flush()
                self.events.record(
                    uow, EventType.conversation_created,
                    subject={"conversation_id": conversation.id}, data={"channel": turn.channel},
                )  # fmt: skip
            else:
                conversation = await self.memory.lock(uow, turn.conversation_id)

            if turn.client_msg_id:
                previous = await uow.messages.by_channel_msg_id(conversation.id, turn.client_msg_id)
                if previous is not None:
                    completed, replay_started = await self._replay(uow, previous, turn)
                    return completed, replay_started, None

            if self.approvals is not None:
                await self.approvals.expire_due_for_conversation(uow, conversation.id)
            user_message = self.memory.append(
                uow, conversation, role="user", content=turn.content, channel_msg_id=turn.client_msg_id
            )
            task = await self.tasks.start_inline_turn(
                uow, conversation_id=conversation.id, trigger_seq=user_message.seq, created_by=turn.actor_id
            )
            task.state = {"actor_type": turn.actor_type}
            user_message.task_id = task.id
            await uow.messages.flush()
            self.events.record(
                uow, EventType.message_received,
                subject={"conversation_id": conversation.id, "message_id": user_message.id},
                data={"channel": turn.channel, "seq": user_message.seq},
            )  # fmt: skip
            started = TurnStarted(conversation_id=conversation.id, task_id=task.id, user_message_id=user_message.id)
        log.info("agent.turn_started", conversation_id=started.conversation_id, task_id=started.task_id)
        return None, started, conversation.customer_id

    async def _replay(self, uow: UnitOfWork, previous: Message, turn: TurnInput) -> tuple[TurnCompleted, TurnStarted]:
        """Client retry with the same client_msg_id: never start the turn twice."""
        if previous.content_hash != content_hash(turn.content):
            raise IdempotencyConflict()
        task = await uow.tasks.get(previous.task_id) if previous.task_id else None
        reply = await uow.messages.assistant_reply_for_task(previous.task_id) if previous.task_id else None
        if reply is None:
            if task is not None and task.status in ("running", "waiting"):
                raise ConversationBusy("This message is still being answered")
            raise PreviousAttemptFailed()
        started = TurnStarted(
            conversation_id=previous.conversation_id, task_id=previous.task_id, user_message_id=previous.id,
            replayed=True,
        )  # fmt: skip
        completed = TurnCompleted(
            conversation_id=previous.conversation_id, task_id=previous.task_id, message_id=reply.id, seq=reply.seq,
            created_at=reply.created_at, content=reply.content, model=reply.model, provider=reply.provider,
            usage=Usage(input_tokens=reply.tokens_in or 0, output_tokens=reply.tokens_out or 0),
            latency_ms=reply.latency_ms, replayed=True,
        )  # fmt: skip
        return completed, started

    # -- persistence helpers -------------------------------------------------------------------

    def _executor(self) -> ToolExecutor:
        if self.executor is None:
            raise AgentError("Tools are not enabled for this runtime")
        return self.executor

    async def _current_authority(self, uow: UnitOfWork, actor_type: str, actor_id: str):
        """Re-derive the requester's authority at resume time: a revoked key keeps no rights."""
        if actor_type != "api_key":
            return (), frozenset(), False
        key = await uow.api_keys.get(actor_id)
        if key is None or key.revoked_at is not None:
            return (), frozenset(), False
        roles = tuple(key.roles or ())
        return roles, permissions_for(roles), True

    async def _load_state(self, task_id: str) -> dict[str, Any]:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get(task_id)
            return dict(task.state or {}) if task else {}

    async def _save_state(self, task_id: str, state: dict[str, Any]) -> None:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get_for_update(task_id)
            if task is not None:
                task.state = _json_copy(state)

    async def _next_step_no(self, task_id: str) -> int:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get_for_update(task_id)
            task.step_count += 1
            return task.step_count

    async def _raise_if_cancelled(self, task_id: str) -> None:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get(task_id)
            if task is None or task.cancel_requested:
                raise TaskCancelled()

    async def _record_model_call(
        self, scope: ExecutionScope, model: str, usage: Usage | None, latency: int, error_code: str | None
    ) -> float | None:
        cost = self.cost.estimate(model, usage) if usage else None
        async with self.uow_factory() as uow:
            task = await uow.tasks.get_for_update(scope.task_id)
            task.step_count += 1
            now = utcnow()
            uow.steps.add(
                TaskStep(
                    id=new_id("step"), task_id=scope.task_id, step_no=task.step_count, type="model_call", name=model,
                    status="failed" if error_code else "succeeded", error_type="provider_error" if error_code else None,
                    error_code=error_code, created_at=now, started_at=now, finished_at=now,
                )
            )  # fmt: skip
            record_usage(
                uow, task_id=scope.task_id, conversation_id=scope.conversation_id, step_no=task.step_count,
                provider=self.provider.name, model=model, tier=self.profile.model_tier, usage=usage,
                latency_ms=latency, status="failed" if error_code else "succeeded", error_type=error_code, cost=cost,
            )  # fmt: skip
        return cost

    async def _wait_for_approval(self, task_id: str, state: dict[str, Any], approval_id: str) -> None:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get_for_update(task_id)
            task.state = _json_copy(state)
            self.tasks.enter_wait(task, wait_kind="approval", wait_ref=f"approval:{approval_id}")
        log.info("agent.turn_waiting_approval", approval_id=approval_id, status="waiting")

    async def _complete(
        self, conversation_id: str, task_id: str, content: str, model: str, usage: Usage | None, latency: int
    ) -> Message:
        async with self.uow_factory() as uow:
            conversation = await self.memory.lock(uow, conversation_id)
            task = await uow.tasks.get_for_update(task_id)
            assert task is not None
            reply = self.memory.append(
                uow, conversation, role="assistant", content=content, task_id=task_id, model=model,
                provider=self.provider.name, tokens_in=usage.input_tokens if usage else None,
                tokens_out=usage.output_tokens if usage else None, latency_ms=latency,
            )  # fmt: skip
            conversation.answered_through_seq = max(conversation.answered_through_seq, task.input["trigger_seq"])
            self.tasks.succeed(task, {"message_id": reply.id})
            await uow.messages.flush()
            self.events.record(
                uow, EventType.message_sent,
                subject={"conversation_id": conversation_id, "message_id": reply.id, "task_id": task_id},
                data={"seq": reply.seq},
            )  # fmt: skip
            return reply

    async def _record_failure(self, task_id: str, exc: AppError, reason: str | None = None) -> None:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get_for_update(task_id)
            if task is None or task.status != "running":
                return
            self.tasks.fail(
                task, code=reason or exc.code, error_class=getattr(exc, "error_class", "permanent"), message=exc.title
            )
            if reason:
                task.last_error["error_class"] = "budget_exceeded"

    async def _mark_cancelled(self, task_id: str) -> None:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get_for_update(task_id)
            if task is not None and task.status == "running":
                self.tasks.cancel(task, "cancel requested")
                self.events.record(uow, EventType.task_cancelled, subject={"task_id": task_id}, data={})

    @staticmethod
    def _failed(conversation_id: str, task_id: str, exc: AppError) -> TurnFailed:
        return TurnFailed(
            conversation_id=conversation_id, task_id=task_id, code=exc.code,
            error_class=getattr(exc, "error_class", "permanent"), retryable=getattr(exc, "retryable", False),
        )  # fmt: skip

    @staticmethod
    def _completed_event(outcome: ToolOutcome, call_id: str) -> ToolCompleted:
        return ToolCompleted(
            tool=outcome.tool_name, call_id=call_id, step_no=outcome.step_no, status=outcome.status,
            error_type=outcome.error_type,
        )  # fmt: skip

    @staticmethod
    def _tool_message(call_id: str, outcome: ToolOutcome) -> dict[str, Any]:
        return {"role": "tool", "tool_call_id": call_id, "content": outcome.as_model_content()}


_DEFERRED_RESULT = (
    '{"ok": false, "error_type": "business_error", "error_code": "not_executed", '
    '"message": "not executed while an earlier action waited for approval; request it again if still needed"}'
)


def _assistant_entry(content: str, calls: list[ToolCall], registry: ToolRegistry) -> dict[str, Any]:
    entries = []
    for call in calls:
        args = call.arguments if isinstance(call.arguments, dict) else {"raw": str(call.arguments)[:500]}
        entries.append(
            {"id": call.id, "name": call.name[:128], "arguments": sanitize_args(registry.find(call.name), args)}
        )
    return {"role": "assistant", "content": content, "tool_calls": entries}


def _to_chat_message(entry: dict[str, Any]) -> ChatMessage:
    if entry["role"] == "tool":
        return ChatMessage(role="tool", content=entry["content"], tool_call_id=entry["tool_call_id"])
    return ChatMessage(
        role="assistant",
        content=entry.get("content", ""),
        tool_calls=[
            ToolCall(id=c["id"], name=c["name"], arguments=c["arguments"]) for c in entry.get("tool_calls", [])
        ],
    )


def _json_copy(state: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(state, default=str))
