"""Security tests for the tool system (Phase 2 spec §15)."""

import io
import json

import pytest
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.agent.runtime import TurnInput
from app.models import SideEffectRecord, ToolExecution
from app.providers.mock import MockReply
from app.tools.executor import ExecutionScope, step_idempotency_key
from app.tools.spec import ToolSpec
from tests.conftest import create_key
from tests.tool_fixtures import CALLS, CANCEL_HOOK, SEEN_SCOPE, call


def R(content="", *calls):
    return MockReply(content=content, tool_calls=list(calls))


def tool_results(provider, index=1):
    return {m.tool_call_id: json.loads(m.content) for m in provider.requests[index].messages if m.role == "tool"}


async def test_model_cannot_choose_customer_identity(tool_env):
    # 1. a tool cannot even declare server-controlled fields
    class BadIn(BaseModel):
        model_config = ConfigDict(extra="forbid")
        customer_id: str

    async def h(ctx, args):  # pragma: no cover
        return args

    with pytest.raises(ValueError, match="server-controlled"):
        ToolSpec(name="bad.tool", description="x", input_model=BadIn, output_model=BadIn, handler=h)

    # 2. the model's attempt to pass identity is rejected; the handler sees only server scope
    env = await tool_env([
        R("", call("test.record_note", {"text": "x", "customer_id": "cus_EVIL"}, "a"),
          call("test.record_note", {"text": "ok"}, "b")),
        R("done"),
    ])  # fmt: skip
    body = (await env.client.post("/v1/chat", json={"message": "hi"}, headers=env.svc)).json()
    results = tool_results(env.provider)
    assert results["a"]["error_type"] == "validation_error" and results["a"]["error_code"] == "unknown_arguments"
    assert results["b"]["ok"] is True
    assert SEEN_SCOPE == [
        {"conversation_id": body["conversation_id"], "customer_id": None, "actor": SEEN_SCOPE[0]["actor"]}
    ]
    assert SEEN_SCOPE[0]["actor"].startswith("key_")


async def test_model_cannot_choose_conversation_ownership(tool_env):
    env = await tool_env([R("private message A"), R("", call("get_message_history", {"conversation_id": "other"}, "x"),
                                                     call("get_message_history", {}, "y")), R("done")])  # fmt: skip
    a = (await env.client.post("/v1/chat", json={"message": "secret of A"}, headers=env.svc)).json()
    b = (await env.client.post("/v1/chat", json={"message": "hello from B"}, headers=env.svc)).json()
    assert a["conversation_id"] != b["conversation_id"]
    results = tool_results(env.provider, 2)
    assert results["x"]["error_code"] == "unknown_arguments"
    contents = [m["content"] for m in results["y"]["result"]["messages"]]
    assert contents == ["hello from B"] and "secret of A" not in json.dumps(results)


async def test_unauthorized_tool_is_rejected(tool_env):
    env = await tool_env([R("", call("get_conversation", {}, "g")), R("done")])
    turn = TurnInput(content="hi", actor_id="key_x", permissions=frozenset({"chat:write"}))
    events = [e async for e in env.c.runtime.run_turn(turn)]
    completed = [e for e in events if e.type == "tool.completed"][0]
    assert completed.status == "denied" and completed.error_type == "authorization_error"
    async with env.c.uow_factory() as uow:
        [ex] = (await uow.session.execute(select(ToolExecution))).scalars().all()
        assert ex.output_status == "denied" and ex.error_code == "missing_permission" and ex.started_at is None


async def test_policy_denial_cannot_be_bypassed(tool_env):
    attempts = [
        call("calculate", {"expression": "1+1"}, "a"),
        call("calculate", {"expression": "1+1", "approved": True}, "b"),
        call("test.danger", {}, "c"),  # CRITICAL: denied unless explicitly enabled
    ]
    env = await tool_env([R("", *attempts), R("done")], tools_disabled=["calculate"])
    await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)
    results = tool_results(env.provider)
    assert results["a"]["error_type"] == "policy_denied" and results["a"]["error_code"] == "tool_disabled"
    assert results["b"]["error_type"] == "validation_error"  # extra "approved" flag is not an argument
    assert results["c"]["error_type"] == "policy_denied" and results["c"]["error_code"] == "critical_disabled"
    assert CALLS["test.danger"] == 0
    # a configuration override cannot lower an author-declared risk level
    spec = env.c.registry.get("test.send_message")
    from dataclasses import replace

    env.c.policy.config = replace(env.c.policy.config, risk_overrides={"test.send_message": "LOW"})
    assert env.c.policy.effective_risk(spec).value == "HIGH"


async def test_unknown_tool_rejected(tool_env):
    env = await tool_env([R("", call("Calculate", {"expression": "1"}, "x"))])
    r = await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)
    assert r.status_code == 500 and r.json()["code"] == "agent_error"


