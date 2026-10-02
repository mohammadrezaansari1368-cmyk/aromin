"""AgentRuntime tested directly (no HTTP), with the real DB and the MockProvider."""

import pytest

from app.agent.events import MessageDelta, TurnCompleted, TurnFailed, TurnStarted
from app.agent.runtime import TurnInput
from app.core.errors import NotFound
from app.providers.errors import ProviderRateLimitError
from app.providers.mock import MockProvider, MockReply


async def collect(runtime, turn):
    return [e async for e in runtime.run_turn(turn)]


async def test_event_order_and_streaming(make_container):
    c = make_container(MockProvider(["0123456789abcdef"], chunk_size=4))
    events = await collect(c.runtime, TurnInput(content="hi", actor_id="key_x"))
    assert isinstance(events[0], TurnStarted)
    assert [e.text for e in events if isinstance(e, MessageDelta)] == ["0123", "4567", "89ab", "cdef"]
    done = events[-1]
    assert isinstance(done, TurnCompleted) and done.content == "0123456789abcdef" and done.seq == 2
    assert done.provider == "mock" and done.model == "mock-main"


async def test_context_contains_system_prompt_and_selected_model(make_container):
    provider = MockProvider()
    c = make_container(provider, llm_model_main="custom-main")
    await collect(c.runtime, TurnInput(content="hello", actor_id="key_x"))
    request = provider.requests[0]
    assert request.model == "custom-main"
    assert request.messages[0].role == "system" and "آرومین" in request.messages[0].content
    assert request.messages[-1].content == "hello"
    assert request.timeout_s == c.settings.llm_timeout_seconds


async def test_provider_failure_yields_normalized_event_and_fails_task(make_container):
    c = make_container(MockProvider(fail_with=ProviderRateLimitError(retry_after=3)))
    events = await collect(c.runtime, TurnInput(content="hi", actor_id="key_x"))
    failed = events[-1]
    assert isinstance(failed, TurnFailed)
    assert (failed.code, failed.error_class, failed.retryable) == ("provider_rate_limited", "transient", True)
    async with c.uow_factory() as uow:
        task = await uow.tasks.get(failed.task_id)
        assert task.status == "failed" and task.consecutive_failures == 1
        conv = await uow.conversations.get(failed.conversation_id)
        assert conv.answered_through_seq == 0  # the user message stays unanswered


async def test_tool_calls_are_rejected_in_phase_1(make_container):
    c = make_container(MockProvider([MockReply(content="", tool_calls=[{"name": "crm.create_lead"}])]))
    events = await collect(c.runtime, TurnInput(content="hi", actor_id="key_x"))
    assert isinstance(events[-1], TurnFailed) and events[-1].code == "agent_error"


async def test_unknown_conversation_raises_not_found(make_container):
    c = make_container()
    with pytest.raises(NotFound):
        await collect(
            c.runtime, TurnInput(content="hi", actor_id="k", conversation_id="conv_01J0000000000000000000000Z")
        )


async def test_runtime_is_provider_independent(make_container):
    """Any LLMProvider implementation can be injected; the runtime only uses the interface."""
    from app.providers.base import ChatDelta, ChatResponse, LLMProvider, Usage

    class EchoProvider(LLMProvider):
        name = "echo"

        async def _generate(self, request):
            return ChatResponse(content="x", model=request.model, provider=self.name)

        async def _stream(self, request):
            yield ChatDelta(text=request.messages[-1].content.upper())
            yield ChatDelta(done=True, usage=Usage(input_tokens=1, output_tokens=1))

    c = make_container(EchoProvider())
    events = await collect(c.runtime, TurnInput(content="abc", actor_id="k"))
    assert events[-1].content == "ABC" and events[-1].provider == "echo"


async def test_unexpected_error_fails_task_instead_of_leaving_it_running(make_container):
    class Broken(MockProvider):
        async def _stream(self, request):
            raise RuntimeError("bug")
            yield  # pragma: no cover

    c = make_container(Broken())
    with pytest.raises(RuntimeError):
        await collect(c.runtime, TurnInput(content="hi", actor_id="k"))
    async with c.uow_factory() as uow:
        from sqlalchemy import select

        from app.models import Task

        task = (await uow.session.execute(select(Task))).scalar_one()
        assert task.status == "failed" and task.last_error["code"] == "agent_error"
