"""Engine and session factory. All database access goes through repositories with
fixed ORM queries (blueprint §6: the agent never runs SQL text).
"""

from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings


def create_engine(settings: Settings) -> AsyncEngine:
    url = settings.database_url.get_secret_value()
    kwargs: dict = {"echo": settings.database_echo, "pool_pre_ping": True}
    if not url.startswith("sqlite"):
        kwargs["pool_size"] = settings.database_pool_size
    engine = create_async_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(engine.sync_engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record) -> None:  # pragma: no cover - driver hook
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=5000")
            cur.close()

    return engine


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
