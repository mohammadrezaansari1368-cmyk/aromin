# Phase 3 readiness review

Reviewed 2026-10-02. Source commit: `3a2618a01f6b15e573ca9b5697220d0734ee8268`.
Repository: `mohammadrezaansari1368-cmyk/aromin`; branch: `claude/beautiful-wright-11tlw5`; PR #1 open and unmerged at review. No changes since the previous review. No tracked AGENTS.md or CLAUDE.md found.

**Outcome:** Phase 2 is a useful baseline; it is not a durable multi-worker engine. This deliverable is a code review and implementation specification, not a Phase 3 implementation or production approval. No Arena tournament was run.

## Baseline evidence

Fresh checkout, Python 3.12.14, `uv sync --frozen` succeeded. Initial SQLite run: 178 passed, 12 failed, 3 skipped (193 collected). All 12 failures were HTTPX client initialization errors caused by the environment's SOCKS proxy and missing optional `socksio` dependency. Installed `socksio==1.0.0` in the disposable virtual environment only; repository dependencies and lock file unchanged. See `phase-3-validation.txt` for the rerun result.

`ruff check .`: passed. `ruff format --check .`: 109 files already formatted.
No Docker/PostgreSQL/Redis executable found on PATH, no PostgreSQL installation at `/usr/lib/postgresql`, no configured TEST_DATABASE_URL/TEST_REDIS_URL, and no listener on localhost ports 5432/6379. Real infrastructure, migration down/up, multi-worker, crash and benchmark results are **not verified in this review**. The historical 193-pass PostgreSQL result is not reproduced evidence.

## Code-to-spec gap map

Paths below are relative to `aromin-agent/`.

| Reference | Existing implementation / evidence | Required change and proof |
|---|---|---|
| 9.1 intake | `app/agent/runtime.py::_intake` stores message, task and event in one UoW | Preserve atomicity; kill API after commit and recover without client retry |
| 9.2 schema | `models/task.py` already has lane, mode, lease token, dedupe key and conversation key | Extend existing tables; preserve row IDs and legacy effect keys |
| 9.3 transitions | `tasks/engine.py::ALLOWED_TRANSITIONS`, migration 0001 trigger | Extend transition effects/guards and test every prohibited pair; do not rename `dead` |
| 9.4 worker | `workers/__main__.py` exits 2; no claim loop | SKIP LOCKED claim, heartbeat, reaper, version registry, notification + polling |
| 9.4 fencing | Runtime `_save_state`, `_complete`, `_record_model_call` lock by ID without owner/token condition | Fence all journal/state/result/usage/effect writes; frozen old owner must write zero rows |
| 9.5 lanes | Lane 0 set for immediate turns; no worker reservations | Implement 4/8/4 main slots, 2 inbound-reserved customer slots, separate 2-slot bulk worker; test under load |
| 9.6 journal | Model step inserted after provider call; no generation or state_after; tool steps precede handlers | Write-ahead model/tool plans; atomic completion and state_after; durable cursor; replay completed steps without new model decision |
| 9.6 replay payload | `tools/executor.py::sanitize_args` truncates strings to 500 chars/lists to 50; `resume_step` reads that preview | Separate exact replay-safe payload from redacted audit preview; reject/recover unsupported sensitive inputs without persisting secrets |
| 9.7 keys | `step_idempotency_key(task_id, step_no)` recomputed; key stored on execution, not step | Persist generation-aware key once; retain legacy keys unchanged during migration/retry |
| 9.7 ledger | `tools/ledger.py::perform` has pending/unknown reconciliation; `_mark` has no fencing | Fence reservation and transitions; handle absent-row insert race; never assume DB fencing prevents an already issued external request |
| 9.8 retry | Tool exponential sleep, no jitter; runtime failures terminal | Classified step/task retry, jitter, budgets/deadline, breaker; non-idempotent unknown outcome never blind retry |
| 9.9 deadlines | Runtime monotonic limit restarts on resume; no durable task enforcement | Separate inline escalation from hard task budget; durable absolute/active deadlines and wait TTL |
| 9.10 cancel | Running flag; queued/waiting cancel; repeated cancelled call raises TaskFinished | Idempotent cancel; child cascade; interrupt pure work; finish/record in-flight effect; reaper honors cancel first |
| 9.11 approval | Route calls `collect(runtime.resume(...))`; service decision commit precedes resume | Decision + runnable task + audit/outbox atomic; HTTP returns without tool execution |
| 9.11 wait atomicity | Executor approval creation and runtime `_wait_for_approval` use separate commits | Commit planned step, approval, task waiting state and event together; kill between former boundaries |
| 9.12 schedule | No schedules or scheduler | Atomic materialization/advance, unique slot key, skip/coalesce, release-time sync, rollback test |
| 9.13 dead/retry | `dead` exists but no worker poison detection/rewind | Failure thresholds, generation rewind, retained evidence, operator resolution, internal fallback |
| 9.14 conversation | Running unique index; active/waiting intake returns 409 | Attach/adopt/deliver gate, one execution owner and coherent answer; future-run_at must not be adopted |
| 9.15 kinds | `agent.run` constant, no durable kind registry | Typed versioned kinds; test-only internal kinds; no real business integrations |
| 9.16 metrics | Structured logging and LLM usage exist | SQL queue/liveness gauges from API and workers; no sensitive payload logs |
| 9.17 operations | Compose skeleton; no real worker lifecycle | Graceful release, bulk isolation, release sync, retention/FK safety |
| 9.18 failure cases | Phase 2 tests cover tool/policy/approval behavior | New process-level fault injection matrix in specification; SQLite cannot establish PG locking correctness |
| 9.19 follow-up | Current ToolContext is read-only; step/execution uniqueness excludes generation | Extend without creating unrestricted DB access; migrate related keys/FKs coherently |

