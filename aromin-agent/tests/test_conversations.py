from sqlalchemy import select

from app.models import OutboxEvent


async def test_create_conversation(client, container, service_headers):
    r = await client.post(
        "/v1/conversations",
        json={"channel": "web", "customer_ref": "crm-42", "metadata": {"source": "landing"}},
        headers=service_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["id"].startswith("conv_")
    assert body["channel"] == "web" and body["status"] == "open" and body["agent_profile"] == "generic"
    assert body["metadata"] == {"source": "landing", "customer_ref": "crm-42"}

    async with container.uow_factory() as uow:
        stored = await uow.conversations.get(body["id"])
        assert stored is not None and stored.msg_seq == 0
        events = (await uow.session.execute(select(OutboxEvent))).scalars().all()
        assert [e.type for e in events] == ["conversation.created"]
        assert (await uow.audit.by_action("conversation.created"))[0].target == body["id"]


async def test_get_conversation_with_messages_and_pagination(client, service_headers):
    conv = (await client.post("/v1/conversations", json={}, headers=service_headers)).json()
    for i in range(3):
        r = await client.post(
            "/v1/chat", json={"conversation_id": conv["id"], "message": f"msg {i}"}, headers=service_headers
        )
        assert r.status_code == 200

    full = (await client.get(f"/v1/conversations/{conv['id']}", headers=service_headers)).json()
    assert [m["seq"] for m in full["messages"]] == [1, 2, 3, 4, 5, 6]
    assert [m["role"] for m in full["messages"]] == ["user", "assistant"] * 3
    assert full["next_cursor"] is None

    page1 = (await client.get(f"/v1/conversations/{conv['id']}?limit=4", headers=service_headers)).json()
    assert [m["seq"] for m in page1["messages"]] == [1, 2, 3, 4] and page1["next_cursor"] == 4
    page2 = (await client.get(f"/v1/conversations/{conv['id']}?limit=4&cursor=4", headers=service_headers)).json()
    assert [m["seq"] for m in page2["messages"]] == [5, 6] and page2["next_cursor"] is None


async def test_unknown_conversation_is_404(client, service_headers):
    r = await client.get("/v1/conversations/conv_01J0000000000000000000000Z", headers=service_headers)
    assert r.status_code == 404
    assert r.json()["code"] == "not_found"
