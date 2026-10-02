# Phase 3 implementation specification

Status: proposed implementation contract from the 2026-10-02 code review. No implementation is included. Reference: repository-root `docs/aromin-ai-task-engine.md` §§9.1–9.19. Compatibility choices and exclusions: `phase-3-readiness.md`.

## Invariants and transaction boundaries

| Operation | Atomic database boundary / invariant |
|---|---|
| Intake | Conversation lock; dedupe message; insert message and task or attach to owner; audit/outbox together. API success follows commit. |
| Claim | Lock eligible row with SKIP LOCKED; due time/version/lane/concurrency checks; increment token and attempt; set lease from database time. One running owner per concurrency key. |
| Heartbeat | Match task, owner, token, running status and unexpired lease. Zero rows means LeaseLost; stop execution. Never resurrect expired lease. |
| Step plan | Fence/lock task; check cancellation/deadline; allocate stable step number and key; persist exact permitted inputs and version before handler. |
| Model completion | Fence; persist complete response/tool proposal, usage and state checkpoint together. A committed proposal is never regenerated on recovery. |
| Internal write | Narrow write facade uses same fenced transaction as journal completion and state_after; tool business integrity error rolls back its savepoint, not the whole task. |
| External effect | Fenced intent reservation commits BEFORE external call. No DB transaction spans network I/O. Fenced outcome commit follows. Lost owner cannot overwrite ledger. Uncertain provider outcome enters reconciliation, then unknown/human review if unresolved. |
| Approval wait | Step + approval + waiting task + released lease + outbox in one transaction. |
| Approval decision | Authorized decision + matching waiting task to queued + cleared wait kind + deadline + audit/outbox/notify in one transaction. Identical repeat must not enqueue twice; conflicting repeat returns conflict. |
| Reply | Conversation lock and fenced task lock; deliver gate against user sequence; message + answered-through sequence + task state + event atomic. |
| Retry/reap | Lock/fence owner, honor cancel first, classify failure, update counters/run_at or terminal status, insert deduped internal fallback atomically. |
| Scheduler | Lock due schedule; insert unique slot task and advance next_run_at together. Notification is a hint, never the only durable handoff. |
| Operator rewind | Lock failed/dead task; new generation, copied completed prefix retaining keys, restored state_after, reset eligible signals and counters atomically. |

Use short transactions and a documented global lock order (conversation, task, step/execution, approval/effect, with scheduling rows isolated). Approval paths must acquire locks in that order rather than the current approval-then-task order. Reaper paths must not acquire conversation locks after holding task locks; create a fallback task and defer reply work. Prove the order under cancel/approve/reaper races.

Fencing applies to state, journal, execution records, authoritative usage, result, message delivery and ledger transitions—not just task status. No worker credential replaces the original requester; re-resolve live permissions on claim/resume and before each tool. Revoked credentials deny even tools with no required permission. No DB lease can recall an HTTP request already sent: provider idempotency or reconciliation remains mandatory.

## Execution and recovery

- One runner shared by immediate API and background worker. Background approval continuation never executes in the HTTP handler.
- PostgreSQL queue, LISTEN/NOTIFY with polling fallback. Database time for coordination; UTC timestamps, zoneinfo for schedule timezone.
- Lease 60s, heartbeat 15s, reaper 15s per reference; separate heartbeat connection capacity. Lease loss aborts pure work and prevents further writes.
- Main worker slots: 4 interactive, 8 customer, 4 default; customer reserve keeps at least 2 idle or inbound slots per replica. Separate bulk process has 2 slots. FIFO by run_at, deterministic tie break; capped kinds skipped. Global per-kind counts are soft caps as the reference states, not hard distributed guarantees.
- Journal persisted before each model/tool call. Completed steps replay from checkpoint. Pure interrupted calls may repeat; model billing after a crash may be unknowable—record this limitation rather than promising exact billing.
- Distinguish 25s/6-step inline escalation from hard task budgets. Preserve Phase 2 tool/security limits with explicitly updated configuration and tests where asynchronous semantics change.
- Retries follow §9.8 classification and lane backoff, with jitter and configured maximum attempts/elapsed time. Waits, clean releases and dependency outage do not consume poison-failure counters. Respect absolute versus re-armed active deadlines.
- Reaper handles expired leases, cancellation, crash loops, unsupported versions and poisoned batches. Retry a failed batch row-by-row so one bad row cannot block unrelated recovery.
- Waiting approval/human/time states release execution capacity. Unknown effect requires dedicated resolution; generic resume cannot assert an effect was sent.
- Cancel is idempotent for already-cancelled tasks; terminal succeeded/failed/dead remains conflict. Prevent new steps after cancellation; finish bounded in-flight noncancellable work and record effects_completed.
- Schedule sync runs in release/rollback job, never worker startup. Implement skip/coalesce and overlap skip, advance beyond all missed slots in one tick. Register only supported maintenance/internal jobs; no KB/SMS/business schedules.
- Fallback has no recursive fallback; posts only an internal fixed Persian result and review event, gated against newer answers. No real notification, handoff assignment or SMS.
- SIGTERM stops claims/scheduler, releases tasks at safe boundaries without counting failure, and leaves unreleased leases recoverable.

