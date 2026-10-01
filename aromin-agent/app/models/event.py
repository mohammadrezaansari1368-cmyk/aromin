"""Transactional outbox (blueprint §10). Rows are written in the same transaction as the
domain change; the dispatcher that delivers them (internal handlers, signed webhooks)
is a later phase, so in Phase 1 rows stay with ``dispatched_at = NULL``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Index, Integer, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONType, TZDateTime, utcnow


class OutboxEvent(Base):
    __tablename__ = "events_outbox"
    __table_args__ = (
        Index(
            "ix_events_outbox_pending",
            "occurred_at",
            postgresql_where=text("dispatched_at IS NULL"),
            sqlite_where=text("dispatched_at IS NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    type: Mapped[str] = mapped_column(String(64), index=True)
    version: Mapped[int] = mapped_column(SmallInteger, default=1)
    subject: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    data: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    dispatched_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
