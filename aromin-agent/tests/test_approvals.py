"""Approval flow: pause, decide (approve/reject), expire, cancel, audit."""

import json
from datetime import timedelta

from sqlalchemy import select

from app.models import AuditLog, OutboxEvent
from app.models.base import utcnow
from app.providers.mock import MockReply
from tests.conftest import create_key
from tests.tool_fixtures import CALLS, call

SEND = call("test.send_message", {"to_label": "مدیر کافه", "text": "دمو فردا ساعت ۱۰"}, "s1")


def R(content="", *calls):
    return MockReply(content=content, tool_calls=list(calls))


async def start_waiting(env, message="هماهنگ کن"):
    r = await env.client.post("/v1/chat", json={"message": message}, headers=env.svc)
    assert r.status_code == 202, r.text
    return r.json()


async def test_high_risk_tool_pauses_for_approval(tool_env):
    env = await tool_env([R("", SEND), R("پیام ارسال شد")])
    body = await start_waiting(env)
    assert body["status"] == "waiting_approval" and body["message"] is None and body["approval_id"].startswith("apr_")
    assert body["tool_calls"] == [
        {"tool": "test.send_message", "step_no": 2, "status": "waiting_approval", "error_type": "approval_required"}
    ]
    assert CALLS["test.send_message.provider"] == 0  # nothing executed yet

    task = (await env.client.get(f"/v1/tasks/{body['task_id']}", headers=env.svc)).json()
    assert task["status"] == "waiting" and task["wait_kind"] == "approval"
    assert task["pending_approval_id"] == body["approval_id"]
    approval = (await env.client.get(f"/v1/approvals/{body['approval_id']}", headers=env.svc)).json()
    assert approval["status"] == "pending" and approval["tool_name"] == "test.send_message"
    assert approval["risk_level"] == "HIGH" and approval["reason"] == "risk_high"
    assert approval["sanitized_input"] == {"to_label": "مدیر کافه", "text": "دمو فردا ساعت ۱۰"}
    steps = (await env.client.get(f"/v1/tasks/{body['task_id']}/steps", headers=env.svc)).json()["steps"]
    assert steps[1]["status"] == "waiting_approval" and steps[1]["approval_id"] == body["approval_id"]


async def test_approve_executes_once_and_finishes_the_turn(tool_env):
    env = await tool_env([R("", SEND), R("پیام ارسال شد")])
    body = await start_waiting(env)
    r = await env.client.post(f"/v1/approvals/{body['approval_id']}/approve", json={"note": "ok"}, headers=env.mgr)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["approval"]["status"] == "approved" and out["approval"]["decided_by"].startswith("key_")
    assert out["task_status"] == "succeeded" and out["message"]["content"] == "پیام ارسال شد"
    assert CALLS["test.send_message.provider"] == 1
    tool_result = json.loads(env.provider.requests[1].messages[-1].content)
    assert tool_result["ok"] is True and tool_result["result"]["detail"].startswith("ref-")

    # deciding again is refused; the effect is not repeated
    again = await env.client.post(f"/v1/approvals/{body['approval_id']}/approve", headers=env.mgr)
    assert again.status_code == 409 and again.json()["code"] == "approval_not_pending"
    assert CALLS["test.send_message.provider"] == 1

    async with env.c.uow_factory() as uow:
        actions = (await uow.session.execute(select(AuditLog.action).order_by(AuditLog.created_at))).scalars().all()
        for expected in ("approval.requested", "approval.approved", "tool.allowed", "tool.started", "tool.succeeded"):
            assert expected in actions
        events = (await uow.session.execute(select(OutboxEvent.type))).scalars().all()
        assert "approval.requested" in events and "approval.resolved" in events
        effects = (await uow.session.execute(select(OutboxEvent))).scalars().all()
        assert effects


async def test_reject_never_executes_and_model_is_told(tool_env):
    env = await tool_env([R("", SEND), R("باشد، ارسال نشد")])
    body = await start_waiting(env)
    r = await env.client.post(f"/v1/approvals/{body['approval_id']}/reject", headers=env.mgr)
    assert r.status_code == 200
    out = r.json()
    assert out["approval"]["status"] == "rejected" and out["task_status"] == "succeeded"
    assert CALLS["test.send_message.provider"] == 0 and CALLS["test.send_message"] == 0
    result = json.loads(env.provider.requests[1].messages[-1].content)
    assert result["ok"] is False and result["error_code"] == "approval_rejected"
    steps = (await env.client.get(f"/v1/tasks/{body['task_id']}/steps", headers=env.svc)).json()["steps"]
    assert steps[1]["status"] == "skipped"
    async with env.c.uow_factory() as uow:
        assert (await uow.session.execute(select(AuditLog).where(AuditLog.action == "approval.rejected"))).scalar()


async def test_only_authorized_humans_can_decide(tool_env):
    env = await tool_env([R("", SEND), R("x")])
    body = await start_waiting(env)
    url = f"/v1/approvals/{body['approval_id']}/approve"
    assert (await env.client.post(url)).status_code == 401
    assert (await env.client.post(url, headers=env.svc)).status_code == 403  # service keys cannot decide
    sales = {"Authorization": f"Bearer {await create_key(env.c, ['salesperson'])}"}
    assert (await env.client.post(url, headers=sales)).status_code == 403
    assert CALLS["test.send_message.provider"] == 0