## Replay and migration contract

Add migration 0003 after 0002; never rewrite applied migrations. Extend existing tables rather than replacing identifiers. Add generation, persisted step key, owner/fencing metadata, attempt/error/timing/checkpoint fields, deadline/recovery fields, signals, schedules and worker registry as required by §9.2. Preserve audit history and existing messages.

For new steps use SHA-256 truncated to 32 hex characters over an unambiguous canonical JSON array `[task_id,generation,step_no]` encoded UTF-8 with fixed separators. Store the key once. This is an explicit encoding of the reference's concatenation notation. Never include retry attempt. Backfill legacy steps with their existing execution key, never recompute effect keys. Copied completed prefix steps retain original keys. New planned steps after rewind use the new generation. Avoid a uniqueness rule that rejects copied journal prefixes or duplicates the historical execution record.

Generation must participate consistently in journal/execution/approval lookup and pending-approval uniqueness. Preserve legacy execution IDs and associations. Backfill generation 0 and preserve Phase 2 step statuses in the first migration; normalize reference status names in runner logic. Audit preview remains sanitized. Replay data is exact permitted input in protected storage, or a stable server-side reference. Sensitive/unrecoverable plans fail closed with a documented operator path; no silent replay of redacted/truncated arguments.

Drain old API instances before enabling new runner ownership; old binaries have unfenced writes and are not safe concurrent owners. Keep completed rows as history. Preflight active legacy tasks: resume only plans with verifiable complete input and stable keys, otherwise park for operator review. Do not infer originals from truncated previews. Preserve legacy waiting approvals and revalidate their task/step/requester binding.

Test populated 0001 → 0002 → 0003 with messages, approvals, usage, executions and effect records. Check row IDs, hashes and keys. Test fresh upgrade/down/upgrade on disposable PostgreSQL. A downgrade that cannot represent new generations/schedules must refuse with an explicit guard rather than drop evidence; production rollback uses compatible code/expanded schema, not blind destructive downgrade. Check FK retention for approvals/messages and unresolved effects before implementing pruning.

## Planned change locations

All paths relative to aromin-agent/; root docs remain reference-only.

| Area | Files |
|---|---|
| Runner | app/tasks/engine.py; new runner.py, claim.py, lanes.py, reaper.py, scheduler.py, schedules.py, kinds/ |
| Worker | app/workers/__main__.py; lifecycle/heartbeat modules as needed |
| Storage | app/models/task.py, tooling.py; repositories/tasks.py, tooling.py; new schedule/signal/registry models and repositories; db/uow.py; migrations/versions/0003_*.py |
| Integration | app/agent/runtime.py; tools/executor.py, ledger.py, spec.py; services/approvals.py; API tasks/approvals/schemas; core/container.py, config.py |
| Operations | app/cli.py, docker-compose.yml, .env.example; dependency files only if needed |
| Verification | tests/test_task_*.py, process-level integration fixtures, benchmark script; docs/task-engine.md, docs/api.md, README.md |

