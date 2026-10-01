"""Tool specification (blueprint §6; effect classes from Task Engine reference §9.19).

A tool is data plus a handler: metadata describing what it does, how risky it is, who may
call it and how it behaves on retry. The model only ever supplies a tool *name* and
*arguments*; everything that identifies people, conversations, permissions or approvals is
injected server-side through ``ToolContext`` and can never appear in a tool's input schema.
Handlers receive a read-only data facade, never a database session, so tools cannot run SQL.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


class RiskLevel(StrEnum):
    LOW = "LOW"  # read-only information, search, calculation
    MEDIUM = "MEDIUM"  # internal records: create lead, schedule follow-up
    HIGH = "HIGH"  # send SMS, modify customer data, create quote, assign salesperson
    CRITICAL = "CRITICAL"  # financial, destructive or irreversible external actions


class SideEffect(StrEnum):
    none = "none"  # pure: safe to re-run
    internal_write = "internal_write"  # writes our own database
    external_idempotent = "external_idempotent"  # external call; provider dedupes on our key
    external_unsafe = "external_unsafe"  # external call without provider dedupe: at most once


class IdempotencyPolicy(StrEnum):
    none = "none"  # re-executed on every request (only for side_effect=none)
    key = "key"  # one successful execution per idempotency key; repeats return the stored result
    ledger = "ledger"  # key + external effect ledger (reference §9.7)


class RetryPolicy(BaseModel):
    model_config = ConfigDict(frozen=True)

    max_attempts: int = Field(default=1, ge=1, le=5)
    backoff_s: float = Field(default=0.2, ge=0, le=10)


# Names a model must never control (spec: identity, ownership, authority, audit).
RESERVED_ARGUMENT_NAMES = frozenset(
    {
        "customer_id", "conversation_id", "tenant_id", "user_id", "salesperson_id", "actor_id", "actor",
        "permission", "permissions", "role", "roles", "approval", "approval_id", "approval_status",
        "approved", "approved_by", "audit_id", "audit_actor", "task_id", "execution_id", "lead_id",
        "api_key_id", "principal", "principal_id",
    }
)  # fmt: skip
_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,63}(\.[a-z][a-z0-9_]{1,63})*$")


class ToolContext(BaseModel):
    """Server-side scope injected into every call. Built by the runtime from the
    authenticated principal and the task/conversation rows; the model cannot set it."""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    actor_id: str
    permissions: frozenset[str]
    actor_type: str = "api_key"
    conversation_id: str | None = None
    customer_id: str | None = None
    task_id: str | None = None
    step_no: int | None = None
    idempotency_key: str | None = None
    data: Any = None  # ToolDataAccess (read-only facade)
    effects: Any = None  # EffectLedger, only for external side effects


ToolHandler = Callable[[ToolContext, Any], Awaitable[BaseModel]]


class ToolSpec(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, frozen=True, populate_by_name=True)

    name: str
    description: str
    version: str = "1"
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    risk_level: RiskLevel = RiskLevel.LOW
    permissions_required: frozenset[str] = Field(
        default=frozenset(), validation_alias=AliasChoices("permissions_required", "permissions")
    )
    approval_required: bool = False
    timeout_s: float = Field(default=10.0, gt=0, le=300)
    retry_policy: RetryPolicy = RetryPolicy()
    idempotency_policy: IdempotencyPolicy = IdempotencyPolicy.none
    side_effect: SideEffect = SideEffect.none
    requires_conversation: bool = False
    handler: ToolHandler

    @model_validator(mode="after")
    def _consistent(self) -> ToolSpec:
        if not _NAME_RE.match(self.name):
            raise ValueError(f"invalid tool name '{self.name}'")
        if self.side_effect != SideEffect.none and self.idempotency_policy == IdempotencyPolicy.none:
            raise ValueError(f"side-effecting tool '{self.name}' must declare an idempotency policy")
        if (
            self.side_effect in (SideEffect.external_idempotent, SideEffect.external_unsafe)
            and self.idempotency_policy != IdempotencyPolicy.ledger
        ):
            raise ValueError(f"external tool '{self.name}' must use the effect ledger")
        if self.side_effect == SideEffect.external_unsafe and self.retry_policy.max_attempts > 1:
            raise ValueError(f"'{self.name}': a non-idempotent external effect is never retried")
        reserved = RESERVED_ARGUMENT_NAMES & set(self.input_model.model_fields)
        if reserved:
            raise ValueError(f"tool '{self.name}' input declares server-controlled fields: {sorted(reserved)}")
        return self

    # aliases kept for Phase 1 callers
    @property
    def permissions(self) -> frozenset[str]:
        return self.permissions_required

    @property
    def risk(self) -> RiskLevel:
        return self.risk_level

    @property
    def input_schema(self) -> dict[str, Any]:
        schema = self.input_model.model_json_schema()
        schema["additionalProperties"] = False
        return schema

    @property
    def output_schema(self) -> dict[str, Any]:
        return self.output_model.model_json_schema()

    @property
    def sensitive_fields(self) -> frozenset[str]:
        return frozenset(
            name
            for name, field in self.input_model.model_fields.items()
            if isinstance(field.json_schema_extra, dict) and field.json_schema_extra.get("sensitive")
        )

    def schema_for_model(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "parameters": self.input_schema}


def sensitive(description: str = "") -> Any:
    """Mark an input field as sensitive: it is redacted from execution records and logs."""
    return Field(description=description, json_schema_extra={"sensitive": True})
