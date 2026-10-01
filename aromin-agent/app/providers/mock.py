"""Deterministic mock provider for development and tests (blueprint §19 ``FakeLLMProvider``).

It never calls the network. Replies are clearly marked as mock output. Failure modes can be
injected to exercise error handling.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from pydantic import BaseModel

from app.providers.base import ChatDelta, ChatRequest, ChatResponse, LLMProvider, ProviderCaps, Usage
from app.providers.errors import ProviderError

MOCK_PREFIX = "[mock] "


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 3) if text else 0


class MockReply(BaseModel):
    content: str
    tool_calls: list[dict[str, Any]] = []
    reasoning: str | None = None  # simulates a provider reasoning field; never surfaced


class MockProvider(LLMProvider):
    name = "mock"
    capabilities = ProviderCaps(streaming=True, json_mode=True, tool_calling=False)

    def __init__(
        self,
        script: list[MockReply | str] | None = None,
        *,
        fail_with: ProviderError | None = None,
        delay_s: float = 0.0,
        chunk_size: int = 8,
    ) -> None:
        self._script = [MockReply(content=s) if isinstance(s, str) else s for s in (script or [])]
        self.fail_with = fail_with
        self.delay_s = delay_s
        self.chunk_size = chunk_size
        self.requests: list[ChatRequest] = []

    def _next_reply(self, request: ChatRequest) -> MockReply:
        if self._script:
            return self._script.pop(0)
        if request.response_format is not None:
            return MockReply(content=json.dumps(_placeholder(request.response_format.json_schema)))
        last_user = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        return MockReply(content=f"{MOCK_PREFIX}پیام شما دریافت شد ({len(last_user)} نویسه).")

    async def _prepare(self, request: ChatRequest) -> MockReply:
        self.requests.append(request)
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if self.fail_with is not None:
            raise self.fail_with
        return self._next_reply(request)

    async def _generate(self, request: ChatRequest) -> ChatResponse:
        reply = await self._prepare(request)
        prompt = "".join(m.content for m in request.messages)
        return ChatResponse(
            content=reply.content,
            model=request.model,
            provider=self.name,
            usage=Usage(input_tokens=_estimate_tokens(prompt), output_tokens=_estimate_tokens(reply.content)),
            tool_calls=reply.tool_calls,
        )

    async def _stream(self, request: ChatRequest) -> AsyncIterator[ChatDelta]:
        reply = await self._prepare(request)
        text = reply.content
        for i in range(0, len(text), self.chunk_size):
            yield ChatDelta(text=text[i : i + self.chunk_size])
            await asyncio.sleep(0)
        prompt = "".join(m.content for m in request.messages)
        yield ChatDelta(
            done=True,
            finish_reason="tool_calls" if reply.tool_calls else "stop",
            model=request.model,
            usage=Usage(input_tokens=_estimate_tokens(prompt), output_tokens=_estimate_tokens(text)),
        )


def _placeholder(schema: dict[str, Any], defs: dict[str, Any] | None = None) -> Any:
    """Build a minimal value that satisfies a simple JSON schema (mock structured output)."""
    defs = defs if defs is not None else schema.get("$defs", {})
    if "$ref" in schema:
        return _placeholder(defs[schema["$ref"].split("/")[-1]], defs)
    if "enum" in schema:
        return schema["enum"][0]
    if "default" in schema:
        return schema["default"]
    if "anyOf" in schema:
        return _placeholder(schema["anyOf"][0], defs)
    kind = schema.get("type")
    if kind == "object":
        props = schema.get("properties", {})
        return {k: _placeholder(v, defs) for k, v in props.items()}
    if kind == "array":
        return []
    return {"string": "mock", "integer": 0, "number": 0, "boolean": False, "null": None}.get(kind, None)
