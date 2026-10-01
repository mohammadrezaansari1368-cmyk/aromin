import pytest

from app.security.auth import hash_api_key
from tests.conftest import create_key

PROTECTED = [
    ("post", "/v1/conversations", {}),
    ("get", "/v1/conversations/conv_01J0000000000000000000000Z", None),
    ("post", "/v1/chat", {"message": "hi"}),
    ("get", "/v1/tasks/task_01J0000000000000000000000Z", None),
]


@pytest.mark.parametrize("method,path,body", PROTECTED)
async def test_every_v1_endpoint_requires_authentication(client, method, path, body):
    r = await client.request(method, path, json=body)
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"
    assert r.headers["content-type"].startswith("application/problem+json")
    assert r.json()["code"] == "unauthorized"


@pytest.mark.parametrize("header", ["Bearer ak_test_wrong", "Basic abc", "Bearer ", "ak_test_x"])
async def test_invalid_credentials_rejected(client, header):
    r = await client.post("/v1/conversations", json={}, headers={"Authorization": header})
    assert r.status_code == 401


async def test_valid_key_is_accepted_and_stored_only_as_hash(client, container):
    raw = await create_key(container, ["service"])
    r = await client.post("/v1/conversations", json={}, headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 201
    async with container.uow_factory() as uow:
        key = await uow.api_keys.by_hash(hash_api_key(raw))
        assert key is not None and key.last_used_at is not None
        assert key.key_hash != raw and raw not in key.key_prefix + key.key_hash
        audit = await uow.audit.by_action("api_key.created")
        assert audit and audit[0].target == key.id


async def test_revoked_key_rejected(client, container):
    from app.services.api_keys import ApiKeyService
    from app.services.audit import AuditLogger

    service = ApiKeyService(container.uow_factory, AuditLogger(), "ak", "test")
    key, raw = await service.create("temp", ["service"])
    assert await service.revoke(key.id)
    r = await client.post("/v1/conversations", json={}, headers={"Authorization": f"Bearer {raw}"})
    assert r.status_code == 401


async def test_role_without_permission_is_forbidden(client, container):
    raw = await create_key(container, ["salesperson"])  # read-only role
    h = {"Authorization": f"Bearer {raw}"}
    assert (await client.post("/v1/conversations", json={}, headers=h)).status_code == 403
    assert (await client.post("/v1/chat", json={"message": "hi"}, headers=h)).status_code == 403


async def test_rate_limit_returns_429_with_retry_after(make_container, client_for):
    container = make_container(rate_limit_chat_per_minute=1)
    client = client_for(container)
    h = {"Authorization": f"Bearer {await create_key(container, ['service'])}"}
    assert (await client.post("/v1/chat", json={"message": "one"}, headers=h)).status_code == 200
    r = await client.post("/v1/chat", json={"message": "two"}, headers=h)
    assert r.status_code == 429
    assert r.json()["code"] == "rate_limited"
    assert int(r.headers["retry-after"]) >= 1


async def test_no_management_endpoints_exposed(client):
    paths = set(client._transport.app.openapi()["paths"])  # type: ignore[attr-defined]
    assert paths == {
        "/health",
        "/ready",
        "/v1/conversations",
        "/v1/conversations/{conversation_id}",
        "/v1/chat",
        "/v1/tasks/{task_id}",
        # Phase 2: task/step/tool-execution reads and approval decisions (all authenticated)
        "/v1/tasks/{task_id}/steps",
        "/v1/tasks/{task_id}/cancel",
        "/v1/tool-executions/{execution_id}",
        "/v1/approvals/{approval_id}",
        "/v1/approvals/{approval_id}/approve",
        "/v1/approvals/{approval_id}/reject",
    }
