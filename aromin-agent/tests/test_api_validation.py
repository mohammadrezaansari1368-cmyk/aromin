import pytest


@pytest.mark.parametrize(
    "payload,field",
    [
        ({}, "message"),
        ({"message": ""}, "message"),
        ({"message": "   "}, "message"),
        ({"message": "x" * 4001}, "message"),
        ({"message": "hi", "conversation_id": "not-an-id"}, "conversation_id"),
        ({"message": "hi", "client_msg_id": "has spaces"}, "client_msg_id"),
        ({"message": "hi", "channel": "sms"}, "channel"),
        ({"message": "hi", "unexpected": True}, "unexpected"),
    ],
)
async def test_chat_validation_errors(client, service_headers, payload, field):
    r = await client.post("/v1/chat", json=payload, headers=service_headers)
    assert r.status_code == 422
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["code"] == "validation_error" and body["request_id"]
    assert any(field in e["loc"] for e in body["errors"])


async def test_validation_errors_do_not_echo_input(client, service_headers):
    secret = "sk-live-should-not-echo"
    r = await client.post("/v1/chat", json={"message": "hi", "conversation_id": secret}, headers=service_headers)
    assert r.status_code == 422 and secret not in r.text


async def test_malformed_json_is_422(client, service_headers):
    r = await client.post(
        "/v1/chat", content=b"{not json", headers={**service_headers, "Content-Type": "application/json"}
    )
    assert r.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [{"channel": "fax"}, {"metadata": {"k": "v" * 300}}, {"customer_ref": "x" * 81}, {"extra": 1}],
)
async def test_create_conversation_validation(client, service_headers, payload):
    r = await client.post("/v1/conversations", json=payload, headers=service_headers)
    assert r.status_code == 422


async def test_path_and_query_validation(client, service_headers):
    assert (await client.get("/v1/conversations/bad", headers=service_headers)).status_code == 422
    assert (await client.get("/v1/tasks/bad", headers=service_headers)).status_code == 422
    conv = (await client.post("/v1/conversations", json={}, headers=service_headers)).json()
    r = await client.get(f"/v1/conversations/{conv['id']}?limit=1000", headers=service_headers)
    assert r.status_code == 422


async def test_unknown_route_is_problem_json(client):
    r = await client.get("/nope")
    assert r.status_code == 404 and r.json()["code"] == "not_found"


async def test_unhandled_error_is_generic_500(make_container, client_for, service_headers, monkeypatch):
    from tests.conftest import create_key

    container = make_container()
    client = client_for(container)
    h = {"Authorization": f"Bearer {await create_key(container, ['service'])}"}

    async def boom(*a, **k):
        raise RuntimeError("password=hunter2 at /srv/app.py line 3")

    monkeypatch.setattr(container.conversations, "create", boom)
    r = await client.post("/v1/conversations", json={}, headers=h)
    assert r.status_code == 500
    assert r.json()["code"] == "internal_error"
    assert "hunter2" not in r.text and "Traceback" not in r.text and "app.py" not in r.text
