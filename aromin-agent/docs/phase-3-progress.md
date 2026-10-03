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

## Seven-cycle continuation — 2026-10-03

Source HEAD: d6f1e31a513f8a565d50b564ece6798dc897637d; PR #3, codex/phase-3-implementation.
Locked installation: uv sync --frozen, Python 3.13.13. socksio==1.0.0 added only to disposable venv for environment proxy. Baseline: 191 passed, 10 skipped, one existing aiosqlite thread/event-loop warning. PostgreSQL/Redis binaries unavailable; no locking/process/Redis proof claimed. All edits restricted to aromin-agent/.

### Cycle 1 — generation-aware expand migration

Added 0003 and matching ORM fields for task/journal/execution/approval/effect/usage generations, persisted keys, exact replay storage and checkpoints. Retained legacy IDs, execution associations and effect keys. Historical previews deliberately remain non-executable (replay_input NULL). Added populated 0002 upgrade preservation, cross-generation step collision and guarded downgrade tests; empty upgrade/down/upgrade test. No applied migration rewritten. Cleaned existing unused imports in reaper tests.

Validation: 193 passed, 10 skipped, one baseline warning; Ruff lint and format passed (119 files); git diff --check passed. SQLite migration proof only; populated PostgreSQL, triggers and separate-process locking remain blocked. This is an expand slice, not the full Phase 3 schema or runtime integration. Legacy initial_state stays empty because current state cannot safely reconstruct the initial checkpoint.
Next: scope journal reads to current generation and introduce exact replay/key contract.

### Cycle 2 — exact replay contract and generation-scoped reads

StepRepository current-generation get/list/pending and ApprovalRepository step lookup now use the task generation; explicit historical reads remain possible. Added canonical JSON-position keys with no attempt component and exact JSON roundtrip/size refusal; sensitive tool schemas and unsupported legacy previews fail closed. Existing Phase 2 key function remains unchanged to avoid silently rekeying historical effects. Helpers do not bypass ToolExecutor authorization/policy and are not yet runtime-connected.
Validation: 197 passed, 10 skipped, one baseline warning; Ruff lint/format and diff checks clean. Tests cover long Persian strings/lists without truncation, sensitive/legacy rejection, distinct generation keys and current/history read isolation.
Next: fenced write-ahead journal transactions before shared runner integration. Real PostgreSQL/Redis verification still blocked; Phase 3 INCOMPLETE.

### Cycle 3 — fenced write-ahead journal

Added JournalStore: owned-task fence before plan/start/completion, cancellation/deadline boundary checks, generation/key persistence, exact input fail-closed recovery, atomic response + tool batch + optional usage + state_after completion, reset of progress failure counters. Model proposal/batch agreement and call-ID uniqueness are checked; provider reasoning fields rejected. No tool dispatch or authority bypass. Tightened replay validation against non-JSON conversion and redaction-recognized sensitive input.
Validation: 203 passed, 11 skipped, one baseline warning; lint/format/diff checks clean. SQLite tests use an explicitly labelled test fence to prove transaction rollback/checkpoint/batch behavior only. Added real PostgreSQL stale-owner journal test; skipped here, not locking proof.
Next: classified durable retries and expiry accounting. Runtime/executor/ledger integration and real process tests remain outstanding; Phase 3 INCOMPLETE.

### Cycle 4 — classified retry and bounded expiry recovery

Added task-level RetryStore and pure decision contract: equal-jitter lane backoff, dependency outage without poison counters, cancellation precedence, absolute deadline failure rather than stranded expired queue rows, per-task consecutive/total/crash-expiry thresholds. Unsafe post-send timeout/408/5xx/malformed-outcome classification refuses automatic retry and requires reconciliation. Reaper now uses database time, delayed eligibility and all three poison counters. PostgreSQL test fixtures consciously advance delayed rows before reclaim; no timing bypass in production.
Validation: 217 passed, 11 skipped, one baseline warning; lint/format/diff clean. Classifier/deadline/jitter/crash/cancel tests executed; real expired-owner locking tests remain skipped. Reaper audit/outbox/fallback/child cascade and row-error isolation are still missing; it remains disconnected from production workers.
Next: operator generation rewind with prefix/key preservation and fail-closed legacy checkpoints. Phase 3 INCOMPLETE.

### Cycle 5 — operator generation rewind and wait rendering

Added internal OperatorStore with live admin API-key revalidation, failed/dead-only retry, absolute deadline preservation, uncertain-effect refusal and transactionally audited/outboxed requeue. Rewind requires a dense final prefix and real checkpoints; copies prefix with original keys/execution links and new step IDs, retains old generation and failure diagnosis, cancels stale pending approvals. No HTTP retry endpoint exposed yet; signal redelivery awaits signal schema. Fixed task read API to render pending_approval_id only for an approval wait.
Validation: 223 passed, 11 skipped, one baseline warning; lint/format/diff clean. Tests executed prefix checkpoint/key/history preservation, batch-boundary rejection, legacy failure rollback, revoked admin/unknown effect refusal and human/time/approval rendering. PostgreSQL operator race proof remains blocked.
Next: bounded shared pure-work runner with independent heartbeat dependency and safe recovery; do not register unfenced agent.run. Phase 3 INCOMPLETE.

### Cycle 6 — bounded leased pure-work runner

Added experimental TaskRunner for explicitly declared internal/test pure kinds only. It commits write-ahead start before compute, holds no DB transaction across compute, reuses persisted arguments on interrupted recovery, resumes completed checkpoints without regenerating work, enforces durable step budgets and supports safe-boundary shutdown. Independent heartbeat UoW is required; lost fence/uncertain DB commit aborts local work without an authoritative retry write. No built-in kinds, agent.run, business tools or external effects are enabled, and entry points remain disconnected until complete fencing/security/approval integration.
Validation: 228 passed, 12 skipped, one baseline warning; lint/format/diff clean. Test-fence runner recovery, changed-producer input, heartbeat abort and clean shutdown tests ran. Real PostgreSQL runner completion with a separate heartbeat engine added but skipped here; process-death and pool-capacity proof remain blocked.
Next: executable lane/reserve allocation, rollout safety checklist and final seven-cycle audit. Phase 3 INCOMPLETE.
