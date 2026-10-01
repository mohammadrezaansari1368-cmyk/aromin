"""The tool-calling loop end to end through /v1/chat (MockProvider scripts the model)."""

import json

from sqlalchemy import select

from app.models import AuditLog, LLMUsage, TaskStep, ToolExecution
from app.providers.mock import MockReply
from tests.tool_fixtures import CALLS, call


def R(content="", *calls):
    return MockReply(content=content, tool_calls=list(calls))


async def steps_of(c, task_id):
    async with c.uow_factory() as uow:
        return await uow.steps.for_task(task_id)


async def test_calculate_round_trip(tool_env):
    env = await tool_env([R("", call("calculate", {"expression": "3 * 1250000 * 0.9"}, "c1")), R("جمع: ۳٬۳۷۵٬۰۰۰")])
    r = await env.client.post("/v1/chat", json={"message": "قیمت ۳ شعبه؟"}, headers=env.svc)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "completed" and body["message"]["content"] == "جمع: ۳٬۳۷۵٬۰۰۰"
    assert body["tool_calls"] == [{"tool": "calculate", "step_no": 2, "status": "succeeded", "error_type": None}]

    # the model received the tool result as a tool message, linked to its call id
    second = env.provider.requests[1]
    tool_msg = second.messages[-1]
    assert tool_msg.role == "tool" and tool_msg.tool_call_id == "c1"
    assert json.loads(tool_msg.content) == {"ok": True, "result": {"result": 3375000.0}}
    assert [t.name for t in env.provider.requests[0].tools] == sorted(env.c.runtime.profile.allowed_tools)

    steps = await steps_of(env.c, body["task_id"])
    assert [(s.step_no, s.type, s.status) for s in steps] == [
        (1, "model_call", "succeeded"),
        (2, "tool_call", "succeeded"),
        (3, "model_call", "succeeded"),
    ]
    async with env.c.uow_factory() as uow:
        ex = await uow.executions.get(steps[1].execution_id)
        assert ex.tool_name == "calculate" and ex.tool_version == "1" and ex.output_status == "succeeded"
        assert ex.sanitized_input == {"expression": "3 * 1250000 * 0.9"} and len(ex.input_hash) == 64
        assert ex.actor_type == "api_key" and ex.actor_id.startswith("key_") and ex.policy_decision == "ALLOW"
        assert ex.risk_level == "LOW" and ex.latency_ms is not None and ex.retry_count == 0
        assert ex.idempotency_key is None  # pure tool: no idempotency key needed
        actions = (await uow.session.execute(select(AuditLog.action).where(AuditLog.target == ex.id))).scalars().all()
        assert actions == ["tool.requested", "tool.allowed", "tool.started", "tool.succeeded"]
        usage = (await uow.session.execute(select(LLMUsage))).scalars().all()
        assert len(usage) == 2 and all(u.provider == "mock" and u.model == "mock-main" for u in usage)
        assert all(u.total_tokens == u.input_tokens + u.output_tokens > 0 for u in usage)


async def test_builtin_read_tools_are_scoped_to_the_turn(tool_env):
    env = await tool_env([
        R("", call("get_conversation", {}, "a"), call("get_message_history", {"limit": 5}, "b"),
          call("get_task", {}, "c"), call("get_current_time", {"timezone": "UTC"}, "d")),
        R("done"),
    ])  # fmt: skip
    body = (await env.client.post("/v1/chat", json={"message": "وضعیت؟"}, headers=env.svc)).json()
    results = {m.tool_call_id: json.loads(m.content) for m in env.provider.requests[1].messages if m.role == "tool"}
    assert results["a"]["ok"] and results["a"]["result"]["message_count"] == 1
    history = results["b"]["result"]["messages"]
    assert [(m["seq"], m["role"], m["content"]) for m in history] == [(1, "user", "وضعیت؟")]
    assert results["c"]["result"]["status"] == "running" and results["c"]["result"]["kind"] == "agent.run"
    assert results["d"]["result"]["timezone"] == "UTC" and "T" in results["d"]["result"]["iso"]
    assert body["status"] == "completed"


