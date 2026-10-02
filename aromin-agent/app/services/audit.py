"""Audit logging foundation (blueprint §14: append-only ``audit_log``, PII redacted)."""

from __future__ import annotations

from typing import Any

from app.core.ids import new_id
from app.core.logging import redact_mapping
from app.db.uow import UnitOfWork
from app.models.base import utcnow
from app.models.security import AuditLog


class AuditLogger:
    def record(
        self,
        uow: UnitOfWork,
        *,
        actor_type: str,
        actor_id: str | None,
        action: str,
        target: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            id=new_id("aud"),
            actor_type=actor_type,
            actor_id=actor_id,
            action=action,
            target=target,
            details=redact_mapping(details or {}),
            created_at=utcnow(),
        )
        uow.audit.add(entry)
        return entry
