# Phase 3 implementation state and rollout gate

This branch contains experimental, reviewable engine primitives. **Phase 3 is INCOMPLETE. Do not enable production multi-worker ownership or merge as a completed engine.**

## Implemented and tested locally

- Expand migration 0003: generation-aware steps/executions/approvals/effects/usage, persisted legacy keys, replay fields, checkpoints and failure limits.
- Exact permitted replay helpers; long inputs are retained or rejected, never truncated into executable arguments. Sensitive/unrecoverable legacy plans fail closed.
- Current-generation journal/approval reads with explicit historical step access.
- PostgreSQL LeaseStore and bounded reaper, database-time claims/fences/heartbeats, jittered retries and cancellation/deadline/poison decisions.
- Fenced write-ahead JournalStore with atomic model response/proposed batch/checkpoint/usage transaction primitives.
- Live-admin internal operator retry/rewind; copies final prefix preserving keys and execution associations, retains historical generations and failure evidence.
- Experimental bounded **internal/test pure-work** TaskRunner; no built-in kinds and no agent.run/business/external-effect registration. Independent heartbeat UoW dependency; no transaction spans compute.
- Local main 4/8/4 and separate bulk 2 slot allocator, claim order and exact customer inbound reservation under one process lock.

None of these engine components is connected to the existing API runtime or worker entry point. Existing approval HTTP calls still resume inline. Passing Phase 2 tests does not imply the new approval handoff contract is implemented.

## Transaction and lock rules

Production integration must use conversation -> task -> step/execution -> approval/effect locks. Scheduling rows are isolated. Current JournalStore and OperatorStore take task before step/approval/effect and never acquire a conversation lock afterwards. Claim/reaper only take task locks. Reply/conversation and full approval integration are still required.

A returned claim is valid only after commit. Plan/start commits before compute; completed response, batch and checkpoint commit together. Any lease loss or uncertain DB commit aborts local pure work. The new owner must inspect durable state; do not blindly repeat after an ambiguous commit. Heartbeat needs its own two-connection pool and a dedicated notification connection is still outstanding. A DB fence cannot unsend an HTTP request.

## Verification performed

See phase-3-progress.md for exact per-cycle results and source SHA. Locked installation used uv sync --frozen on Python 3.13.13; socksio==1.0.0 was added only to the disposable environment to support its proxy. The default migrated SQLite test suite and Ruff run locally. Test fences/fake claims are labelled as atomicity/local-reservation tests, not PostgreSQL locking proof. An existing aiosqlite thread/event-loop warning persists.

## Remaining implementation blockers

1. Connect one full TaskRunner to immediate API and background worker with typed supported agent/internal kinds, live requester checks, write-ahead model recovery and safe escalation.
2. Fence runtime state/result, executor execution/usage, reply/deliver gate and every ledger reservation/outcome. Handle absent ledger-row races and complete reconciliation/resolution APIs.
3. Atomic approval creation/wait and authorized decision/queue handoff; remove inline HTTP resume; durable expiry denial, time/human signals, active deadlines and signal redelivery across rewind.
4. Reaper transition log/audit/outbox/fallback/child cascade, pending-effect-to-unknown cancellation, poison-row quarantine and unclaimable/version-retirement checks.
5. Complete schema: schedules/signals/worker registry, task events, active deadlines, coalescing and guarded retention. Migration 0004 widens journal lease tokens to match task bigint and guards narrowing rollback.
6. Scheduler timezone cron wrapper, atomic materialization/advance, release/rollback-only sync and supported internal jobs; no RAG/business schedules.
7. LISTEN/NOTIFY + polling, full soft global caps/provider limits, actual worker lifecycle, operations/metrics from API when workers are down, authenticated operator APIs and internal fixed Persian fallback with deliver gating.

## External verification gates (not run)

Use isolated PostgreSQL 16 and Redis 7; never the production MariaDB database. The test fixture TRUNCATES its database. No installed service binaries or configured URLs existed in this execution environment.

```sh
cd aromin-agent
uv sync --frozen
TEST_DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@localhost:5432/DISPOSABLE_TEST_DB \
TEST_REDIS_URL=redis://localhost:6379/0 uv run pytest -q -ra
uv run ruff check .
uv run ruff format --check .
```

Required after full integration: populated 0001 -> 0002 -> 0003 PostgreSQL migration/trigger/schema comparison and guarded rollback; real separate-process kill/freeze/commit-ambiguity tests; 4 workers x 2,000 tasks; 3 schedulers x 100 slots; bulk and customer reserve stress; Redis/PG outage, approval/cancel/rewind races, authenticated smoke and latency percentiles. No fabricated process or benchmark results.

## Rollout preflight

Drain old API owners before introducing fenced workers. Old binaries write without fencing and cannot coexist as owners. Retain historical rows, keys and effects. Legacy exact replay_input is intentionally NULL; never reconstruct it from audit previews. Resume only independently verified complete inputs with stable keys; otherwise park for explicit operator recovery. Uncertain effects must be reconciled/resolved first. Use compatible code with expanded schema for rollback; migration 0003 refuses evidence-losing downgrade.

Cloud Assistant v3.9.38/MariaDB code stays separate. No main merge, deployment, Telegram publication, real external provider action or Phase 4/RAG work was performed.
