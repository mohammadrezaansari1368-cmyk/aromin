"""Provider-independent LLM interface (blueprint §15 ``LLMProvider``).

Capabilities: non-streaming generation, streaming generation, structured output,
explicit model selection, per-call timeout, usage metadata and normalized errors.
Provider "reasoning" fields are never part of these types, so they cannot be persisted.
"""

from __future__ import annotations

import asyncio
import json
import time
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, ValidationError

from app.providers.errors import ProviderResponseError, ProviderTimeoutError

Role = Literal["system", "user", "assistant"]
T = TypeVar("T", bound=BaseModel)


class ChatMessage(BaseModel):
    role: Role
    content: str


class ResponseFormat(BaseModel):
    """Request structured JSON output matching ``json_schema``."""

    name: str
    json_schema: dict[str, Any]


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    max_output_tokens: int = 1024
    temperature: float | None = None
    response_format: ResponseFormat | None = None
    timeout_s: float = 60.0


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class ChatResponse(BaseModel):
    content: str
    model: str
    provider: str
    finish_reason: str = "stop"
    usage: Usage = Field(default_factory=Usage)
    latency_ms: int = 0
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


class ChatDelta(BaseModel):
    """One streamed chunk. The final chunk has ``done=True`` and carries usage."""

    text: str = ""
    done: bool = False
    finish_reason: str | None = None
    usage: Usage | None = None
    model: str | None = None


class StructuredResult(BaseModel, Generic[T]):
    value: T
    response: ChatResponse


class ProviderCaps(BaseModel):
    streaming: bool = True
    json_mode: bool = True
    tool_calling: bool = False
    prompt_cache: bool = False
    max_context: int | None = None


class LLMProvider(ABC):
    name: str = "abstract"
    capabilities: ProviderCaps = ProviderCaps()

    @abstractmethod
    async def _generate(self, request: ChatRequest) -> ChatResponse: ...

    @abstractmethod
    def _stream(self, request: ChatRequest) -> AsyncIterator[ChatDelta]: ...

    async def generate(self, request: ChatRequest) -> ChatResponse:
        started = time.monotonic()
        try:
            async with asyncio.timeout(request.timeout_s):
                response = await self._generate(request)
        except TimeoutError as exc:
            raise ProviderTimeoutError(provider=self.name) from exc
        if not response.latency_ms:
            response.latency_ms = int((time.monotonic() - started) * 1000)
        return response

    async def stream(self, request: ChatRequest) -> AsyncIterator[ChatDelta]:
        """Yield deltas; the whole stream is bounded by ``request.timeout_s``."""
        deadline = asyncio.get_running_loop().time() + request.timeout_s
        iterator = self._stream(request).__aiter__()
        while True:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise ProviderTimeoutError(provider=self.name)
            try:
                async with asyncio.timeout(remaining):
                    delta = await iterator.__anext__()
            except StopAsyncIteration:
                return
            except TimeoutError as exc:
                raise ProviderTimeoutError(provider=self.name) from exc
            yield delta
            if delta.done:
                return

    async def generate_structured(self, request: ChatRequest, output_model: type[T]) -> StructuredResult[T]:
        req = request.model_copy(
            update={
                "response_format": ResponseFormat(
                    name=output_model.__name__, json_schema=output_model.model_json_schema()
                )
            }
        )
        response = await self.generate(req)
        try:
            value = output_model.model_validate(json.loads(response.content))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise ProviderResponseError("The model did not return valid structured output", provider=self.name) from exc
        return StructuredResult(value=value, response=response)

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        raise NotImplementedError("Embeddings are not part of Phase 1")

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None
