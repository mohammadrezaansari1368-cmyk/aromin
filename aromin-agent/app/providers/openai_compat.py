"""Generic adapter for providers that expose the widely used OpenAI-style
``POST {base_url}/chat/completions`` API (blueprint §22 ``openai_compat.py``).

It is a generic fallback, not a claim about any specific vendor. Errors are normalized,
provider reasoning fields are dropped, and request/response bodies are never logged.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.providers.base import (
    ChatDelta,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    LLMProvider,
    ProviderCaps,
    ToolCall,
    Usage,
)
from app.providers.errors import (
    ProviderAuthError,
    ProviderBadRequestError,
    ProviderError,
    ProviderRateLimitError,
    ProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)


def _wire_name(name: str) -> str:
    """Function names on this API allow ``[A-Za-z0-9_-]`` only; our tool names may contain dots."""
    return name.replace(".", "__")


def _local_name(name: str) -> str:
    return name.replace("__", ".")


def _wire_message(m: ChatMessage) -> dict[str, Any]:
    if m.role == "tool":
        return {"role": "tool", "tool_call_id": m.tool_call_id, "content": m.content}
    out: dict[str, Any] = {"role": m.role, "content": m.content}
    if m.tool_calls:
        out["tool_calls"] = [
            {
                "id": c.id,
                "type": "function",
                "function": {
                    "name": _wire_name(c.name),
                    "arguments": c.arguments if isinstance(c.arguments, str) else json.dumps(c.arguments),
                },
            }
            for c in m.tool_calls
        ]
    return out


def _parse_tool_calls(raw: list[dict[str, Any]] | None) -> list[ToolCall]:
    calls = []
    for item in raw or []:
        fn = item.get("function") or {}
        calls.append(
            ToolCall(
                id=item.get("id") or "", name=_local_name(fn.get("name", "")), arguments=fn.get("arguments") or "{}"
            )
        )
    return calls


class OpenAICompatibleProvider(LLMProvider):
    name = "openai_compatible"
    capabilities = ProviderCaps(streaming=True, json_mode=True, tool_calling=True)

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        client: httpx.AsyncClient | None = None,
        connect_timeout_s: float = 5.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        self._client = client or httpx.AsyncClient(timeout=httpx.Timeout(None, connect=connect_timeout_s))

    def _payload(self, request: ChatRequest, stream: bool) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": request.model,
            "messages": [_wire_message(m) for m in request.messages],
            "max_tokens": request.max_output_tokens,
            "stream": stream,
        }
        if request.temperature is not None:
            body["temperature"] = request.temperature
        if request.response_format is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": request.response_format.name, "schema": request.response_format.json_schema},
            }
        if request.tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {"name": _wire_name(t.name), "description": t.description, "parameters": t.parameters},
                }
                for t in request.tools
            ]
        if stream:
            body["stream_options"] = {"include_usage": True}
        return body

    def _error_for_status(self, response: httpx.Response) -> ProviderError:
        status = response.status_code
        if status == 429:
            retry_after = response.headers.get("retry-after")
            try:
                ra = float(retry_after) if retry_after else None
            except ValueError:
                ra = None
            return ProviderRateLimitError(provider=self.name, status_code=status, retry_after=ra)
        if status in (401, 403):
            return ProviderAuthError(provider=self.name, status_code=status)
        if status == 408 or status >= 500:
            return ProviderUnavailableError(provider=self.name, status_code=status)
        return ProviderBadRequestError(provider=self.name, status_code=status)

    def _transport_error(self, exc: httpx.HTTPError) -> ProviderError:
        if isinstance(exc, httpx.TimeoutException):
            return ProviderTimeoutError(provider=self.name)
        return ProviderUnavailableError(provider=self.name)

    async def _generate(self, request: ChatRequest) -> ChatResponse:
        try:
            response = await self._client.post(
                f"{self._base_url}/chat/completions", headers=self._headers, json=self._payload(request, False)
            )
        except httpx.HTTPError as exc:
            raise self._transport_error(exc) from exc
        if response.status_code >= 400:
            raise self._error_for_status(response)
        try:
            data = response.json()
            choice = data["choices"][0]
            message = choice["message"]
            content = message.get("content") or ""
            usage = data.get("usage") or {}
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderResponseError(provider=self.name) from exc
        # message.get("reasoning_content") / ("reasoning") are deliberately ignored.
        return ChatResponse(
            content=content,
            model=data.get("model", request.model),
            provider=self.name,
            finish_reason=choice.get("finish_reason") or "stop",
            usage=Usage(
                input_tokens=int(usage.get("prompt_tokens", 0)), output_tokens=int(usage.get("completion_tokens", 0))
            ),
            tool_calls=_parse_tool_calls(message.get("tool_calls")),
        )

    async def _stream(self, request: ChatRequest) -> AsyncIterator[ChatDelta]:
        finish_reason: str | None = None
        usage: Usage | None = None
        model = request.model
        partial_calls: dict[int, dict[str, Any]] = {}
        try:
            async with self._client.stream(
                "POST", f"{self._base_url}/chat/completions", headers=self._headers, json=self._payload(request, True)
            ) as response:
                if response.status_code >= 400:
                    await response.aread()
                    raise self._error_for_status(response)
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError as exc:
                        raise ProviderResponseError(provider=self.name) from exc
                    model = chunk.get("model", model)
                    if chunk.get("usage"):
                        u = chunk["usage"]
                        usage = Usage(
                            input_tokens=int(u.get("prompt_tokens", 0)),
                            output_tokens=int(u.get("completion_tokens", 0)),
                        )
                    for choice in chunk.get("choices") or []:
                        delta = choice.get("delta") or {}
                        text = delta.get("content")
                        if text:
                            yield ChatDelta(text=text)
                        for tc in delta.get("tool_calls") or []:
                            slot = partial_calls.setdefault(int(tc.get("index", 0)), {"id": "", "name": "", "args": ""})
                            slot["id"] = tc.get("id") or slot["id"]
                            fn = tc.get("function") or {}
                            slot["name"] += fn.get("name") or ""
                            slot["args"] += fn.get("arguments") or ""
                        if choice.get("finish_reason"):
                            finish_reason = choice["finish_reason"]
        except httpx.HTTPError as exc:
            raise self._transport_error(exc) from exc
        calls = [
            ToolCall(id=c["id"], name=_local_name(c["name"]), arguments=c["args"] or "{}")
            for _, c in sorted(partial_calls.items())
        ]
        yield ChatDelta(
            done=True, finish_reason=finish_reason or "stop", usage=usage or Usage(), model=model, tool_calls=calls
        )

    async def aclose(self) -> None:
        await self._client.aclose()
