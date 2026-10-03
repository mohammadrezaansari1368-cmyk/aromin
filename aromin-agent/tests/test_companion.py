"""Real AROMIN HTTP/runtime/security pipeline behind the local companion gateway.

MockProvider is explicitly test-only; these tests do not verify a live LLM.
"""

from contextlib import asynccontextmanager

import httpx
import pytest
from pydantic import SecretStr

from app.companion.bridge import BridgeSettings, create_app
from app.main import create_app as agent_app
from tests.conftest import create_key

BASE = "http://127.0.0.1:8877"


@asynccontextmanager
async def gateway(container, *, raw=None, upstream_client=None):
    key = raw if raw is not None else await create_key(container, ["service"])
    owned = upstream_client is None
    backend = upstream_client or httpx.AsyncClient(
        transport=httpx.ASGITransport(app=agent_app(container=container)), base_url="http://agent", trust_env=False
    )
    app = create_app(
        BridgeSettings(_env_file=None, agent_url="http://agent", agent_api_key=SecretStr(key)), client=backend
    )
    try:
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url=BASE, trust_env=False
            ) as client:
                session = await client.get("/bridge/session")
                yield client, {"Origin": BASE, "X-Companion-CSRF": session.json()["csrf"]}, key
    finally:
        if owned:
            await backend.aclose()


async def test_chat_uses_existing_runtime_and_never_exposes_upstream_key(container):
    async with gateway(container) as (client, headers, key):
        status = await client.get("/bridge/status")
        assert status.json()["ready"] is True
        assert key not in status.text
        response = await client.post(
            "/bridge/chat", headers=headers, json={"message": "سلام", "client_msg_id": "companion-first"}
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["message"]["content"].startswith("[mock]")
        assert key not in response.text
        task = await client.get(
            "/bridge/tasks/" + body["task_id"], headers={"X-Companion-CSRF": headers["X-Companion-CSRF"]}
        )  # browser same-origin GET need not send Origin
        assert task.status_code == 200 and task.json()["status"] == "succeeded"
        conversation = await client.get("/bridge/conversations/" + body["conversation_id"], headers=headers)
        assert len(conversation.json()["messages"]) == 2
        repeat = await client.post(
            "/bridge/chat",
            headers=headers,
            json={"message": "سلام", "client_msg_id": "companion-first", "conversation_id": body["conversation_id"]},
        )
        assert repeat.status_code == 200
        assert repeat.json()["message"]["id"] == body["message"]["id"]


async def test_browser_authority_csrf_and_scope_fail_closed(container):
    async with gateway(container) as (client, headers, key):
        request = {"message": "سلام", "client_msg_id": "one"}
        assert (await client.post("/bridge/chat", json=request)).status_code == 403
        assert (
            await client.post("/bridge/chat", headers={**headers, "Origin": "https://evil.example"}, json=request)
        ).status_code == 403
        assert (await client.get("/bridge/session", headers={"Host": "evil.example"})).status_code == 400
        assert (await client.get("/bridge/tasks/task_unknown", headers=headers)).status_code == 403
        assert (await client.get("/bridge/conversations/conv_unknown", headers=headers)).status_code == 403
        assert (await client.post("/bridge/chat", headers=headers, json={"message": "سلام"})).status_code == 422
        root = await client.get("/")
        assert key not in root.text
        assert root.headers["content-security-policy"].startswith("default-src 'self'")
        assert "Mochi" not in root.text


async def test_missing_credentials_are_visible_without_fake_reply(container):
    async with gateway(container, raw="") as (client, headers, _):
        assert (await client.get("/bridge/status")).json()["configured"] is False
        result = await client.post(
            "/bridge/chat", headers=headers, json={"message": "hello", "client_msg_id": "offline"}
        )
        assert result.status_code == 503 and result.json()["detail"] == "agent_not_configured"
        assert "message" not in result.json()


async def test_timeout_retry_retains_conversation_and_dedupe_id(container):
    raw = await create_key(container, ["service"])
    actual = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=agent_app(container=container)), base_url="http://agent", trust_env=False
    )
    failed_once = False
    sent = []

    async def transport(request):
        nonlocal failed_once
        if request.url.path == "/v1/chat":
            import json

            sent.append(json.loads(request.content))
            if not failed_once:
                failed_once = True
                raise httpx.ReadTimeout("uncertain response", request=request)
        return await actual.send(request)

    try:
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport), base_url="http://agent") as upstream:
            async with gateway(container, raw=raw, upstream_client=upstream) as (client, headers, _):
                request = {"message": "hello", "client_msg_id": "stable"}
                first = await client.post("/bridge/chat", headers=headers, json=request)
                assert first.status_code == 504
                conv = first.json()["conversation_id"]
                second = await client.post("/bridge/chat", headers=headers, json=request)
                assert second.status_code == 200 and second.json()["conversation_id"] == conv
                assert sent[0]["conversation_id"] == sent[1]["conversation_id"]
                assert sent[0]["client_msg_id"] == sent[1]["client_msg_id"] == "stable"
                conflict = await client.post(
                    "/bridge/chat", headers=headers, json={"message": "changed", "client_msg_id": "stable"}
                )
                assert conflict.status_code == 409
    finally:
        await actual.aclose()


@pytest.mark.parametrize("url", ["ftp://agent", "http://user:pass@agent", "http://agent/path", "http://agent?secret=x"])
def test_upstream_origin_cannot_embed_secrets_or_arbitrary_paths(url):
    with pytest.raises(ValueError):
        BridgeSettings(_env_file=None, agent_url=url)


async def test_specialist_identity_is_authenticated_and_uses_aromin_profile(make_container, monkeypatch):
    from app.companion import agent

    container = make_container(profile=agent.SPECIALIST_PROFILE)
    monkeypatch.setattr(agent, "build_container", lambda *args, **kwargs: container)
    app = agent.create_app()
    key = await create_key(container, ["service"])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://agent") as client:
        assert (await client.get("/companion/info")).status_code == 401
        info = await client.get("/companion/info", headers={"Authorization": "Bearer " + key})
        assert info.json() == {"provider": "mock", "profile": "aromin-companion"}
        async with gateway(container, upstream_client=client, raw=key) as (browser, _, _):
            status = await browser.get("/bridge/status")
            assert status.json()["provider"] == "mock"
            assert status.json()["profile"] == "aromin-companion"
