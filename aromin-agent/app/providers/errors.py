"""Normalized provider errors. Every adapter maps its native failures to these classes
so the runtime and API never depend on a vendor's error format (blueprint §3, §15).

``retryable`` follows the Task Engine error classes (reference §9.8): timeouts, rate limits
and 5xx are transient; auth failures are ``dependency_unavailable`` (not permanent);
bad requests and malformed responses are permanent.
"""

from __future__ import annotations

from app.core.errors import AppError


class ProviderError(AppError):
    code, status, title = "provider_error", 502, "The model provider returned an error"
    retryable = False
    error_class = "permanent"

    def __init__(
        self,
        detail: str | None = None,
        *,
        provider: str = "unknown",
        status_code: int | None = None,
        retry_after: float | None = None,
        extra: dict | None = None,
    ) -> None:
        super().__init__(detail, extra=extra)
        self.provider = provider
        self.status_code = status_code
        self.retry_after = retry_after


class ProviderTimeoutError(ProviderError):
    code, status, title = "provider_timeout", 504, "The model provider timed out"
    retryable, error_class = True, "transient"


class ProviderRateLimitError(ProviderError):
    code, status, title = "provider_rate_limited", 503, "The model provider is rate limiting requests"
    retryable, error_class = True, "transient"


class ProviderUnavailableError(ProviderError):
    code, status, title = "provider_unavailable", 503, "The model provider is unavailable"
    retryable, error_class = True, "transient"


class ProviderAuthError(ProviderError):
    code, status, title = "provider_unavailable", 503, "The model provider is unavailable"
    retryable, error_class = False, "dependency_unavailable"


class ProviderBadRequestError(ProviderError):
    code, status, title = "provider_bad_request", 502, "The model provider rejected the request"


class ProviderResponseError(ProviderError):
    code, status, title = "provider_invalid_response", 502, "The model provider returned an invalid response"


class ProviderConfigurationError(ProviderError):
    code, status, title = "provider_not_configured", 503, "The model provider is not configured"
