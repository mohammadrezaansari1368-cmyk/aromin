"""Central Tool Registry (blueprint §6).

The registry is the catalog: registration validates every spec (name, schemas, risk,
idempotency, reserved fields), ``definitions()`` produces what the model is told, and
``validate_arguments()`` is the single argument gate used by the executor.

``execute()`` is a low-level helper (validation + permissions + timeout) kept for direct,
trusted callers. The agent runtime never uses it: model-requested calls always go through
``ToolExecutor`` (policy, approval, idempotency, persistence, audit).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from pydantic import BaseModel, ValidationError

from app.core.errors import AppError, Forbidden
from app.providers.base import ToolDefinition
from app.tools.errors import ToolValidationError
from app.tools.spec import ToolContext, ToolSpec


class ToolError(AppError):
    code, status, title = "tool_error", 400, "Tool call failed"


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        if spec.name in self._tools:
            raise ValueError(f"tool '{spec.name}' is already registered")
        self._tools[spec.name] = spec

    def get(self, name: str) -> ToolSpec:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise ToolError(f"unknown tool '{name}'") from exc

    def find(self, name: str) -> ToolSpec | None:
        return self._tools.get(name)

    def allowed(self, names: frozenset[str] | set[str]) -> list[ToolSpec]:
        return [self._tools[n] for n in sorted(names) if n in self._tools]

    def definitions(self, names: frozenset[str] | set[str]) -> list[ToolDefinition]:
        return [
            ToolDefinition(name=s.name, description=s.description, parameters=s.input_schema)
            for s in self.allowed(names)
        ]

    def __len__(self) -> int:
        return len(self._tools)

    @staticmethod
    def validate_arguments(spec: ToolSpec, raw: dict[str, Any] | str) -> BaseModel:
        """Reject non-objects, unknown keys and type mismatches (strict JSON validation)."""
        if isinstance(raw, str):
            try:
                raw = json.loads(raw or "{}")
            except json.JSONDecodeError as exc:
                raise ToolValidationError("arguments are not valid JSON", code="invalid_json") from exc
        if not isinstance(raw, dict):
            raise ToolValidationError("arguments must be a JSON object", code="not_an_object")
        unknown = set(raw) - set(spec.input_model.model_fields)
        if unknown:
            raise ToolValidationError(f"unknown arguments: {sorted(unknown)}", code="unknown_arguments")
        try:
            return spec.input_model.model_validate_json(json.dumps(raw), strict=True)
        except ValidationError as exc:
            fields = sorted({".".join(str(p) for p in e["loc"]) or "<root>" for e in exc.errors()})
            raise ToolValidationError(f"invalid arguments: {fields}", code="schema_mismatch") from exc

    async def execute(self, name: str, raw_args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        spec = self.get(name)
        missing = spec.permissions_required - ctx.permissions
        if missing:
            raise Forbidden(f"missing permission for tool '{name}'")
        try:
            args = self.validate_arguments(spec, raw_args)
        except ToolValidationError as exc:
            raise ToolError(f"invalid arguments for tool '{name}'") from exc
        try:
            async with asyncio.timeout(spec.timeout_s):
                result = await spec.handler(ctx, args)
        except TimeoutError as exc:
            raise ToolError(f"tool '{name}' timed out") from exc
        output = spec.output_model.model_validate(result.model_dump() if hasattr(result, "model_dump") else result)
        return output.model_dump(mode="json")
