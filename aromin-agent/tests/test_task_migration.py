"""Populated legacy upgrade, generation isolation and guarded rollback on SQLite.

PostgreSQL migration concurrency/trigger verification remains a separate gate.
"""

import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[1]


def config(path):
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{path}")
    cfg.attributes["configure_logger"] = False
    return cfg


def seed(conn, table, **values):
    """Supply legacy NOT NULL columns; fixtures never depend on new ORM columns."""
    for _, name, kind, required, default, _ in conn.execute(f"PRAGMA table_info({table})"):
        if required and default is None and name not in values:
            values[name] = 0 if any(t in kind for t in ("INT", "NUM", "BOOL")) else "{}"
    cols = ",".join(values)
    marks = ",".join("?" for _ in values)
    conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", tuple(values.values()))  # noqa: S608 -- fixed fixture identifiers


def test_legacy_upgrade_preserves_keys_and_ids(tmp_path):
    path = tmp_path / "legacy.db"
    cfg = config(path)
    command.upgrade(cfg, "0002")
    with sqlite3.connect(path) as conn:
        seed(
            conn,
            "tasks",
            id="task_old",
            kind="agent.run",
            lane=0,
            mode="background",
            status="queued",
            input="{}",
            state='{"v":1}',
        )
        seed(
            conn,
            "tool_executions",
            id="exec_old",
            task_id="task_old",
            step_no=1,
            tool_name="test.echo",
            output_status="succeeded",
            idempotency_key="legacy-key",
            error_type=None,
        )
        seed(
            conn,
            "task_steps",
            id="step_old",
            task_id="task_old",
            step_no=1,
            type="tool_call",
            name="test.echo",
            status="succeeded",
            execution_id="exec_old",
            input='{"text":"preview"}',
        )
        seed(
            conn,
            "side_effects",
            idempotency_key="legacy-key",
            task_id="task_old",
            step_no=1,
            kind="test.echo",
            request_hash="unchanged",
            status="succeeded",
        )
        seed(conn, "approvals", id="apr_old", task_id="task_old", step_no=1, status="pending")
        seed(conn, "llm_usage", id="usage_old", task_id="task_old", step_no=1, status="succeeded")
    command.upgrade(cfg, "head")
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT id,generation,idempotency_key,replay_input FROM task_steps").fetchone() == (
            "step_old",
            0,
            "legacy-key",
            None,
        )
        assert conn.execute("SELECT idempotency_key,request_hash,generation FROM side_effects").fetchone() == (
            "legacy-key",
            "unchanged",
            0,
        )
        assert conn.execute("SELECT id,generation FROM approvals").fetchone() == ("apr_old", 0)
        assert conn.execute("SELECT id,generation FROM llm_usage").fetchone() == ("usage_old", 0)
        assert conn.execute("SELECT state,initial_state FROM tasks").fetchone() == ('{"v":1}', "{}")
        seed(
            conn,
            "task_steps",
            id="step_new",
            task_id="task_old",
            generation=1,
            step_no=1,
            type="tool_call",
            name="test.echo",
            status="pending",
        )
    with pytest.raises(RuntimeError, match="nonzero journal generation"):
        command.downgrade(cfg, "0002")
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT count(*) FROM task_steps").fetchone()[0] == 2


def test_empty_database_upgrade_down_upgrade(tmp_path):
    cfg = config(tmp_path / "fresh.db")
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "0002")
    command.upgrade(cfg, "head")


def test_bigint_journal_token_cannot_be_narrowed(tmp_path):
    path = tmp_path / "wide-token.db"
    cfg = config(path)
    command.upgrade(cfg, "head")
    with sqlite3.connect(path) as conn:
        seed(conn, "tasks", id="task_wide", kind="test.noop", lane=0, mode="background", status="queued")
        seed(
            conn,
            "task_steps",
            id="step_wide",
            task_id="task_wide",
            generation=0,
            step_no=1,
            type="tool_call",
            name="test.noop",
            status="running",
            lease_token=2147483648,
        )
    with pytest.raises(RuntimeError, match="integer range"):
        command.downgrade(cfg, "0003")
    with sqlite3.connect(path) as conn:
        assert conn.execute("SELECT lease_token FROM task_steps").fetchone()[0] == 2147483648
