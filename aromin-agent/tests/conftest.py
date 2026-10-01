"""Shared fixtures.

Default: every test gets its own SQLite database created by running the real Alembic
migrations (a migrated template file is copied per test). Set ``TEST_DATABASE_URL`` to a
PostgreSQL URL to run the same suite against PostgreSQL (tables are truncated per test).
"""

from __future__ import annotations

import io
import os
import shutil
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import httpx
import pytest
from alembic import command
from alembic.config import Config

from app.core.config import Settings
from app.core.container import Container, build_container
from app.core.logging import configure_logging
from app.main import create_app
from app.models import Base
from app.providers.base import LLMProvider
from app.providers.mock import MockProvider
from app.services.api_keys import ApiKeyService
from app.services.audit import AuditLogger

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PG_URL = os.environ.get("TEST_DATABASE_URL")


def run_migrations(url: str) -> None:
    cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def migrated_template(tmp_path_factory: pytest.TempPathFactory) -> str:
    if PG_URL:
        run_migrations(PG_URL)
        return PG_URL
    path = tmp_path_factory.mktemp("db") / "template.db"
    run_migrations(f"sqlite+aiosqlite:///{path}")
    return str(path)


@pytest.fixture
def database_url(migrated_template: str, tmp_path: Path) -> str:
    if PG_URL:
        _truncate_pg(PG_URL)
        return PG_URL
    target = tmp_path / "test.db"
    shutil.copy(migrated_template, target)
    return f"sqlite+aiosqlite:///{target}"


def _truncate_pg(url: str) -> None:
    import asyncio

    from sqlalchemy.ext.asyncio import create_async_engine

    async def _go() -> None:
        engine = create_async_engine(url)
        async with engine.begin() as conn:
            names = ", ".join(t.name for t in Base.metadata.sorted_tables if t.name != "audit_log")
            await conn.exec_driver_sql(f"TRUNCATE {names} CASCADE")
            # audit_log is append-only by trigger; disable it only for test cleanup
            await conn.exec_driver_sql("ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only")
            await conn.exec_driver_sql("TRUNCATE audit_log")
            await conn.exec_driver_sql("ALTER TABLE audit_log ENABLE TRIGGER audit_log_append_only")
        await engine.dispose()

    asyncio.run(_go())


@pytest.fixture
def log_stream() -> io.StringIO:
    stream = io.StringIO()
    configure_logging("DEBUG", "json", stream)
    return stream


@pytest.fixture
def settings(database_url: str) -> Settings:
    return Settings(
        _env_file=None,
        app_env="test",
        database_url=database_url,
        llm_provider="mock",
        llm_timeout_seconds=5,
        rate_limit_chat_per_minute=1000,
    )


@pytest.fixture
async def make_container(settings: Settings) -> AsyncIterator[Callable[..., Container]]:
    created: list[Container] = []

    def _make(provider: LLMProvider | None = None, **overrides) -> Container:
        s = Settings(_env_file=None, **{**settings.model_dump(), **overrides}) if overrides else settings
        container = build_container(s, provider=provider or MockProvider())
        created.append(container)
        return container

    yield _make
    for c in created:
        await c.aclose()


@pytest.fixture
async def container(make_container: Callable[..., Container]) -> Container:
    return make_container()


@pytest.fixture
async def client_for(log_stream: io.StringIO) -> AsyncIterator[Callable[[Container], httpx.AsyncClient]]:
    clients: list[httpx.AsyncClient] = []

    def _client(c: Container) -> httpx.AsyncClient:
        app = create_app(container=c)
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        )
        clients.append(client)
        return client

    yield _client
    for cl in clients:
        await cl.aclose()


@pytest.fixture
async def client(container: Container, client_for) -> httpx.AsyncClient:
    return client_for(container)


async def create_key(container: Container, roles: list[str]) -> str:
    service = ApiKeyService(container.uow_factory, AuditLogger(), "ak", "test")
    _, raw = await service.create("test-key", roles)
    return raw


@pytest.fixture
async def service_headers(container: Container) -> dict[str, str]:
    return {"Authorization": f"Bearer {await create_key(container, ['service'])}"}
