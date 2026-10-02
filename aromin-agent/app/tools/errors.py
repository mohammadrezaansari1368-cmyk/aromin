"""Tool failure classification and the behaviour attached to each class.

| error_type          | executed? | retried?                                   | model sees            |
|---------------------|-----------|--------------------------------------------|-----------------------|
| validation_error    | no        | no                                         | error, may correct    |
| authorization_error | no        | no                                         | "not permitted"       |
| policy_denied       | no        | no                                         | "denied by policy"    |
| approval_required   | paused    | no; resumes after a human decision         | (turn waits)          |
| timeout             | yes       | only if the tool is pure (side_effect=none)| error                 |
| provider_error      | yes       | only if pure or protected by idempotency   | error                 |
| network_error       | yes       | only if pure or protected by idempotency   | error                 |
| business_error      | yes       | no                                         | error message         |
| unknown_error       | yes       | no                                         | generic error         |

A non-idempotent external side effect is never retried silently (spec rule, reference §9.8).
"""

from __future__ import annotations

from enum import StrEnum


class ToolErrorType(StrEnum):
    validation_error = "validation_error"
    authorization_error = "authorization_error"
    policy_denied = "policy_denied"
    approval_required = "approval_required"
    timeout = "timeout"
    provider_error = "provider_error"
    network_error = "network_error"
    business_error = "business_error"
    unknown_error = "unknown_error"


RETRYABLE_TYPES = frozenset({ToolErrorType.timeout, ToolErrorType.provider_error, ToolErrorType.network_error})


class ToolFailure(Exception):
    """Raised by handlers (or the executor) with a classified error type.

    ``message`` must be safe to show the model: no secrets, SQL or stack traces.
    """

    error_type = ToolErrorType.unknown_error

    def __init__(self, message: str = "tool failed", *, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.code = code or self.error_type.value


class ToolValidationError(ToolFailure):
    error_type = ToolErrorType.validation_error


class ToolBusinessError(ToolFailure):
    error_type = ToolErrorType.business_error


class ToolProviderError(ToolFailure):
    error_type = ToolErrorType.provider_error


class ToolNetworkError(ToolFailure):
    error_type = ToolErrorType.network_error


class ToolTimeoutError(ToolFailure):
    error_type = ToolErrorType.timeout
