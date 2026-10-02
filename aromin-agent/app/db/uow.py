"""Unit of work: one database transaction with typed repositories.

``async with uow_factory() as uow:`` commits on success and rolls back on any exception.
No DB transaction is held open while the model is called (Task Engine reference §9.6).
"""

from __future__ import annotations

from collections.abc import Callable
from types import TracebackType

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.repositories.audit import AuditRepository
from app.db.repositories.conversations import ConversationRepository, MessageRepository
from app.db.repositories.events import EventRepository
from app.db.repositories.security import ApiKeyRepository
from app.db.repositories.tasks import TaskRepository
from app.db.repositories.tooling import (
    ApprovalRepository,
    ExecutionRepository,
    SideEffectRepository,
    StepRepository,
    UsageRepository,
)


class UnitOfWork:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self.session: AsyncSession

    async def __aenter__(self) -> UnitOfWork:
        self.session = self._session_factory()
        await self.session.begin()
        self.conversations = ConversationRepository(self.session)
        self.messages = MessageRepository(self.session)
        self.tasks = TaskRepository(self.session)
        self.events = EventRepository(self.session)
        self.api_keys = ApiKeyRepository(self.session)
        self.audit = AuditRepository(self.session)
        self.steps = StepRepository(self.session)
        self.executions = ExecutionRepository(self.session)
        self.approvals = ApprovalRepository(self.session)
        self.side_effects = SideEffectRepository(self.session)
        self.usage = UsageRepository(self.session)
        return self

    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None:
        try:
            if exc_type is None:
                await self.session.commit()
            else:
                await self.session.rollback()
        finally:
            await self.session.close()


UowFactory = Callable[[], UnitOfWork]


def make_uow_factory(session_factory: async_sessionmaker[AsyncSession]) -> UowFactory:
    return lambda: UnitOfWork(session_factory)
