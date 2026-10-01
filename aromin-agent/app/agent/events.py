"""Runtime events: the transport-neutral stream an agent turn produces.

The JSON endpoint collects them into one response; an SSE or WebSocket transport can
later forward them one by one (blueprint §16 SSE event names) without runtime changes.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.providers.base import Usage


class TurnStarted(BaseModel):
    type: Literal["turn.started"] = "turn.started"
    conversation_id: str
    task_id: str
    user_message_id: str
    replayed: bool = False


class MessageDelta(BaseModel):
    type: Literal["message.delta"] = "message.delta"
    text: str


class TurnCompleted(BaseModel):
    type: Literal["message.completed"] = "message.completed"
    conversation_id: str
    task_id: str
    message_id: str
    seq: int
    created_at: datetime
    content: str
    model: str | None = None
    provider: str | None = None
    usage: Usage | None = None
    latency_ms: int | None = None
    replayed: bool = False


class TurnFailed(BaseModel):
    type: Literal["error"] = "error"
    conversation_id: str
    task_id: str
    code: str
    error_class: str
    retryable: bool


RuntimeEvent = TurnStarted | MessageDelta | TurnCompleted | TurnFailed
