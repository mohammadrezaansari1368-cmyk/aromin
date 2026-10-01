"""Conversation memory (blueprint §4, conversation layer).

Phase 1 stores every message durably and returns the last K turns for context.
Session, customer and semantic memory and the rolling summary are later phases.
"""

from __future__ import annotations

import hashlib

from app.core.errors import NotFound
from app.core.ids import new_id
from app.db.uow import UnitOfWork
from app.models.base import utcnow
from app.models.conversation import Conversation, Message


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class ConversationMemory:
    def __init__(self, history_messages: int = 20) -> None:
        self.history_messages = history_messages

    @staticmethod
    def new_conversation(
        channel: str, agent_profile: str, metadata: dict | None = None, customer_id: str | None = None
    ) -> Conversation:
        return Conversation(
            id=new_id("conv"),
            channel=channel,
            status="open",
            agent_profile=agent_profile,
            customer_id=customer_id,
            msg_seq=0,
            last_user_seq=0,
            answered_through_seq=0,
            metadata_=metadata or {},
            created_at=utcnow(),
        )

    async def lock(self, uow: UnitOfWork, conversation_id: str) -> Conversation:
        conversation = await uow.conversations.get_for_update(conversation_id)
        if conversation is None:
            raise NotFound("Conversation not found")
        return conversation

    @staticmethod
    def append(
        uow: UnitOfWork,
        conversation: Conversation,
        *,
        role: str,
        content: str,
        channel_msg_id: str | None = None,
        task_id: str | None = None,
        **fields,
    ) -> Message:
        conversation.msg_seq += 1
        message = Message(
            id=new_id("msg"),
            conversation_id=conversation.id,
            seq=conversation.msg_seq,
            role=role,
            content=content,
            channel_msg_id=channel_msg_id,
            content_hash=content_hash(content),
            task_id=task_id,
            created_at=utcnow(),
            **fields,
        )
        if role == "user":
            conversation.last_user_seq = message.seq
        conversation.last_message_at = message.created_at
        uow.messages.add(message)
        return message

    async def recent(self, uow: UnitOfWork, conversation_id: str) -> list[Message]:
        return await uow.messages.recent(conversation_id, self.history_messages)
