"""Read-only data facade handed to tool handlers.

Every method is scoped by the server-side ``ToolContext`` (conversation/task from the
authenticated turn). A tool cannot pass its own identifiers, cannot write, and never sees a
database session, so it cannot run SQL.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.db.uow import UowFactory


@dataclass(frozen=True)
class ConversationView:
    id: str
    channel: str
    status: str
    created_at: datetime
    last_message_at: datetime | None
    message_count: int


@dataclass(frozen=True)
class MessageView:
    seq: int
    role: str
    content: str
    created_at: datetime


@dataclass(frozen=True)
class TaskView:
    id: str
    kind: str
    status: str
    created_at: datetime
    step_count: int


class ToolDataAccess:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def conversation(self, conversation_id: str) -> ConversationView | None:
        async with self._uow_factory() as uow:
            c = await uow.conversations.get(conversation_id)
            if c is None:
                return None
            return ConversationView(c.id, c.channel, c.status, c.created_at, c.last_message_at, c.msg_seq)

    async def messages(self, conversation_id: str, *, limit: int, before_seq: int | None) -> list[MessageView]:
        async with self._uow_factory() as uow:
            if before_seq is None:
                rows = await uow.messages.recent(conversation_id, limit)
            else:
                rows = await uow.messages.before(conversation_id, before_seq, limit)
            return [MessageView(m.seq, m.role, m.content, m.created_at) for m in rows]

    async def task(self, task_id: str) -> TaskView | None:
        async with self._uow_factory() as uow:
            t = await uow.tasks.get(task_id)
            if t is None:
                return None
            return TaskView(t.id, t.kind, t.status, t.created_at, t.step_count)

    def describe(self) -> dict[str, Any]:  # pragma: no cover - debugging aid
        return {"read_only": True}
