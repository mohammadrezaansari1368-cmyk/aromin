"""Prefixed ULID identifiers (blueprint §16: ``conv_``, ``msg_``, ``task_``, ``evt_`` …)."""

from __future__ import annotations

import os
import re
import time

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_ULID_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")


def ulid() -> str:
    """Return a 26-char ULID: 48-bit millisecond timestamp + 80 random bits."""
    value = (int(time.time() * 1000) << 80) | int.from_bytes(os.urandom(10), "big")
    out = []
    for _ in range(26):
        out.append(_CROCKFORD[value & 0x1F])
        value >>= 5
    return "".join(reversed(out))


def new_id(prefix: str) -> str:
    return f"{prefix}_{ulid()}"


def is_valid_id(value: str, prefix: str) -> bool:
    head, sep, tail = value.partition("_")
    return bool(sep) and head == prefix and bool(_ULID_RE.match(tail))


def id_pattern(prefix: str) -> str:
    return rf"^{prefix}_[0-9A-HJKMNP-TV-Z]{{26}}$"
