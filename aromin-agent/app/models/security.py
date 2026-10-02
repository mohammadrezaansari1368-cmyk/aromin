"""API keys and the append-only audit log (blueprint §14, §17)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, JSONType, TZDateTime, utcnow


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    key_prefix: Mapped[str] = mapped_column(String(24))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)  # sha256 hex; the key itself is never stored
    roles: Mapped[list[str]] = mapped_column(JSONType, default=list)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    actor_type: Mapped[str] = mapped_column(String(32))
    actor_id: Mapped[str | None] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(80), index=True)
    target: Mapped[str | None] = mapped_column(String(80))
    details: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=utcnow)
