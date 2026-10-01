from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import OutboxEvent


class EventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, event: OutboxEvent) -> None:
        self._s.add(event)

    async def pending(self, limit: int = 100) -> list[OutboxEvent]:
        stmt = (
            select(OutboxEvent)
            .where(OutboxEvent.dispatched_at.is_(None))
            .order_by(OutboxEvent.occurred_at, OutboxEvent.id)
            .limit(limit)
        )
        return list((await self._s.execute(stmt)).scalars())