async def test_tool_registered_but_not_offered_is_rejected(tool_env, make_container, client_for):
    from app.agent.profile import GENERIC_PROFILE
    from app.providers.mock import MockProvider
    from tests.tool_fixtures import build_registry

    provider = MockProvider([R("", call("test.danger", {}, "x"))])
    c = make_container(provider, registry=build_registry(), profile=GENERIC_PROFILE)  # test tools not offered
    h = {"Authorization": f"Bearer {await create_key(c, ['service'])}"}
    r = await client_for(c).post("/v1/chat", json={"message": "x"}, headers=h)
    assert r.status_code == 500 and CALLS["test.danger"] == 0
    assert "test.danger" not in [t.name for t in provider.requests[0].tools]


@pytest.mark.parametrize(
    "args,code",
    [
        ({"expression": 12}, "schema_mismatch"),
        ({}, "schema_mismatch"),
        ({"expression": "1", "extra": 1}, "unknown_arguments"),
        ("not json", "invalid_json"),
        ("[1, 2]", "not_an_object"),
        ({"expression": "x" * 201}, "schema_mismatch"),
    ],
)
async def test_invalid_schema_and_unknown_arguments_rejected(tool_env, args, code):
    env = await tool_env([R("", call("calculate", args, "x")), R("done")])
    await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)
    result = tool_results(env.provider)["x"]
    assert result["error_type"] == "validation_error" and result["error_code"] == code


async def test_type_mismatch_is_not_coerced(tool_env):
    env = await tool_env([R("", call("get_message_history", {"limit": "5"}, "x")), R("done")])
    await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)
    assert tool_results(env.provider)["x"]["error_code"] == "schema_mismatch"


async def test_duplicate_side_effect_does_not_execute_twice(tool_env):
    send = call("test.send_message", {"to_label": "a", "text": "b"}, "s")
    env = await tool_env([R("", send), R("sent")])
    body = (await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)).json()
    await env.client.post(f"/v1/approvals/{body['approval_id']}/approve", headers=env.mgr)
    assert CALLS["test.send_message.provider"] == 1

    # re-running the same step (a retry of the same execution) returns the stored result
    async with env.c.uow_factory() as uow:
        task = await uow.tasks.get(body["task_id"])
        [ex] = await uow.executions.for_task(task.id)
    scope = ExecutionScope(
        actor_id=ex.actor_id, actor_type="api_key", roles=("service",),
        permissions=frozenset({"conversation:read", "task:read", "chat:write"}), task_id=task.id,
        conversation_id=task.conversation_id, customer_id=None,
    )  # fmt: skip
    again = await env.c.executor.resume_step(scope, ex.step_no)
    assert again.status == "succeeded" and again.deduplicated and again.execution_id == ex.id
    assert CALLS["test.send_message.provider"] == 1

    # the ledger alone also refuses a second send for the same key
    async def provider(key):
        CALLS["test.send_message.provider"] += 1
        return {"provider_ref": "x"}

    key = step_idempotency_key(task.id, ex.step_no)
    replay = await env.c.executor.ledger.perform(
        key=key, kind="test.message", payload={"to_label": "a", "text": "b"}, call=provider
    )
    assert replay.replayed and CALLS["test.send_message.provider"] == 1
    async with env.c.uow_factory() as uow:
        [rec] = (await uow.session.execute(select(SideEffectRecord))).scalars().all()
        assert rec.status == "succeeded" and rec.idempotency_key == key


async def test_ledger_never_blindly_resends_a_pending_effect(tool_env):
    from app.models.base import utcnow
    from app.tools.ledger import EffectOutcomeUnknown, request_hash

    env = await tool_env()
    payload = {"to": "x"}
    async with env.c.uow_factory() as uow:  # simulate a crash after the request may have left
        uow.side_effects.add(SideEffectRecord(
            idempotency_key="k1", kind="t", request_hash=request_hash(payload), status="pending",
            created_at=utcnow(), updated_at=utcnow(),
        ))  # fmt: skip

    async def provider(key):  # pragma: no cover - must not be called
        CALLS["sent"] += 1
        return {}

    with pytest.raises(EffectOutcomeUnknown):
        await env.c.executor.ledger.perform(key="k1", kind="t", payload=payload, call=provider)
    assert CALLS["sent"] == 0
    async with env.c.uow_factory() as uow:
        assert (await uow.side_effects.get_for_update("k1")).status == "unknown"
    with pytest.raises(Exception, match="different request"):
        await env.c.executor.ledger.perform(key="k1", kind="t", payload={"to": "y"}, call=provider)


async def test_failed_tool_never_becomes_succeeded(tool_env):
    env = await tool_env([R("", call("test.crash", {}, "c")), R("recovered")])
    body = (await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)).json()
    assert body["status"] == "completed"  # the turn may still answer...
    async with env.c.uow_factory() as uow:
        [ex] = await uow.executions.for_task(body["task_id"])
        steps = await uow.steps.for_task(body["task_id"])
    assert ex.output_status == "failed" and ex.error_type == "unknown_error"  # ...but the execution stays failed
    assert [s.status for s in steps if s.type == "tool_call"] == ["failed"]