## Conflicts resolved for the implementation handoff

1. Owner's phase order is Task Engine now, RAG next. Blueprint §20 calls these phases 4 and 3 respectively. Keep source references unchanged; document numbering locally.
2. PostgreSQL is the durable queue. Redis is not a second durable queue. Four lanes are interactive/customer/default/bulk, not a scheduled/recovery queue split. Priority is lane reservation with FIFO within lane, not arbitrary numeric priority.
3. Immediate API execution is allowed through the SAME leased runner. Only background work and approval resume must be worker-hosted. An always-enqueue architecture would deviate from §9.1.
4. Task states remain queued/running/waiting/succeeded/failed/cancelled/dead. Do not add pending/dead_letter merely to match older prose.
5. Reference §9.10 says cancelled approvals become expired; Phase 2 explicitly records cancelled. Preserve `cancelled` and document this compatibility deviation.
6. Reference §9.9/9.11 lets expired approval return to the model; Phase 2 currently fails its task. Proposed Phase 3 behavior: durable expiry wake + denial result, never execute expired tool. Update affected contract tests explicitly; do not claim every exact old assertion remains unchanged.
7. Reference §9.19 proposes ctx.db; current security contract prohibits raw DB sessions in tools. Use a narrow scoped write facade backed by the runner's fenced UoW for internal writes, with atomic commit; never expose arbitrary SQL.
8. Phase 2 redacted/truncated input is not a durable executable plan. Preserve audit redaction while storing only permitted exact replay data or stable server-controlled references. Never reconstruct truncated legacy input as if exact.
9. Reference mentions two step types but also a journaled wait step. Keep model_call/tool_call schema compatibility and encode waits as explicit checkpoint/signal records; document that mapping rather than silently adding an inconsistent type.
10. Domain-specific SMS/CRM/handoff, ingestion, real webhooks and visitor authentication remain deferred. Exercise their failure patterns with deterministic internal/fake adapters. Internal fallback may post a fixed Persian message and an operator-review event; it must not promise that a salesperson has been assigned.
11. Approval decision responses become asynchronous. Preserve readable fields where possible, return queued/waiting state and no fabricated completed message. Poll task/conversation endpoints; SSE transport and website integration are deferred, explicitly departing from the full §9.14 delivery UI.

## Highest-risk observations

These are code-inspection findings, not reproduced production incidents. Missing fencing is a blocker to adding multiple execution owners. Missing exact replay payload and model start journal are blockers to reliable recovery. Approval creation/wait and decision/resume split transactions expose crash windows. Existing ledger safety intent is good but not sufficient for concurrent workers. Current tests passing do not prove any of these Phase 3 properties.

Use [the implementation specification](phase-3-specification.md) and [the executable handoff prompt](phase-3-implementation-prompt.md) together.