async def test_validation_error_is_returned_to_model_and_turn_continues(tool_env):
    env = await tool_env([R("", call("calculate", {"expression": 5}, "x")), R("fixed")])
    body = (await env.client.post("/v1/chat", json={"message": "hi"}, headers=env.svc)).json()
    assert body["message"]["content"] == "fixed"
    result = json.loads(env.provider.requests[1].messages[-1].content)
    assert result == {
        "ok": False, "error_type": "validation_error", "error_code": "schema_mismatch",
        "message": "invalid arguments: ['expression']",
    }  # fmt: skip


async def test_tool_iteration_limit_stops_safely(tool_env):
    loop = [R("", call("get_current_time", {}, f"t{i}")) for i in range(5)]
    env = await tool_env(loop, agent_max_tool_iterations=2)
    r = await env.client.post("/v1/chat", json={"message": "loop"}, headers=env.svc)
    assert r.status_code == 422 and r.json()["code"] == "agent_limit_exceeded"
    async with env.c.uow_factory() as uow:
        task = await uow.tasks.get(r.json()["task_id"])
        assert task.status == "failed" and task.last_error["code"] == "tool_iteration_limit"
        assert task.last_error["error_class"] == "budget_exceeded"
    assert len(env.provider.requests) == 3
    assert env.provider.requests[-1].tools == []  # the last call no longer offers tools
    assert CALLS == {}  # get_current_time is not counted; just make sure no test tool ran


async def test_turn_timeout_stops_after_slow_tool(tool_env):
    env = await tool_env([R("", call("test.slow_ok", {}, "s")), R("too late")], agent_turn_timeout_seconds=0.2)
    r = await env.client.post("/v1/chat", json={"message": "go"}, headers=env.svc)
    assert r.status_code == 422
    async with env.c.uow_factory() as uow:
        task = await uow.tasks.get(r.json()["task_id"])
        assert task.last_error["code"] == "turn_timeout"


async def test_token_budget_stops_the_turn(tool_env):
    env = await tool_env([R("", call("get_current_time", {}, "t")), R("unreachable")], agent_max_tokens_per_turn=100)
    r = await env.client.post("/v1/chat", json={"message": "x" * 600}, headers=env.svc)
    assert r.status_code == 422
    async with env.c.uow_factory() as uow:
        assert (await uow.tasks.get(r.json()["task_id"])).last_error["code"] == "token_budget_exceeded"


async def test_cost_is_estimated_and_cost_budget_enforced(tool_env):
    pricing = {"mock-main": {"input_per_1m": 1000.0, "output_per_1m": 2000.0}}
    env = await tool_env(
        [R("", call("get_current_time", {}, "t")), R("unreachable")], llm_pricing=pricing, agent_max_cost_per_turn=0.01
    )
    r = await env.client.post("/v1/chat", json={"message": "hello"}, headers=env.svc)
    assert r.status_code == 422
    task_id = r.json()["task_id"]
    async with env.c.uow_factory() as uow:
        assert (await uow.tasks.get(task_id)).last_error["code"] == "cost_budget_exceeded"
        [u] = await uow.usage.for_task(task_id)
        expected = (u.input_tokens * 1000 + u.output_tokens * 2000) / 1_000_000
        assert float(u.estimated_cost) == round(expected, 6)
    t = (await env.client.get(f"/v1/tasks/{task_id}", headers=env.svc)).json()
    assert t["usage"]["total_tokens"] == u.total_tokens and t["usage"]["estimated_cost"] == float(u.estimated_cost)


async def test_tool_timeout_is_retried_for_pure_tools_then_reported(tool_env):
    env = await tool_env([R("", call("test.slow", {}, "s")), R("sorry")])
    body = (await env.client.post("/v1/chat", json={"message": "go"}, headers=env.svc)).json()
    assert body["tool_calls"][0]["status"] == "failed" and body["tool_calls"][0]["error_type"] == "timeout"
    assert CALLS["test.slow"] == 2  # max_attempts=2, pure tool
    async with env.c.uow_factory() as uow:
        [ex] = await uow.executions.for_task(body["task_id"])
        assert ex.output_status == "failed" and ex.error_type == "timeout" and ex.retry_count == 1


