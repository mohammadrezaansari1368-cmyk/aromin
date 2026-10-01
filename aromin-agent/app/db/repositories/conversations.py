from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation, Message


class ConversationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, conversation: Conversation) -> None:
        self._s.add(conversation)

    async def get(self, conversation_id: str) -> Conversation | None:
        return await self._s.get(Conversation, conversation_id)

    async def get_for_update(self, conversation_id: str) -> Conversation | None:
        """Lock the conversation row: message intake and reply commits are serialized per
        conversation (reference §9.14). SQLite ignores FOR UPDATE; its writes are serialized."""
        stmt = select(Conversation).where(Conversation.id == conversation_id).with_for_update()
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def flush(self) -> None:
        await self._s.flush()


class MessageRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, message: Message) -> None:
        self._s.add(message)

    async def flush(self) -> None:
        await self._s.flush()

    async def by_channel_msg_id(self, conversation_id: str, channel_msg_id: str) -> Message | None:
        stmt = select(Message).where(
            Message.conversation_id == conversation_id, Message.channel_msg_id == channel_msg_id
        )
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def assistant_reply_for_task(self, task_id: str) -> Message | None:
        stmt = (
            select(Message)
            .where(Message.task_id == task_id, Message.role == "assistant")
            .order_by(Message.seq.desc())
            .limit(1)
        )
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def recent(self, conversation_id: str, limit: int) -> list[Message]:
        """Newest ``limit`` messages, returned oldest first."""
        stmt = (
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.seq.desc()).limit(limit)
        )
        rows = list((await self._s.execute(stmt)).scalars())
        rows.reverse()
        return rows

    async def page(self, conversation_id: str, after_seq: int, limit: int) -> list[Message]:
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id, Message.seq > after_seq)
            .order_by(Message.seq)
            .limit(limit)
        )
        return list((await self._s.execute(stmt)).scalars())
