"""Collect a runtime event stream into one JSON result (shared by /v1/chat and approvals).

A streaming transport (SSE/WebSocket) would forward the same events instead.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from app.agent.events import (
    MessageDelta,
    RuntimeEvent,
    ToolCompleted,
    ToolStarted,
    TurnAwaitingApproval,
    TurnCompleted,
    TurnFailed,
    TurnStarted,
)
from app.api.schemas import ToolCallOut
from app.core import errors as core_errors
from app.core.errors import AppError
from app.providers import errors as perr

FAILURES: dict[str, type[AppError]] = {
    cls.code: cls
    for cls in (
        perr.ProviderTimeoutError, perr.ProviderRateLimitError, perr.ProviderUnavailableError,
        perr.ProviderBadRequestError, perr.ProviderResponseError, perr.ProviderConfigurationError,
        perr.ProviderError, core_errors.AgentError, core_errors.AgentLimitExceeded, core_errors.TaskCancelledError,
    )
}  # fmt: skip


@dataclass
class TurnResult:
    started: TurnStarted | None = None
    completed: TurnCompleted | None = None
    waiting: TurnAwaitingApproval | None = None
    failed: TurnFailed | None = None
    tool_calls: list[ToolCallOut] = field(default_factory=list)

    def raise_if_failed(self) -> None:
        if self.failed is not None:
            raise FAILURES.get(self.failed.code, AppError)(extra={"task_id": self.failed.task_id})


async def collect(events: AsyncIterator[RuntimeEvent]) -> TurnResult:
    result = TurnResult()
    async for event in events:
        match event:
            case TurnStarted():
                result.started = event
            case MessageDelta() | ToolStarted():
                pass  # streaming transports forward these
            case ToolCompleted():
                result.tool_calls.append(
                    ToolCallOut(
                        tool=event.tool, step_no=event.step_no, status=event.status, error_type=event.error_type
                    )
                )
            case TurnAwaitingApproval():
                result.waiting = event
            case TurnCompleted():
                result.completed = event
            case TurnFailed():
                result.failed = event
    return result
