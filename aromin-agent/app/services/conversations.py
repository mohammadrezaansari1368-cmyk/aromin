"""Conversation use cases for the API layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.errors import NotFound
from app.db.uow import UowFactory
from app.events.recorder import EventRecorder
from app.events.types import EventType
from app.memory.conversation import ConversationMemory
from app.models.conversation import Conversation, Message
from app.security.auth import Principal
from app.services.audit import AuditLogger


@dataclass
class ConversationPage:
    conversation: Conversation
    messages: list[Message]
    next_cursor: int | None


class ConversationService:
    def __init__(
        self,
        uow_factory: UowFactory,
        memory: ConversationMemory,
        events: EventRecorder,
        audit: AuditLogger,
        agent_profile: str,
    ) -> None:
        self._uow_factory = uow_factory
        self._memory = memory
        self._events = events
        self._audit = audit
        self._profile = agent_profile

    async def create(
        self, principal: Principal, *, channel: str, customer_ref: str | None, metadata: dict[str, Any]
    ) -> Conversation:
        async with self._uow_factory() as uow:
            conversation = self._memory.new_conversation(channel, self._profile, metadata)
            if customer_ref:
                conversation.metadata_ = {**metadata, "customer_ref": customer_ref}
            uow.conversations.add(conversation)
            await uow.conversations.flush()
            self._events.record(
                uow, EventType.conversation_created,
                subject={"conversation_id": conversation.id}, data={"channel": channel},
            )  # fmt: skip
            self._audit.record(
                uow, actor_type=principal.type, actor_id=principal.id,
                action="conversation.created", target=conversation.id,
            )  # fmt: skip
            return conversation

    async def get_page(self, conversation_id: str, *, after_seq: int, limit: int) -> ConversationPage:
        async with self._uow_factory() as uow:
            conversation = await uow.conversations.get(conversation_id)
            if conversation is None:
                raise NotFound("Conversation not found")
            rows = await uow.messages.page(conversation_id, after_seq, limit + 1)
            next_cursor = rows[limit - 1].seq if len(rows) > limit else None
            return ConversationPage(conversation, rows[:limit], next_cursor)
