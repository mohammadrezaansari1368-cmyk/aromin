"""Event System — Phase 1: write domain events to the transactional outbox.

Events are added to the caller's unit of work, so they commit atomically with the change
that caused them. Delivery (internal handlers, HMAC-signed webhooks) is a later phase.
"""

from __future__ import annotations

from typing import Any

from app.core.ids import new_id
from app.core.logging import get_logger
from app.db.uow import UnitOfWork
from app.events.types import EventType
from app.models.base import utcnow
from app.models.event import OutboxEvent

log = get_logger(__name__)


class EventRecorder:
    def record(
        self,
        uow: UnitOfWork,
        event_type: EventType,
        *,
        subject: dict[str, Any],
        data: dict[str, Any] | None = None,
        version: int = 1,
    ) -> OutboxEvent:
        event = OutboxEvent(
            id=new_id("evt"),
            type=event_type.value,
            version=version,
            subject=subject,
            data=data or {},
            occurred_at=utcnow(),
        )
        uow.events.add(event)
        log.info("event.recorded", event_id=event.id, event_type=event.type)
        return event
