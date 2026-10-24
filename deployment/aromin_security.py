"""Public errors carry correlation IDs; diagnostic logs never serialize values."""
import hmac
import logging
import secrets
import traceback
from starlette.exceptions import HTTPException

logger = logging.getLogger("aromin.security")


class PublicError(Exception):
    """An intentionally user-facing application message."""


class PublicValidationError(PublicError, ValueError):
    pass


class PublicPermissionError(PublicError, PermissionError):
    pass


def public_error(exc, request=None):
    if isinstance(exc, HTTPException):
        return exc.detail
    if isinstance(exc, PublicError):
        return str(exc)
    error_id = secrets.token_urlsafe(16)
    # Frame locations help operators diagnose failures without exception messages,
    # source lines, local variables, URLs, or request payloads containing credentials.
    frames = [(f.name, f.lineno) for f in traceback.extract_tb(exc.__traceback__)]
    method = request.method if request is not None else None
    path = request.url.path if request is not None else None
    logger.error("error_id=%s frames=%s method=%s path=%s",
                 error_id, frames, method, path)
    return "خطای پردازش درخواست؛ شناسه خطا: " + error_id


def secret_matches(provided, expected):
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