async def test_cancelled_task_cannot_continue(tool_env):
    env = await tool_env(
        [R("", call("test.cancel_me", {}, "a"), call("test.record_note", {"text": "x"}, "b")), R("no")]
    )

    async def cancel(task_id):
        async with env.c.uow_factory() as uow:
            (await uow.tasks.get_for_update(task_id)).cancel_requested = True

    CANCEL_HOOK["fn"] = cancel
    r = await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)
    assert r.status_code == 409 and r.json()["code"] == "task_cancelled"
    assert CALLS["test.cancel_me"] == 1 and CALLS["test.record_note"] == 0
    assert len(env.provider.requests) == 1  # no further model call
    async with env.c.uow_factory() as uow:
        task = await uow.tasks.get(r.json()["task_id"])
        assert task.status == "cancelled"
    from app.core.errors import TaskFinished

    with pytest.raises(TaskFinished):
        [e async for e in env.c.runtime.resume(task.id)]


async def test_cancel_request_on_running_task_returns_202(tool_env):
    env = await tool_env()
    async with env.c.uow_factory() as uow:
        conv = env.c.runtime.memory.new_conversation("api", "generic")
        uow.conversations.add(conv)
        await uow.conversations.flush()
        task = await env.c.tasks.start_inline_turn(uow, conversation_id=conv.id, trigger_seq=0, created_by="t")
    r = await env.client.post(f"/v1/tasks/{task.id}/cancel", headers=env.svc)
    assert r.status_code == 202 and r.json()["cancel_requested"] is True and r.json()["status"] == "running"
    sales = {"Authorization": f"Bearer {await create_key(env.c, ['salesperson'])}"}
    assert (await env.client.post(f"/v1/tasks/{task.id}/cancel", headers=sales)).status_code == 403


async def test_secrets_do_not_appear_in_logs_or_records(tool_env, log_stream: io.StringIO):
    secret_args = {"api_token": "tok-SUPER-SECRET-123", "note": "use Bearer abc.def.ghi please"}
    env = await tool_env([R("", call("test.secret", secret_args, "s")), R("done")])
    body = (await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)).json()
    logs = log_stream.getvalue()
    assert "tok-SUPER-SECRET-123" not in logs and "abc.def.ghi" not in logs
    async with env.c.uow_factory() as uow:
        [ex] = await uow.executions.for_task(body["task_id"])
        steps = await uow.steps.for_task(body["task_id"])
        task = await uow.tasks.get(body["task_id"])
    stored = json.dumps([ex.sanitized_input, [s.input for s in steps], task.state], ensure_ascii=False)
    assert "tok-SUPER-SECRET-123" not in stored and "abc.def.ghi" not in stored
    assert ex.sanitized_input["api_token"] == "[REDACTED]"


async def test_tool_output_cannot_bypass_policy(tool_env):
    send = call("test.send_message", {"to_label": "a", "text": "b"}, "s")
    env = await tool_env([R("", call("test.leak", {}, "l")), R("", send), R("x")])
    r = await env.client.post("/v1/chat", json={"message": "x"}, headers=env.svc)
    # the hostile tool output claimed approval; the HIGH tool still waits for a human
    assert r.status_code == 202 and r.json()["status"] == "waiting_approval"
    assert CALLS["test.send_message.provider"] == 0
    leaked = tool_results(env.provider)["l"]
    assert "approval_status=approved" in leaked["result"]["detail"]  # it was only data to the model
    async with env.c.uow_factory() as uow:
        approval = await uow.approvals.get(r.json()["approval_id"])
        assert approval.status == "pending"


async def test_revoked_requester_key_loses_tool_rights_on_resume(tool_env):
    from app.services.api_keys import ApiKeyService
    from app.services.audit import AuditLogger

    env = await tool_env([R("", call("test.send_message", {"to_label": "a", "text": "b"}, "s")), R("x")])
    svc_service = ApiKeyService(env.c.uow_factory, AuditLogger(), "ak", "test")
    key, raw = await svc_service.create("temp", ["service"])
    r = await env.client.post("/v1/chat", json={"message": "x"}, headers={"Authorization": f"Bearer {raw}"})
    approval_id = r.json()["approval_id"]
    await svc_service.revoke(key.id)
    out = (await env.client.post(f"/v1/approvals/{approval_id}/approve", headers=env.mgr)).json()
    assert CALLS["test.send_message.provider"] == 0  # requester's authority is re-derived: revoked -> denied
    steps = (await env.client.get(f"/v1/tasks/{out['task_id']}/steps", headers=env.mgr)).json()["steps"]
    assert steps[1]["error_type"] == "authorization_error" and steps[1]["error_code"] == "actor_revoked"