async def test_requester_cannot_self_approve(tool_env):
    env = await tool_env([R("", SEND), R("x")])
    admin = {"Authorization": f"Bearer {await create_key(env.c, ['admin'])}"}
    r = await env.client.post("/v1/chat", json={"message": "send"}, headers=admin)  # admin starts the turn
    approval_id = r.json()["approval_id"]
    denied = await env.client.post(f"/v1/approvals/{approval_id}/approve", headers=admin)
    assert denied.status_code == 403 and denied.json()["code"] == "self_approval_forbidden"
    assert CALLS["test.send_message.provider"] == 0
    async with env.c.uow_factory() as uow:
        assert (await uow.approvals.get(approval_id)).status == "pending"
        assert await uow.audit.by_action("approval.self_decision_denied")


async def test_expired_approval_cannot_be_used(tool_env):
    env = await tool_env([R("", SEND), R("x"), R("new turn ok")])
    body = await start_waiting(env)
    async with env.c.uow_factory() as uow:
        approval = await uow.approvals.get(body["approval_id"])
        approval.expires_at = utcnow() - timedelta(seconds=1)
    r = await env.client.post(f"/v1/approvals/{body['approval_id']}/approve", headers=env.mgr)
    assert r.status_code == 409 and r.json()["code"] == "approval_expired"
    assert CALLS["test.send_message.provider"] == 0
    async with env.c.uow_factory() as uow:
        task = await uow.tasks.get(body["task_id"])
        assert task.status == "failed" and task.last_error["code"] == "approval_expired"
        assert (await uow.approvals.get(body["approval_id"])).status == "expired"
    # the conversation is usable again
    nxt = await env.client.post(
        "/v1/chat", json={"conversation_id": body["conversation_id"], "message": "again"}, headers=env.svc
    )
    assert nxt.status_code == 200


async def test_conversation_is_blocked_while_waiting_and_cancel_releases_it(tool_env):
    env = await tool_env([R("", SEND), R("after cancel")])
    body = await start_waiting(env)
    busy = await env.client.post(
        "/v1/chat", json={"conversation_id": body["conversation_id"], "message": "hello?"}, headers=env.svc
    )
    assert busy.status_code == 409 and busy.json()["code"] == "conversation_busy"

    c = await env.client.post(f"/v1/tasks/{body['task_id']}/cancel", headers=env.svc)
    assert c.status_code == 200 and c.json() == {
        "task_id": body["task_id"],
        "status": "cancelled",
        "cancel_requested": False,
    }
    approval = (await env.client.get(f"/v1/approvals/{body['approval_id']}", headers=env.svc)).json()
    assert approval["status"] == "cancelled"
    late = await env.client.post(f"/v1/approvals/{body['approval_id']}/approve", headers=env.mgr)
    assert late.status_code == 409
    assert CALLS["test.send_message.provider"] == 0
    again = await env.client.post(f"/v1/tasks/{body['task_id']}/cancel", headers=env.svc)
    assert again.status_code == 409 and again.json()["code"] == "task_finished"
    ok = await env.client.post(
        "/v1/chat", json={"conversation_id": body["conversation_id"], "message": "hello"}, headers=env.svc
    )
    assert ok.status_code == 200


async def test_calls_after_a_gated_call_are_deferred_not_executed(tool_env):
    note = call("test.record_note", {"text": "x"}, "n1")
    env = await tool_env([R("", SEND, note), R("done")])
    body = await start_waiting(env)
    assert CALLS["test.record_note"] == 0
    r = await env.client.post(f"/v1/approvals/{body['approval_id']}/approve", headers=env.mgr)
    assert r.json()["task_status"] == "succeeded"
    assert CALLS["test.record_note"] == 0  # deferred: the model must ask again
    tool_msgs = {m.tool_call_id: json.loads(m.content) for m in env.provider.requests[1].messages if m.role == "tool"}
    assert tool_msgs["s1"]["ok"] is True and tool_msgs["n1"]["error_code"] == "not_executed"


async def test_policy_override_can_require_approval_for_medium_tool(tool_env):
    note = call("test.record_note", {"text": "x"}, "n1")
    env = await tool_env([R("", note), R("saved")], tool_policy_overrides={"test.record_note": "REQUIRE_APPROVAL"})
    body = await start_waiting(env)
    r = await env.client.post(f"/v1/approvals/{body['approval_id']}/approve", headers=env.mgr)
    assert r.json()["message"]["content"] == "saved" and CALLS["test.record_note"] == 1


async def test_approval_endpoints_validation_and_404(tool_env):
    env = await tool_env()
    assert (await env.client.get("/v1/approvals/bad", headers=env.svc)).status_code == 422
    missing = "/v1/approvals/apr_01J0000000000000000000000Z"
    assert (await env.client.get(missing, headers=env.svc)).status_code == 404
    assert (await env.client.post(missing + "/approve", headers=env.mgr)).status_code == 404
    assert (await env.client.post(missing + "/reject", json={"note": "x" * 501}, headers=env.mgr)).status_code == 422
