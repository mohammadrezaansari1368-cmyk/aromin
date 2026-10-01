"""AgentRuntime — orchestrates one agent turn (blueprint §3).

Every collaborator is injected, so the runtime is not tied to a provider, database or
transport: model provider + router, conversation memory, context engine, tool registry,
task engine and event recorder.

Turn flow (Task Engine reference §9.1, §9.14, Phase 1 subset):
1. txn 1: lock the conversation, dedupe ``client_msg_id``, store the user message, create
   the inline task row (eager) and record ``message.received``;
2. build the context and stream the model call (no DB transaction is open);
3. txn 2: store the assistant reply, mark the task succeeded, record ``message.sent``;
   on provider failure: mark the task failed and emit a ``TurnFailed`` event.

Not in Phase 1: tool execution loop, escalation to background, attach/deliver gate,
fallback tasks. Provider reasoning fields never reach these events or the database.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

import structlog

from app.agent.events import MessageDelta, RuntimeEvent, TurnCompleted, TurnFailed, TurnStarted
from app.agent.profile import AgentProfile
from app.context.engine import ContextEngine, ContextTurn
from app.core.errors import AgentError, ConversationBusy, IdempotencyConflict, PreviousAttemptFailed
from app.core.logging import get_logger
from app.db.uow import UnitOfWork, UowFactory
from app.events.recorder import EventRecorder
from app.events.types import EventType
from app.memory.conversation import ConversationMemory, content_hash
from app.models.conversation import Message
from app.providers.base import LLMProvider, Usage
from app.providers.errors import ProviderError
from app.providers.factory import ModelRouter
from app.tasks.engine import TaskEngine
from app.tools.registry import ToolRegistry

log = get_logger(__name__)


@dataclass(frozen=True)
class TurnInput:
    content: str
    actor_id: str
    channel: str = "api"
    conversation_id: str | None = None
    client_msg_id: str | None = None


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

    async def run_turn(self, turn: TurnInput) -> AsyncIterator[RuntimeEvent]:
        replay, started, history = await self._intake(turn)
        if replay is not None:
            yield started
            yield replay
            return
        yield started
        conversation_id, task_id = started.conversation_id, started.task_id
        with structlog.contextvars.bound_contextvars(conversation_id=conversation_id, task_id=task_id):
            model = self.model_router.select(self.profile.model_tier)
            request = self.context.build(
                system_prompt=self.profile.system_prompt,
                history=history,
                model=model,
                max_output_tokens=self.profile.max_output_tokens,
                timeout_s=self.provider_timeout_s,
            )
            parts: list[str] = []
            usage: Usage | None = None
            finish_reason: str | None = None
            loop_clock = _Stopwatch()
            try:
                async for delta in self.provider.stream(request):
                    if delta.text:
                        parts.append(delta.text)
                        yield MessageDelta(text=delta.text)
                    if delta.done:
                        usage, finish_reason = delta.usage, delta.finish_reason
                        model = delta.model or model
                if finish_reason == "tool_calls":
                    raise AgentError("Tool calls are not enabled in this phase")
            except (ProviderError, AgentError) as exc:
                latency = loop_clock.ms()
                await self._record_failure(task_id, exc)
                log.warning(
                    "agent.turn_failed",
                    provider=self.provider.name,
                    model=model,
                    latency_ms=latency,
                    status="failed",
                    error_type=exc.code,
                )
                yield TurnFailed(
                    conversation_id=conversation_id,
                    task_id=task_id,
                    code=exc.code,
                    error_class=getattr(exc, "error_class", "permanent"),
                    retryable=getattr(exc, "retryable", False),
                )
                return
            except Exception:
                # Unexpected bug: never leave the task running (it would block the conversation).
                await self._record_failure(task_id, AgentError("unexpected runtime error"))
                log.error("agent.turn_crashed", provider=self.provider.name, status="failed", error_type="bug")
                raise
            latency = loop_clock.ms()
            content = "".join(parts)
            reply = await self._complete(conversation_id, task_id, content, model, usage, latency)
            log.info(
                "agent.turn_completed",
                provider=self.provider.name,
                model=model,
                latency_ms=latency,
                status="succeeded",
                output_chars=len(content),
                tokens_in=usage.input_tokens if usage else None,
                tokens_out=usage.output_tokens if usage else None,
            )
            yield TurnCompleted(
                conversation_id=conversation_id,
                task_id=task_id,
                message_id=reply.id,
                seq=reply.seq,
                created_at=reply.created_at,
                content=content,
                model=model,
                provider=self.provider.name,
                usage=usage,
                latency_ms=latency,
            )

    async def _intake(self, turn: TurnInput) -> tuple[TurnCompleted | None, TurnStarted, list[ContextTurn]]:
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
                    return completed, replay_started, []

            user_message = self.memory.append(
                uow, conversation, role="user", content=turn.content, channel_msg_id=turn.client_msg_id
            )
            task = await self.tasks.start_inline_turn(
                uow, conversation_id=conversation.id, trigger_seq=user_message.seq, created_by=turn.actor_id
            )
            user_message.task_id = task.id
            await uow.messages.flush()
            self.events.record(
                uow, EventType.message_received,
                subject={"conversation_id": conversation.id, "message_id": user_message.id},
                data={"channel": turn.channel, "seq": user_message.seq},
            )  # fmt: skip
            history = [ContextTurn(m.role, m.content) for m in await self.memory.recent(uow, conversation.id)]
            started = TurnStarted(conversation_id=conversation.id, task_id=task.id, user_message_id=user_message.id)
        log.info("agent.turn_started", conversation_id=started.conversation_id, task_id=started.task_id)
        return None, started, history

    async def _replay(self, uow: UnitOfWork, previous: Message, turn: TurnInput) -> tuple[TurnCompleted, TurnStarted]:
        """Client retry with the same client_msg_id: never start the turn twice."""
        if previous.content_hash != content_hash(turn.content):
            raise IdempotencyConflict()
        task = await uow.tasks.get(previous.task_id) if previous.task_id else None
        reply = await uow.messages.assistant_reply_for_task(previous.task_id) if previous.task_id else None
        if reply is None:
            if task is not None and task.status == "running":
                raise ConversationBusy("This message is still being answered")
            raise PreviousAttemptFailed()
        started = TurnStarted(
            conversation_id=previous.conversation_id, task_id=previous.task_id, user_message_id=previous.id,
            replayed=True,
        )  # fmt: skip
        completed = TurnCompleted(
            conversation_id=previous.conversation_id,
            task_id=previous.task_id,
            message_id=reply.id,
            seq=reply.seq,
            created_at=reply.created_at,
            content=reply.content,
            model=reply.model,
            provider=reply.provider,
            usage=Usage(input_tokens=reply.tokens_in or 0, output_tokens=reply.tokens_out or 0),
            latency_ms=reply.latency_ms,
            replayed=True,
        )
        return completed, started

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

    async def _record_failure(self, task_id: str, exc: ProviderError | AgentError) -> None:
        async with self.uow_factory() as uow:
            task = await uow.tasks.get_for_update(task_id)
            if task is None or task.status != "running":
                return
            self.tasks.fail(
                task, code=exc.code, error_class=getattr(exc, "error_class", "permanent"), message=exc.title
            )


class _Stopwatch:
    def __init__(self) -> None:
        self._start = time.monotonic()

    def ms(self) -> int:
        return int((time.monotonic() - self._start) * 1000)
