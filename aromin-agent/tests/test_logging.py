import io
import json

from app.core.logging import REDACTED, configure_logging, get_logger, redact_mapping
from app.providers.errors import ProviderUnavailableError
from app.providers.mock import MockProvider
from tests.conftest import create_key


def lines(stream: io.StringIO) -> list[dict]:
    return [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]


def test_json_lines_with_level_and_timestamp():
    stream = io.StringIO()
    configure_logging("INFO", "json", stream)
    get_logger("t").info("hello", task_id="task_1", latency_ms=12)
    get_logger("t").debug("filtered out")
    [entry] = lines(stream)
    assert entry["event"] == "hello" and entry["level"] == "info" and entry["task_id"] == "task_1"
    assert entry["timestamp"].endswith("Z")


def test_secrets_are_redacted():
    stream = io.StringIO()
    configure_logging("INFO", "json", stream)
    get_logger().info(
        "x", api_key="sk-1", authorization="Bearer abc.def", database_url="postgresql://u:pw@h/db",
        note="calling with Bearer tok123 and postgresql://admin:hunter2@db/x",
    )  # fmt: skip
    text = stream.getvalue()
    for secret in ("sk-1", "abc.def", "pw@", "tok123", "hunter2"):
        assert secret not in text
    assert REDACTED in text
    assert redact_mapping({"nested": {"password": "p"}}) == {"nested": {"password": REDACTED}}


async def test_request_logs_carry_ids_latency_and_no_message_text(client, service_headers, log_stream):
    r = await client.post(
        "/v1/chat", json={"message": "متن خصوصی مشتری"}, headers={**service_headers, "X-Request-ID": "req-test-1234"}
    )
    assert r.headers["x-request-id"] == "req-test-1234"
    body = r.json()
    entries = lines(log_stream)
    assert "متن خصوصی مشتری" not in log_stream.getvalue()
    access = [e for e in entries if e["event"] == "http.request"][-1]
    assert access["request_id"] == "req-test-1234" and access["status"] == 200 and "latency_ms" in access
    done = next(e for e in entries if e["event"] == "agent.turn_completed")
    assert done["conversation_id"] == body["conversation_id"] and done["task_id"] == body["task_id"]
    assert done["provider"] == "mock" and done["status"] == "succeeded" and "latency_ms" in done
    assert any(e["event"] == "event.recorded" and e["event_id"].startswith("evt_") for e in entries)


async def test_failure_logs_error_type(make_container, client_for, log_stream):
    container = make_container(MockProvider(fail_with=ProviderUnavailableError()))
    h = {"Authorization": f"Bearer {await create_key(container, ['service'])}"}
    await client_for(container).post("/v1/chat", json={"message": "hi"}, headers=h)
    failed = next(e for e in lines(log_stream) if e["event"] == "agent.turn_failed")
    assert failed["error_type"] == "provider_unavailable" and failed["status"] == "failed"


async def test_invalid_request_id_header_is_replaced(client):
    r = await client.get("/health", headers={"X-Request-ID": "bad id\nwith newline"})
    assert r.headers["x-request-id"].startswith("req_")
