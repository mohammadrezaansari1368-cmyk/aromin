from datetime import timedelta

from sqlalchemy import select

from app.models import Message, OutboxEvent, Task
from app.models.base import utcnow
from app.providers.errors import ProviderUnavailableError
from app.providers.mock import MockProvider
from tests.conftest import create_key


async def test_chat_creates_conversation_and_replies_with_mock(client, container, service_headers):
    r = await client.post("/v1/chat", json={"message": "سلام، قیمت SmartX چنده؟"}, headers=service_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["conversation_id"].startswith("conv_") and body["task_id"].startswith("task_")
    assert body["message"]["role"] == "assistant" and body["message"]["seq"] == 2
    assert body["message"]["content"].startswith("[mock] ")
    assert body["usage"]["input_tokens"] > 0 and body["replayed"] is False

    async with container.uow_factory() as uow:
        conv = await uow.conversations.get(body["conversation_id"])
        assert (conv.msg_seq, conv.last_user_seq, conv.answered_through_seq) == (2, 1, 1)
        msgs = await uow.messages.recent(conv.id, 10)
        assert [(m.role, m.seq) for m in msgs] == [("user", 1), ("assistant", 2)]
        assert all(m.task_id == body["task_id"] for m in msgs)
        task = await uow.tasks.get(body["task_id"])
        assert (task.kind, task.mode, task.lane, task.status) == ("agent.run", "immediate", 0, "succeeded")
        assert task.concurrency_key == f"conv:{conv.id}" and task.lease_owner is None
        assert task.result == {"message_id": body["message"]["id"]}
        events = (await uow.session.execute(select(OutboxEvent).order_by(OutboxEvent.id))).scalars().all()
        assert [e.type for e in events] == ["conversation.created", "message.received", "message.sent"]
        assert all(e.dispatched_at is None for e in events)


async def test_chat_uses_conversation_history(make_container, client_for):
    provider = MockProvider(["first answer", "second answer"])
    container = make_container(provider)
    client = client_for(container)
    h = {"Authorization": f"Bearer {await create_key(container, ['service'])}"}
    first = (await client.post("/v1/chat", json={"message": "one"}, headers=h)).json()
    await client.post("/v1/chat", json={"conversation_id": first["conversation_id"], "message": "two"}, headers=h)
    roles_and_text = [(m.role, m.content) for m in provider.requests[1].messages]
    assert roles_and_text[0][0] == "system"
    assert roles_and_text[1:] == [("user", "one"), ("assistant", "first answer"), ("user", "two")]


async def test_task_endpoint_reports_status(client, service_headers):
    body = (await client.post("/v1/chat", json={"message": "hi"}, headers=service_headers)).json()
    r = await client.get(f"/v1/tasks/{body['task_id']}", headers=service_headers)
    assert r.status_code == 200
    task = r.json()
    assert task["status"] == "succeeded" and task["kind"] == "agent.run" and task["error"] is None
    assert task["conversation_id"] == body["conversation_id"]
    assert (await client.get("/v1/tasks/task_01J0000000000000000000000Z", headers=service_headers)).status_code == 404


async def test_idempotent_retry_returns_same_reply(client, container, service_headers):
    payload = {"message": "hello", "client_msg_id": "client-1"}
    a = (await client.post("/v1/chat", json=payload, headers=service_headers)).json()
    payload["conversation_id"] = a["conversation_id"]
    b = (await client.post("/v1/chat", json=payload, headers=service_headers)).json()
    assert b["replayed"] is True
    assert b["message"]["id"] == a["message"]["id"] and b["task_id"] == a["task_id"]
    async with container.uow_factory() as uow:
        assert len(await uow.messages.recent(a["conversation_id"], 10)) == 2

    payload["message"] = "different text"
    r = await client.post("/v1/chat", json=payload, headers=service_headers)
    assert r.status_code == 409 and r.json()["code"] == "idempotency_conflict"


async def test_provider_unavailable_fails_task_without_leaking(make_container, client_for):
    container = make_container(MockProvider(fail_with=ProviderUnavailableError("upstream said: key=sk-123")))
    client = client_for(container)
    h = {"Authorization": f"Bearer {await create_key(container, ['service'])}"}
    r = await client.post("/v1/chat", json={"message": "hi"}, headers=h)
    assert r.status_code == 503
    body = r.json()
    assert body["code"] == "provider_unavailable" and "sk-123" not in r.text and "Traceback" not in r.text
    task_id = body["task_id"]
    async with container.uow_factory() as uow:
        task = await uow.tasks.get(task_id)
        assert task.status == "failed" and task.lease_owner is None
        assert task.last_error["code"] == "provider_unavailable"
        assert task.last_error["error_class"] == "transient"
    t = (await client.get(f"/v1/tasks/{task_id}", headers=h)).json()
    assert t["status"] == "failed" and t["error"]["code"] == "provider_unavailable"


async def test_provider_timeout_is_504(make_container, client_for):
    container = make_container(MockProvider(delay_s=2), llm_timeout_seconds=0.2)
    client = client_for(container)
    h = {"Authorization": f"Bearer {await create_key(container, ['service'])}"}
    r = await client.post("/v1/chat", json={"message": "hi"}, headers=h)
    assert r.status_code == 504 and r.json()["code"] == "provider_timeout"


async def test_second_turn_while_one_is_running_is_rejected(client, container, service_headers):
    conv = (await client.post("/v1/conversations", json={}, headers=service_headers)).json()
    async with container.uow_factory() as uow:
        await container.tasks.start_inline_turn(uow, conversation_id=conv["id"], trigger_seq=0, created_by="t")
    r = await client.post("/v1/chat", json={"conversation_id": conv["id"], "message": "hi"}, headers=service_headers)
    assert r.status_code == 409 and r.json()["code"] == "conversation_busy"
    async with container.uow_factory() as uow:  # the rejected message was rolled back
        assert await uow.messages.recent(conv["id"], 10) == []


async def test_expired_inline_lease_does_not_block_conversation(client, container, service_headers):
    conv = (await client.post("/v1/conversations", json={}, headers=service_headers)).json()
    async with container.uow_factory() as uow:
        stale = await container.tasks.start_inline_turn(uow, conversation_id=conv["id"], trigger_seq=0, created_by="t")
        stale.lease_until = utcnow() - timedelta(seconds=1)
        stale_id = stale.id
    r = await client.post("/v1/chat", json={"conversation_id": conv["id"], "message": "hi"}, headers=service_headers)
    assert r.status_code == 200
    async with container.uow_factory() as uow:
        stale = await uow.tasks.get(stale_id)
        assert stale.status == "failed" and stale.last_error["code"] == "lease_expired"


async def test_reasoning_from_provider_is_never_persisted(make_container, client_for):
    from app.providers.mock import MockReply

    container = make_container(MockProvider([MockReply(content="final answer", reasoning="SECRET-THOUGHTS")]))
    client = client_for(container)
    h = {"Authorization": f"Bearer {await create_key(container, ['service'])}"}
    r = await client.post("/v1/chat", json={"message": "hi"}, headers=h)
    assert r.json()["message"]["content"] == "final answer"
    async with container.uow_factory() as uow:
        rows = (await uow.session.execute(select(Message.content))).scalars().all()
        tasks = (await uow.session.execute(select(Task))).scalars().all()
        events = (await uow.session.execute(select(OutboxEvent))).scalars().all()
    blob = str(rows) + str([(t.input, t.state, t.result) for t in tasks]) + str([(e.subject, e.data) for e in events])
    assert "SECRET-THOUGHTS" not in blob
