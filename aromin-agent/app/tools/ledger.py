"""External Effect Ledger (Task Engine reference §9.7).

A tool *execution* is "we ran a tool"; a *side effect* is "something left our system"
(an SMS, a webhook, a CRM write). External calls go through ``EffectLedger.perform`` so
that, keyed by the step's stable idempotency key:

- a repeated request never performs the effect twice: a succeeded/failed record returns the
  stored outcome;
- a ``pending`` record found on a later attempt means the earlier attempt may have sent the
  request; the ledger never blindly re-sends: it reconciles through the adapter (dedupe or
  lookup) or marks the effect ``unknown`` for a human to resolve;
- a pre-send failure (nothing left our system) clears the pending record so a retry is clean.

Phase 2 ships the ledger and its protocol; no real external tool exists yet.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.db.uow import UowFactory
from app.models.base import utcnow
from app.models.tooling import SideEffectRecord
from app.tools.errors import ToolFailure


class EffectOutcomeUnknown(ToolFailure):
    """The request may have left our system and the outcome cannot be determined."""

    def __init__(self, message: str = "external effect outcome unknown") -> None:
        super().__init__(message, code="outcome_unknown")


class PreSendFailure(Exception):
    """Raised by an effect callable when the request provably never left (DNS, connect)."""


@dataclass(frozen=True)
class EffectResult:
    status: str  # succeeded | failed
    response: dict[str, Any]
    provider_ref: str | None
    replayed: bool


def request_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


Reconciler = Callable[[str], Awaitable[dict[str, Any] | None]]


class EffectLedger:
    def __init__(self, uow_factory: UowFactory) -> None:
        self._uow_factory = uow_factory

    async def perform(
        self,
        *,
        key: str,
        kind: str,
        payload: dict[str, Any],
        call: Callable[[str], Awaitable[dict[str, Any]]],
        reconcile: Reconciler | None = None,
        task_id: str | None = None,
        step_no: int | None = None,
        execution_id: str | None = None,
    ) -> EffectResult:
        rhash = request_hash(payload)
        async with self._uow_factory() as uow:
            record = await uow.side_effects.get_for_update(key)
            if record is None:
                uow.side_effects.add(
                    SideEffectRecord(
                        idempotency_key=key, task_id=task_id, step_no=step_no, execution_id=execution_id,
                        kind=kind, request_hash=rhash, status="pending", created_at=utcnow(), updated_at=utcnow(),
                    )
                )  # fmt: skip
                fresh = True
            else:
                fresh = False
                if record.request_hash != rhash:
                    raise ToolFailure("idempotency key reused with a different request", code="idempotency_conflict")
                if record.status in ("succeeded", "failed"):
                    return EffectResult(record.status, record.response or {}, record.provider_ref, replayed=True)
                if record.status == "unknown":
                    raise EffectOutcomeUnknown()

        if not fresh:  # pending from an earlier attempt: never blind re-send
            found = await reconcile(key) if reconcile else None
            if found is None:
                await self._mark(key, "unknown", None, None)
                raise EffectOutcomeUnknown()
            await self._mark(key, "succeeded", found, found.get("provider_ref"))
            return EffectResult("succeeded", found, found.get("provider_ref"), replayed=True)

        try:
            response = await call(key)
        except PreSendFailure as exc:
            async with self._uow_factory() as uow:  # nothing left: drop pending so a retry starts clean
                record = await uow.side_effects.get_for_update(key)
                if record is not None and record.status == "pending":
                    await uow.session.delete(record)
            raise ToolFailure("external call failed before sending", code="pre_send_failure") from exc
        except ToolFailure as exc:
            if exc.error_type.value == "business_error":  # definite rejection by the provider
                await self._mark(key, "failed", {"error": exc.code}, None)
            else:
                await self._mark(key, "unknown", None, None)
                raise EffectOutcomeUnknown() from exc
            raise
        except Exception as exc:
            await self._mark(key, "unknown", None, None)
            raise EffectOutcomeUnknown() from exc
        await self._mark(key, "succeeded", response, response.get("provider_ref"))
        return EffectResult("succeeded", response, response.get("provider_ref"), replayed=False)

    async def _mark(self, key: str, status: str, response: dict[str, Any] | None, ref: str | None) -> None:
        async with self._uow_factory() as uow:
            record = await uow.side_effects.get_for_update(key)
            if record is not None:
                record.status = status
                record.response = response
                record.provider_ref = ref
                record.updated_at = utcnow()
