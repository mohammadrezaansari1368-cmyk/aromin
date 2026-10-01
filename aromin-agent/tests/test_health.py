from app.core.config import Settings
from app.core.container import build_container
from app.providers.mock import MockProvider


async def test_health_is_public_and_ok(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "0.1.0"}
    assert r.headers["x-request-id"]


async def test_ready_checks_database(client):
    r = await client.get("/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ready", "checks": {"database": "ok", "redis": "not_configured"}}


async def test_ready_reports_unreachable_database(client_for, tmp_path):
    bad = Settings(_env_file=None, app_env="test", database_url=f"sqlite+aiosqlite:///{tmp_path}/missing/dir/x.db")
    container = build_container(bad, provider=MockProvider())
    try:
        r = await client_for(container).get("/ready")
        assert r.status_code == 503
        assert r.json()["checks"]["database"] == "error"
        assert "Traceback" not in r.text
    finally:
        await container.aclose()


async def test_ready_reports_unreachable_redis(make_container, client_for):
    container = make_container(redis_url="redis://127.0.0.1:1/0")
    r = await client_for(container).get("/ready")
    assert r.status_code == 503
    assert r.json()["checks"] == {"database": "ok", "redis": "error"}


async def test_ready_with_real_redis_when_available(make_container, client_for):
    import os

    import pytest

    url = os.environ.get("TEST_REDIS_URL")
    if not url:
        pytest.skip("set TEST_REDIS_URL to check readiness against a real Redis")
    r = await client_for(make_container(redis_url=url)).get("/ready")
    assert r.status_code == 200 and r.json()["checks"]["redis"] == "ok"


async def test_cors_only_for_configured_origins(make_container, client_for):
    client = client_for(make_container(cors_allowed_origins=["https://allowed.example"]))
    ok = await client.get("/health", headers={"Origin": "https://allowed.example"})
    assert ok.headers.get("access-control-allow-origin") == "https://allowed.example"
    other = await client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in other.headers