async def test_network_error_retry_then_success(tool_env):
    env = await tool_env([R("", call("test.flaky", {}, "f")), R("ok")])
    body = (await env.client.post("/v1/chat", json={"message": "go"}, headers=env.svc)).json()
    async with env.c.uow_factory() as uow:
        [ex] = await uow.executions.for_task(body["task_id"])
        assert (
            ex.output_status == "succeeded"
            and ex.retry_count == 1
            and ex.output == {"ok": True, "detail": "second try"}
        )


async def test_business_and_unknown_errors_are_classified(tool_env):
    env = await tool_env([R("", call("test.business_fail", {}, "b"), call("test.crash", {}, "c")), R("handled")])
    body = (await env.client.post("/v1/chat", json={"message": "go"}, headers=env.svc)).json()
    assert [t["error_type"] for t in body["tool_calls"]] == ["business_error", "unknown_error"]
    results = [json.loads(m.content) for m in env.provider.requests[1].messages if m.role == "tool"]
    assert results[0]["error_code"] == "not_eligible" and results[0]["message"] == "customer not eligible"
    assert results[1]["message"] == "tool failed unexpectedly" and "hunter2" not in json.dumps(results)


async def test_unknown_tool_fails_closed_and_is_recorded(tool_env):
    env = await tool_env([R("", call("crm.delete_everything", {}, "z"))])
    r = await env.client.post("/v1/chat", json={"message": "go"}, headers=env.svc)
    assert r.status_code == 500 and r.json()["code"] == "agent_error"
    async with env.c.uow_factory() as uow:
        [ex] = await uow.executions.for_task(r.json()["task_id"])
        assert ex.output_status == "failed" and ex.error_type == "validation_error" and ex.error_code == "unknown_tool"
        actions = (await uow.session.execute(select(AuditLog.action).where(AuditLog.target == ex.id))).scalars().all()
        assert actions == ["tool.requested", "tool.denied"]


async def test_steps_and_execution_endpoints(tool_env):
    env = await tool_env([R("", call("calculate", {"expression": "1+1"}, "c")), R("2")])
    body = (await env.client.post("/v1/chat", json={"message": "1+1"}, headers=env.svc)).json()
    steps = (await env.client.get(f"/v1/tasks/{body['task_id']}/steps", headers=env.svc)).json()["steps"]
    assert [s["type"] for s in steps] == ["model_call", "tool_call", "model_call"]
    ex_id = steps[1]["execution_id"]
    ex = (await env.client.get(f"/v1/tool-executions/{ex_id}", headers=env.svc)).json()
    assert ex["tool_name"] == "calculate" and ex["output_status"] == "succeeded" and ex["task_id"] == body["task_id"]
    assert (await env.client.get(f"/v1/tool-executions/{ex_id}")).status_code == 401
    missing = "/v1/tool-executions/exec_01J0000000000000000000000Z"
    assert (await env.client.get(missing, headers=env.svc)).status_code == 404
    assert (await env.client.get("/v1/tasks/task_01J0000000000000000000000Z/steps", headers=env.svc)).status_code == 404


async def test_failed_model_invocation_is_recorded(tool_env):
    from app.providers.errors import ProviderUnavailableError

    env = await tool_env()
    env.provider.fail_with = ProviderUnavailableError()
    r = await env.client.post("/v1/chat", json={"message": "hi"}, headers=env.svc)
    assert r.status_code == 503
    async with env.c.uow_factory() as uow:
        [u] = await uow.usage.for_task(r.json()["task_id"])
        assert u.status == "failed" and u.error_type == "provider_unavailable" and u.total_tokens == 0
        [s] = await uow.steps.for_task(r.json()["task_id"])
        assert s.type == "model_call" and s.status == "failed"
    async with env.c.uow_factory() as uow:
        rows = (await uow.session.execute(select(TaskStep))).scalars().all()
        assert len(rows) == 1
        assert (await uow.session.execute(select(ToolExecution))).scalars().all() == []
