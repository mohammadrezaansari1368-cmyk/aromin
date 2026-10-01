"""Tool specification (blueprint §6, effect classes from Task Engine reference §9.19).

The model never touches the database: it may only *request* a registered tool, and the
executor validates input and output, injects scope parameters server-side and checks
permissions. Handlers use repository functions with fixed queries, never SQL text.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Risk = Literal["read", "write", "external_comm", "financial", "destructive"]
Effect = Literal["pure", "internal_write", "external_idempotent", "external_unsafe"]


class ToolContext(BaseModel):
    """Server-side scope injected into every call. The model cannot set these."""

    model_config = ConfigDict(frozen=True)

    actor_id: str
    permissions: frozenset[str]
    conversation_id: str | None = None
    customer_id: str | None = None
    task_id: str | None = None


ToolHandler = Callable[[ToolContext, BaseModel], Awaitable[BaseModel]]


class ToolSpec(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, frozen=True)

    name: str = Field(pattern=r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")
    description: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    permissions: frozenset[str] = frozenset()
    risk: Risk = "read"
    effect: Effect = "pure"
    timeout_s: float = 10.0
    cancellable: bool = True
    handler: ToolHandler

    def schema_for_model(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "parameters": self.input_model.model_json_schema()}
