# Phase 3 implementation checkpoint — 2026-10-02

Status: INCOMPLETE / real PostgreSQL verification blocked.

Implemented an isolated LeaseStore prototype in app/tasks/claim.py using SQLAlchemy (no raw application SQL): queued-task SKIP LOCKED claim, supported kind/version and lane filtering, concurrency-key exclusion backed by the existing unique index, lease token increment, live-owner lock, non-reviving heartbeat and cancellation-aware release. It is NOT wired to the runtime or a worker. Release is a low-level primitive; full audit/outbox/child-cascade behavior remains future integration work.

Added tests/test_task_leases.py: SQLite rejection executes locally; concurrent claim, expiry rejection, stale-token rejection and cancelled release tests require PostgreSQL. These are async database-client tests, not the required separate-process crash tests.

The initial raw-SQL prototype failed the existing security guard. It was rewritten using SQLAlchemy without relaxing that guard.

Infrastructure attempt: apt-get update/install postgresql-16 redis-server failed with setgroups/setegid/seteuid Operation not permitted/Invalid argument in this execution environment. No PostgreSQL or Redis was installed. No attempt was made to bypass the environment restriction.

Still required: real PostgreSQL validation of these queries, migration and journal, shared runner and worker, fencing integration for every write, recovery/retry, approval handoff, scheduling, fairness, operations and full failure matrix. No Phase 3 completion, worker functionality or production readiness is claimed.

To validate the first slice in a permitted isolated environment:

```bash
cd aromin-agent
uv sync --frozen
TEST_DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@localhost:5432/DEDICATED_TEST_DB \
TEST_REDIS_URL=redis://localhost:6379/0 uv run pytest -q -ra
```

The test fixture truncates the database: use a dedicated disposable test database only. Next step is executing the PostgreSQL tests before connecting the primitives to runtime execution.


## Continuation checkpoint — 2026-10-03

Added the next recovery slice on the existing implementation branch:

- `app/tasks/reaper.py`: bounded PostgreSQL-only expired-lease reaper using `FOR UPDATE SKIP LOCKED`.
- Cancellation takes precedence over retry.
- Expired ownership is cleared durably; a subsequent claim increments the fencing token, so the old owner cannot heartbeat or perform fenced writes.
- Consecutive expired-owner failures are counted and a configurable threshold moves crash-looping tasks to `dead`.
- The reaper does not execute tasks and does not use Redis as durable state.
- `tests/test_task_reaper.py` covers requeue/reclaim, stale-token fencing, cancellation precedence, crash-loop-to-dead, and live-lease exclusion.

Commits:
- `8b54e8cf41c5f8fa87ef79bb01f50e8272e8cb3c` — reaper implementation.
- `60439853e2705883cb8a2ad3473eb9cce45fb72f` — recovery tests.

Verification status: **BLOCKED on real PostgreSQL in this chat environment.** These tests intentionally skip outside PostgreSQL and must not be counted as proof until run against PostgreSQL 16. No test result is fabricated.

Next implementation priorities:
1. migration 0003 / generation-aware durable journal,
2. shared fenced TaskRunner and worker lifecycle/heartbeat,
3. change approval decision from inline `runtime.resume()` to atomic waiting→queued durable handoff,
4. integrate fencing into journal/state/usage/reply/effect writes,
5. retry classification and reaper audit/outbox integration,
6. scheduler/lane fairness/process-level crash verification.

Cloud Assistant v3.9.38 remains a separate channel/adapter system. Its MariaDB/Telegram/Composio implementation is not copied into the standalone Task Engine. Future integration remains through the agent API / assistant provider boundary, and Telegram publication must continue through its existing approval gateway rather than direct agent calls.

Phase 3 status remains: **INCOMPLETE**.
