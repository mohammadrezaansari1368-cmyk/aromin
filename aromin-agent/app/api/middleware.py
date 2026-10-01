"""Request context middleware: request id, structured access log with latency.

Pure ASGI (not BaseHTTPMiddleware) so streaming responses pass through unbuffered.
"""

from __future__ import annotations

import re
import time

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.ids import new_id
from app.core.logging import get_logger

log = get_logger("app.access")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._\-]{8,64}$")


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope.get("headers") or []).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _REQUEST_ID_RE.match(incoming) else new_id("req")
        status = {"code": 500}
        started = time.monotonic()

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
                headers = list(message.get("headers") or [])
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            log.info(
                "http.request",
                method=scope["method"],
                path=scope["path"],
                status=status["code"],
                latency_ms=int((time.monotonic() - started) * 1000),
            )
            structlog.contextvars.clear_contextvars()
