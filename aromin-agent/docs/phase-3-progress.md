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