Add authenticated task submission/list/retry/resolve/resume and effect-resolution APIs only with validated typed kinds and explicit permissions. Do not let callers choose actor, lease, raw handler or scope fields. Preserve current read/steps/cancel routes. Fix pending_approval_id rendering to check wait_kind='approval' rather than treating every wait_ref as an approval.

## Failure-oriented acceptance matrix

All entries below are FUTURE tests, not results of this review. Use fake providers with durable receipt storage in separate processes where crash ambiguity matters.

| Test | Required assertion |
|---|---|
| API kill before/after intake commit | No orphan message before commit; committed task recovered without client retry |
| Kill before/after step start, provider call and completion commit | Correct checkpoint resume; no lost committed result; safe effect reconciliation |
| Two processes claim same task | Exactly one valid owner; unrelated tasks progress |
| Freeze owner, expire/reclaim, unfreeze | Old owner cannot heartbeat, save state/step/usage/reply or ledger result |
| Concurrent absent ledger row reservation | One intent wins; loser cannot call provider blindly |
| Unknown DB commit | Stop local execution; re-read durable state after reclaim |
| Approved/rejected/expired/cancelled and duplicate decisions | Single transition, policy preserved, no HTTP execution or duplicate tool |
| Crash after approval commit | Worker resumes without second approval request |
| Revoke requester before/during resume | All subsequent tools denied, including permission-free tools |
| Long/list inputs; sensitive and legacy truncated inputs | Exact safe replay or explicit refusal; no corrupted argument execution |
| Transient/permanent/unknown/dependency outage | Correct classification; bounded retries; no blind unsafe resend |
| Retry deadline and budget across restart/wait | Limits retained; absolute deadlines not extended; active wait semantics correct |
| Cancel queued/running/waiting/backoff + kill | Durable cancellation, no new step; pending approval cancelled; no resurrection |
| Fan-out cancel during final batch | Committed late children also cancelled; no grandchild support implied |
| Poison task and bad reaper row | Threshold dead; healthy tasks still recovered; evidence retained |
| 4 worker processes × 2,000 tasks | One committed logical completion per task, ownership and effect receipts checked |
| 3 schedulers × 100 slots | Exactly 100 materialized tasks, atomic slot advancement |
| Schedule skip/coalesce/overlap/rollback | Correct next slot; no duplicate or stale schedule re-enablement |
| 20,000 bulk + customer work | Bulk isolation maintained; main workers responsive |
| 600 due outbound + 40 long interactive + inbound | Inbound claim <2s in documented local test environment; reserve never undercut |
| Redis outage | Tasks/results survive; progress can degrade; provider limits fail safely |
| PostgreSQL outage | No success before durable commit; no fresh external action without valid durable intent |
| Concurrent message/reply/fallback | One active execution; no uncovered message marked answered; no stale apology |
| Future-run_at or unsupported-version ADOPT | No early execution or unsupported claim |
| Rewind generation | Prefix unchanged, keys retained, new suffix distinct, signals re-delivered as intended |
| SIGTERM then restart | No new claims after shutdown; no corruption or false poison increment |
| All workers stopped | API-side SQL liveness/lag still signals stalled queue |
| Migration fixtures and invalid state pairs | Data preserved; illegal transitions rejected by PostgreSQL trigger |

Run existing tests on SQLite and PostgreSQL 16/Redis 7. Asynchronous approval, expiration and intake tests must be consciously adapted to new contracts, retaining security assertions. Report each change rather than weakening tests for green output. Multi-worker and crash verification requires actual processes and PostgreSQL; mocks are not evidence of locking correctness.

Record benchmark machine/configuration, worker counts, task mix and p50/p95 enqueue, claim, startup and completion latency plus queue depth. No fabricated performance numbers. Phase 3 remains incomplete if required real-infrastructure gates cannot run.

## Remaining decisions / explicit limits

Choose and verify a maintained timezone-aware cron dependency during implementation. Business-hours calendar for human review is not specified; keep it configurable and do not invent holidays. Sensitive durable input encryption is deferred: reject unsupported recovery safely. Provider dedupe/lookup remains unverified and no real adapter is authorized. SSE, staff/visitor tokens, full tracing, real outbound webhooks and domain integrations are deferred. Validate the scoped write facade and reference status mappings in the first implementation review.
