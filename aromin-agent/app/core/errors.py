"""Application error hierarchy. API handlers turn these into RFC 9457 problem+json.

Each error has a stable machine ``code`` and an HTTP ``status``. Messages are written
for clients: they never contain stack traces, SQL, secrets or provider payloads.
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    code = "internal_error"
    status = 500
    title = "Internal error"

    def __init__(self, detail: str | None = None, *, extra: dict[str, Any] | None = None) -> None:
        self.detail = detail or self.title
        self.extra = extra or {}
        super().__init__(self.detail)


class ValidationFailed(AppError):
    code, status, title = "validation_error", 422, "Request validation failed"


class Unauthorized(AppError):
    code, status, title = "unauthorized", 401, "Authentication required"


class Forbidden(AppError):
    code, status, title = "forbidden", 403, "Permission denied"


class NotFound(AppError):
    code, status, title = "not_found", 404, "Resource not found"


class Conflict(AppError):
    code, status, title = "conflict", 409, "Conflict"


class ConversationBusy(Conflict):
    code, title = "conversation_busy", "Another turn is in progress for this conversation"


class IdempotencyConflict(Conflict):
    code, title = "idempotency_conflict", "This client_msg_id was already used with different content"


class PreviousAttemptFailed(Conflict):
    code, title = "previous_attempt_failed", "The earlier attempt with this client_msg_id failed"


class RateLimited(AppError):
    code, status, title = "rate_limited", 429, "Too many requests"


class AgentError(AppError):
    code, status, title = "agent_error", 500, "The agent could not complete the turn"


class DependencyUnavailable(AppError):
    code, status, title = "dependency_unavailable", 503, "A required dependency is unavailable"
