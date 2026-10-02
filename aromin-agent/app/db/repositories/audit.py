from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security import AuditLog


class AuditRepository:
    """Append-only: there is deliberately no update or delete method."""

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, entry: AuditLog) -> None:
        self._s.add(entry)

    async def by_action(self, action: str, limit: int = 100) -> list[AuditLog]:
        stmt = select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.created_at.desc()).limit(limit)
        return list((await self._s.execute(stmt)).scalars())
