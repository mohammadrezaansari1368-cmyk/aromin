"""Static guards: no arbitrary SQL in application code, no secrets in the repository."""

import re
from pathlib import Path

import pytest
from pydantic import BaseModel

from app.core.errors import Forbidden
from app.security.permissions import permissions_for
from app.security.rate_limit import InMemoryRateLimiter
from app.tools.registry import ToolError, ToolRegistry
from app.tools.spec import ToolContext, ToolSpec

ROOT = Path(__file__).resolve().parents[1]
RAW_SQL_ALLOWLIST = {"app/db/health.py"}  # fixed SELECT 1, no input


def test_no_raw_sql_in_application_code():
    pattern = re.compile(r"\btext\(|exec_driver_sql|\.execute\(\s*[\"']|cursor\(\)")
    offenders = []
    for path in (ROOT / "app").rglob("*.py"):
        rel = path.relative_to(ROOT).as_posix()
        if rel in RAW_SQL_ALLOWLIST:
            continue
        for n, line in enumerate(path.read_text().splitlines(), 1):
            if pattern.search(line) and "sqlite_where" not in line and "postgresql_where" not in line:
                if rel == "app/db/session.py" and ("PRAGMA" in line or "cursor()" in line):
                    continue  # SQLite connection pragmas: constant strings, no input
                offenders.append(f"{rel}:{n}: {line.strip()}")
    assert offenders == []


def test_no_hardcoded_secrets_in_repository():
    suspicious = re.compile(r"(sk-[A-Za-z0-9]{16,}|ak_(live|prod)_[A-Za-z0-9_\-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY)")
    hits = []
    for path in ROOT.rglob("*"):
        if path.is_dir() or any(part in {".venv", ".git", "__pycache__", ".pytest_cache"} for part in path.parts):
            continue
        if path.suffix in {".py", ".md", ".toml", ".ini", ".yml", ".yaml", ".example", ".txt", ""}:
            text = path.read_text(errors="ignore")
            hits += [f"{path.name}: {m.group(0)[:12]}…" for m in suspicious.finditer(text)]
    assert hits == []


def test_env_example_has_no_real_values():
    for line in (ROOT / ".env.example").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            if re.search(r"(_KEY|SECRET|PASSWORD|_TOKEN)$", key):
                assert value.split("#")[0].strip() == "", f"{key} must be empty in .env.example"


def test_role_permissions():
    assert "chat:write" in permissions_for(["service"])
    assert permissions_for(["salesperson"]) == {"conversation:read"}
    assert permissions_for(["visitor"]) == frozenset()
    assert permissions_for(["not-a-role"]) == frozenset()
    assert "admin" in permissions_for(["admin"])


async def test_in_memory_rate_limiter_token_bucket():
    limiter = InMemoryRateLimiter()
    results = [await limiter.hit("k", capacity=3, per_seconds=60) for _ in range(4)]
    assert [r.allowed for r in results] == [True, True, True, False]
    assert results[-1].retry_after_s > 0
    assert (await limiter.hit("other", capacity=3, per_seconds=60)).allowed


class EchoIn(BaseModel):
    text: str


class EchoOut(BaseModel):
    text: str


async def _echo(ctx: ToolContext, args: EchoIn) -> EchoOut:
    return EchoOut(text=f"{ctx.conversation_id}:{args.text}")


async def test_tool_registry_validates_and_checks_permissions():
    registry = ToolRegistry()
    spec = ToolSpec(
        name="test.echo", description="echo", input_model=EchoIn, output_model=EchoOut,
        permissions=frozenset({"conversation:read"}), handler=_echo,
    )  # fmt: skip
    registry.register(spec)
    with pytest.raises(ValueError):
        registry.register(spec)
    ctx = ToolContext(actor_id="a", permissions=frozenset({"conversation:read"}), conversation_id="conv_1")
    assert await registry.execute("test.echo", {"text": "hi"}, ctx) == {"text": "conv_1:hi"}
    with pytest.raises(ToolError):
        await registry.execute("test.echo", {"wrong": 1}, ctx)
    with pytest.raises(ToolError):
        await registry.execute("missing.tool", {}, ctx)
    with pytest.raises(Forbidden):
        await registry.execute("test.echo", {"text": "hi"}, ToolContext(actor_id="a", permissions=frozenset()))
    assert registry.allowed({"test.echo", "other.tool"}) == [spec]
