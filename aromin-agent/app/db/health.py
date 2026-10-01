"""Readiness probe. This is the only place that issues a literal statement, and it is a
fixed ``SELECT 1`` that takes no input (checked by tests/test_security_guards.py).
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def database_ping(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
