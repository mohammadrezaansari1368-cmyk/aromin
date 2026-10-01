from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security import ApiKey


class ApiKeyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    def add(self, key: ApiKey) -> None:
        self._s.add(key)

    async def by_hash(self, key_hash: str) -> ApiKey | None:
        stmt = select(ApiKey).where(ApiKey.key_hash == key_hash)
        return (await self._s.execute(stmt)).scalar_one_or_none()

    async def get(self, key_id: str) -> ApiKey | None:
        return await self._s.get(ApiKey, key_id)
