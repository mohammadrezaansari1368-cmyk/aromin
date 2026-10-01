"""Rate limiting abstraction (blueprint §14).

The production implementation is a Redis token bucket shared by all replicas (hardening
phase). Phase 1 ships the interface and an in-process token bucket, which is correct for
a single API process and for tests only.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RateDecision:
    allowed: bool
    retry_after_s: float = 0.0


class RateLimiter(Protocol):
    async def hit(self, key: str, *, capacity: int, per_seconds: float) -> RateDecision: ...


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, tuple[float, float]] = {}
        self._lock = asyncio.Lock()

    async def hit(self, key: str, *, capacity: int, per_seconds: float) -> RateDecision:
        rate = capacity / per_seconds
        async with self._lock:
            now = time.monotonic()
            tokens, updated = self._buckets.get(key, (float(capacity), now))
            tokens = min(float(capacity), tokens + (now - updated) * rate)
            if tokens >= 1.0:
                self._buckets[key] = (tokens - 1.0, now)
                return RateDecision(True)
            self._buckets[key] = (tokens, now)
            return RateDecision(False, retry_after_s=(1.0 - tokens) / rate)
