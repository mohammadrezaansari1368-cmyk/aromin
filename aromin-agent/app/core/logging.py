"""Structured logging (blueprint §15: structlog JSON).

Rules enforced here:
- every line is JSON (or console in development) with contextvars merged in, so
  ``request_id``, ``conversation_id``, ``task_id`` and ``event_id`` appear automatically
  once bound;
- secret-looking keys are redacted before rendering;
- callers log sizes and ids, never message text, prompts or model reasoning.
"""

from __future__ import annotations

import logging
import re
import sys
from collections.abc import Mapping
from typing import IO, Any

import structlog

REDACTED = "[REDACTED]"
_SECRET_KEY_RE = re.compile(
    r"(pass(word)?|secret|token|api[_-]?key|authorization|cookie|dsn|database_url|redis_url|credential)",
    re.I,
)
_BEARER_RE = re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+")
_URL_CREDS_RE = re.compile(r"://([^/:@\s]+):([^/@\s]+)@")


def redact_value(value: Any) -> Any:
    if isinstance(value, str):
        value = _BEARER_RE.sub("Bearer " + REDACTED, value)
        return _URL_CREDS_RE.sub(r"://\1:" + REDACTED + "@", value)
    if isinstance(value, Mapping):
        return redact_mapping(value)
    if isinstance(value, list | tuple):
        return type(value)(redact_value(v) for v in value)
    return value


def redact_mapping(data: Mapping[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(key, str) and _SECRET_KEY_RE.search(key):
            out[key] = REDACTED
        else:
            out[key] = redact_value(value)
    return out


def _redact_processor(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    return redact_mapping(event_dict)


def configure_logging(level: str = "INFO", fmt: str = "json", stream: IO[str] | None = None) -> None:
    stream = stream or sys.stdout
    renderer: Any = (
        structlog.dev.ConsoleRenderer(colors=False) if fmt == "console" else structlog.processors.JSONRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.format_exc_info,
            _redact_processor,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
        logger_factory=structlog.PrintLoggerFactory(file=stream),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str | None = None) -> Any:
    return structlog.get_logger(name) if name else structlog.get_logger()
