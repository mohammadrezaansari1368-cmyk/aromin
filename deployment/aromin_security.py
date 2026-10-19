"""Public errors carry correlation IDs; diagnostic logs never serialize values."""
import hmac
import logging
import secrets
import traceback

logger = logging.getLogger("aromin.security")


def public_error(exc, request=None):
    error_id = secrets.token_urlsafe(16)
    # Frame locations help operators diagnose failures without exception messages,
    # source lines, local variables, URLs, or request payloads containing credentials.
    frames = [(f.name, f.lineno) for f in traceback.extract_tb(exc.__traceback__)]
    presence = {}
    if request is not None:
        presence = {name: bool(request.headers.get(name)) for name in
                    ("authorization", "cookie", "x-update-token", "x-telegram-init-data")}
    logger.error("error_id=%s frames=%s sensitive_headers_present=%s",
                 error_id, frames, presence)
    return "خطای پردازش درخواست؛ شناسه خطا: " + error_id


def secret_matches(provided, expected):
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
