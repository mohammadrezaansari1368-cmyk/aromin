"""RFC 9457 problem+json responses. Internal errors never expose stack traces, SQL,
provider payloads or secrets; the full exception is logged server-side only.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import AppError, Unauthorized
from app.core.logging import get_logger

log = get_logger(__name__)
PROBLEM_TYPE_BASE = "urn:aromin:problem:"
_HTTP_CODES = {404: "not_found", 405: "method_not_allowed", 401: "unauthorized", 403: "forbidden"}


def problem(
    request: Request, *, status: int, code: str, title: str, detail: str | None = None, **extra: Any
) -> JSONResponse:
    request_id = structlog.contextvars.get_contextvars().get("request_id")
    body: dict[str, Any] = {
        "type": PROBLEM_TYPE_BASE + code,
        "title": title,
        "status": status,
        "code": code,
        "detail": detail or title,
        "instance": request.url.path,
        "request_id": request_id,
        **extra,
    }
    headers: dict[str, str] = {}
    if status == 401:
        headers["WWW-Authenticate"] = "Bearer"
    if "retry_after" in extra and extra["retry_after"] is not None:
        headers["Retry-After"] = str(max(1, int(extra["retry_after"])))
    return JSONResponse(body, status_code=status, media_type="application/problem+json", headers=headers)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        level = log.error if exc.status >= 500 else log.info
        level("request.error", status=exc.status, error_type=exc.code)
        # only whitelisted, non-sensitive extras reach the client
        extra = {k: exc.extra[k] for k in ("task_id", "retry_after") if exc.extra.get(k) is not None}
        return problem(request, status=exc.status, code=exc.code, title=exc.title, detail=exc.detail, **extra)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Input values are deliberately not echoed back (they may contain secrets or PII).
        errors = [
            {"loc": [str(p) for p in e.get("loc", ())], "msg": e.get("msg", ""), "type": e.get("type", "")}
            for e in exc.errors()
        ]
        log.info("request.error", status=422, error_type="validation_error")
        return problem(request, status=422, code="validation_error", title="Request validation failed", errors=errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "http_error")
        if exc.status_code == 401:
            return problem(request, status=401, code="unauthorized", title=Unauthorized.title)
        return problem(request, status=exc.status_code, code=code, title=str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.error("request.unhandled_error", status=500, error_type=type(exc).__name__, exc_info=exc)
        return problem(request, status=500, code="internal_error", title="Internal error")
