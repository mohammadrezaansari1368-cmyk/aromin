import json

import httpx
import pytest
import respx
from pydantic import BaseModel

from app.core.config import Settings
from app.providers.arvan import ArvanProvider
from app.providers.base import ChatMessage, ChatRequest
from app.providers.errors import (
    ProviderAuthError,
    ProviderBadRequestError,
    ProviderConfigurationError,
    ProviderRateLimitError,
    ProviderResponseError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from app.providers.factory import ModelRouter, build_provider
from app.providers.mock import MockProvider, MockReply
from app.providers.openai_compat import OpenAICompatibleProvider

BASE = "https://llm.example.test/v1"


def req(**kw) -> ChatRequest:
    return ChatRequest(model="m", messages=[ChatMessage(role="user", content="سلام")], timeout_s=2, **kw)


class Lead(BaseModel):
    name: str
    score: int
    qualified: bool


# --- MockProvider -------------------------------------------------------------------


async def test_mock_generate_is_deterministic_and_reports_usage():
    p = MockProvider()
    r = await p.generate(req())
    assert r.content.startswith("[mock] ") and r.provider == "mock" and r.model == "m"
    assert r.usage.input_tokens > 0 and r.usage.output_tokens > 0
    assert (await MockProvider().generate(req())).content == r.content


async def test_mock_stream_chunks_and_final_usage():
    p = MockProvider(["abcdefghijklmnop"], chunk_size=5)
    deltas = [d async for d in p.stream(req())]
    assert [d.text for d in deltas if d.text] == ["abcde", "fghij", "klmno", "p"]
    assert deltas[-1].done and deltas[-1].usage.output_tokens > 0 and deltas[-1].finish_reason == "stop"


async def test_mock_structured_output_scripted_and_placeholder():
    scripted = MockProvider([json.dumps({"name": "کافه", "score": 7, "qualified": True})])
    result = await scripted.generate_structured(req(), Lead)
    assert result.value == Lead(name="کافه", score=7, qualified=True)
    assert scripted.requests[0].response_format.name == "Lead"
    placeholder = await MockProvider().generate_structured(req(), Lead)
    assert placeholder.value == Lead(name="mock", score=0, qualified=False)


async def test_structured_output_validation_failure_is_normalized():
    with pytest.raises(ProviderResponseError):
        await MockProvider(['{"name": "x"}']).generate_structured(req(), Lead)
    with pytest.raises(ProviderResponseError):
        await MockProvider(["not json"]).generate_structured(req(), Lead)


async def test_mock_injected_failure_and_timeout():
    with pytest.raises(ProviderUnavailableError):
        await MockProvider(fail_with=ProviderUnavailableError()).generate(req())
    with pytest.raises(ProviderTimeoutError):
        await MockProvider(delay_s=1).generate(req().model_copy(update={"timeout_s": 0.05}))
    with pytest.raises(ProviderTimeoutError):
        [d async for d in MockProvider(delay_s=1).stream(req().model_copy(update={"timeout_s": 0.05}))]


async def test_mock_reasoning_is_not_exposed():
    r = await MockProvider([MockReply(content="ok", reasoning="hidden")]).generate(req())
    assert "hidden" not in r.model_dump_json()


# --- model selection & factory ------------------------------------------------------


def test_model_router_selects_by_tier():
    router = ModelRouter({"small": "s", "main": "m", "large": "l"})
    assert router.select("main") == "m"
    with pytest.raises(ProviderConfigurationError):
        ModelRouter({}).select("main")


def test_factory_builds_mock_and_requires_credentials_for_real_providers():
    assert isinstance(build_provider(Settings(_env_file=None)), MockProvider)
    with pytest.raises(ProviderConfigurationError):
        build_provider(Settings(_env_file=None, llm_provider="openai_compatible"))
    ok = build_provider(Settings(_env_file=None, llm_provider="openai_compatible", llm_base_url=BASE, llm_api_key="k"))
    assert isinstance(ok, OpenAICompatibleProvider)


def test_arvan_adapter_refuses_to_start_until_verified():
    with pytest.raises(ProviderConfigurationError, match="not verified"):
        build_provider(Settings(_env_file=None, llm_provider="arvan", llm_base_url=BASE, llm_api_key="k"))
    with pytest.raises(ProviderConfigurationError, match="required"):
        ArvanProvider(base_url=None, api_key=None, verified=True)
    assert ArvanProvider(base_url=BASE, api_key="k", verified=True).name == "arvan"


# --- OpenAI-compatible adapter: normalization (network mocked with respx) -----------


def completion(content="hello", **extra):
    return {
        "model": "m-1",
        "choices": [{"message": {"content": content, **extra}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 11, "completion_tokens": 3},
    }


@respx.mock
async def test_openai_compat_generate_success_and_drops_reasoning():
    route = respx.post(f"{BASE}/chat/completions").mock(
        return_value=httpx.Response(200, json=completion(reasoning_content="private chain of thought"))
    )
    p = OpenAICompatibleProvider(base_url=BASE, api_key="test-key")
    r = await p.generate(req())
    assert r.content == "hello" and r.model == "m-1" and r.usage.input_tokens == 11 and r.usage.output_tokens == 3
    assert "private chain" not in r.model_dump_json()
    sent = route.calls[0].request
    assert sent.headers["authorization"] == "Bearer test-key"
    assert json.loads(sent.content)["stream"] is False
    await p.aclose()


@respx.mock
async def test_openai_compat_stream_success():
    sse = (
        'data: {"choices":[{"delta":{"content":"سل"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"ام"},"finish_reason":"stop"}]}\n\n'
        'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n'
        "data: [DONE]\n\n"
    )
    respx.post(f"{BASE}/chat/completions").mock(return_value=httpx.Response(200, text=sse))
    p = OpenAICompatibleProvider(base_url=BASE, api_key="k")
    deltas = [d async for d in p.stream(req())]
    assert "".join(d.text for d in deltas) == "سلام"
    assert deltas[-1].done and deltas[-1].usage.output_tokens == 2
    await p.aclose()


@pytest.mark.parametrize(
    "status,error,retryable",
    [
        (429, ProviderRateLimitError, True),
        (500, ProviderUnavailableError, True),
        (503, ProviderUnavailableError, True),
        (401, ProviderAuthError, False),
        (403, ProviderAuthError, False),
        (400, ProviderBadRequestError, False),
        (422, ProviderBadRequestError, False),
    ],
)
@respx.mock
async def test_openai_compat_status_mapping(status, error, retryable):
    respx.post(f"{BASE}/chat/completions").mock(
        return_value=httpx.Response(status, json={"error": {"message": "key sk-leak"}}, headers={"retry-after": "7"})
    )
    p = OpenAICompatibleProvider(base_url=BASE, api_key="k")
    with pytest.raises(error) as info:
        await p.generate(req())
    assert info.value.retryable is retryable and info.value.status_code == status
    assert "sk-leak" not in str(info.value)
    if status == 429:
        assert info.value.retry_after == 7.0
    await p.aclose()


@respx.mock
async def test_openai_compat_transport_errors_and_bad_payloads():
    p = OpenAICompatibleProvider(base_url=BASE, api_key="k")
    route = respx.post(f"{BASE}/chat/completions")
    route.mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(ProviderTimeoutError):
        await p.generate(req())
    route.mock(side_effect=httpx.ConnectError("refused"))
    with pytest.raises(ProviderUnavailableError):
        await p.generate(req())
    route.mock(return_value=httpx.Response(200, json={"unexpected": True}))
    with pytest.raises(ProviderResponseError):
        await p.generate(req())
    route.mock(return_value=httpx.Response(200, text="data: {broken\n\n"))
    with pytest.raises(ProviderResponseError):
        [d async for d in p.stream(req())]
    await p.aclose()
