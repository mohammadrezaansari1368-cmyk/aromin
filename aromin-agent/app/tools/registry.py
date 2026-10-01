"""Central Tool Registry and a validating executor (blueprint §6).

Phase 1 ships the registry with no business tools registered. The policy engine,
approvals, audit of every call and scope binding for real tools arrive in Phase 2.
"""

from __future__ import annotations

import asyncio
from typing import Any

from pydantic import ValidationError

from app.core.errors import AppError, Forbidden
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

    def allowed(self, names: frozenset[str] | set[str]) -> list[ToolSpec]:
        return [self._tools[n] for n in sorted(names) if n in self._tools]

    def __len__(self) -> int:
        return len(self._tools)

    async def execute(self, name: str, raw_args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        spec = self.get(name)
        missing = spec.permissions - ctx.permissions
        if missing:
            raise Forbidden(f"missing permission for tool '{name}'")
        try:
            args = spec.input_model.model_validate(raw_args)
        except ValidationError as exc:
            raise ToolError(f"invalid arguments for tool '{name}'") from exc
        try:
            async with asyncio.timeout(spec.timeout_s):
                result = await spec.handler(ctx, args)
        except TimeoutError as exc:
            raise ToolError(f"tool '{name}' timed out") from exc
        output = spec.output_model.model_validate(result.model_dump() if hasattr(result, "model_dump") else result)
        return output.model_dump(mode="json")
