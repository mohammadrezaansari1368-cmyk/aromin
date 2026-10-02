# Codex master prompt — Phase 3 Durable Task Engine

Implement the Durable Task Engine in this repository. Do not start RAG or Phase 4.

## Start from verified code

Repository: https://github.com/mohammadrezaansari1368-cmyk/aromin
Phase 2 source branch: claude/beautiful-wright-11tlw5
Reviewed baseline SHA: 3a2618a01f6b15e573ca9b5697220d0734ee8268
The preparation documents may be on a descendant branch. Resolve the current PR/head before work; do not start from main unless it contains Phase 2. Read local AGENTS.md/CLAUDE.md if present. Preserve existing work and use an isolated implementation branch.

Read these documents completely before coding:
- docs/aromin-ai-task-engine.md (repository root)
- docs/aromin-ai-blueprint.md (repository root), especially §§3,6,9,14,17,20
- aromin-agent/docs/phase-3-readiness.md
- aromin-agent/docs/phase-3-specification.md
- aromin-agent/docs/phase-3-validation.txt

Read the actual runtime, executor, ledger, approvals, models, repositories, migrations and tests. Re-run the baseline at the current commit. The readiness report is an inspection, not proof of Phase 3 correctness.

## Contract

The phase order is Task Engine now, Knowledge/RAG next, notwithstanding Blueprint §20 numbering. The local specification records explicit compatibility decisions; follow those decisions where older generic prompts conflict. Do not silently redesign queue technology or broaden product scope.

Implement PostgreSQL-only durable queue/journal/schedules/effect ledger; SKIP LOCKED claims; LISTEN/NOTIFY plus polling; four lanes interactive/customer/default/bulk with FIFO and specified reservations. Redis remains progress/rate-limit coordination, never the source of durable tasks.

Keep queued/running/waiting/succeeded/failed/cancelled/dead states. Use one leased TaskRunner in API immediate and worker background hosts. Background tasks and approval continuation execute only in workers. API immediate turns escalate safely; a crashed API's no-tool turn must recover without client retry.

Implement the full transaction/invariant and recovery contract in phase-3-specification.md: generation-aware exact replay journal, fenced ownership and all authoritative writes, heartbeat/reaper, classified retry/jitter/deadlines/budgets, unknown-outcome reconciliation, durable waits/cancel, scheduler release sync, poison tasks, internal fallback, operator retry/rewind/resolution, conversation deliver gate and graceful shutdown.

Critical rules:
1. Persist a model/tool plan before execution; persist model response and tool batch before dispatching any proposed tool. Completed steps are never regenerated on recovery.
2. A step's persisted idempotency key never changes on retry or reclaim. Preserve existing legacy execution/effect keys. Attempt is not part of the key. Rewind copies completed prefix keys; new suffix uses new generation.
3. Redacted/truncated audit previews are not executable replay payloads. Use exact permitted input or stable scoped references. Unsupported sensitive or unrecoverable legacy plans fail closed; never store secrets or reconstruct missing arguments.
4. Fencing covers journal, result, state, usage, messages and ledger writes. Protect ledger insert races. Stale owners cannot overwrite new owners. Database fencing cannot unsend an external request.
5. Unknown external outcome must reconcile through provider dedupe/lookup or wait for explicit resolution; no blind resend or claim of magical exactly-once delivery.
6. All tools still pass schema → current authority → permission → policy → exact approval → idempotency. No privileged worker bypass; revoked requester denies every tool. Tools get scoped facades, never unrestricted SQL/session access.
7. Approval creation/wait and approval decision/queue handoff are atomic. HTTP decisions do not call runtime.resume inline. Cancellation records approval cancelled, preserving Phase 2 semantics. Expiration wakes a denied result as explicitly specified.
8. Lock order must be documented and consistent across intake, reply, cancellation, approval and recovery. Test races in separate processes.
9. Old unfenced binaries cannot own tasks alongside new workers. Provide drain/preflight/rollout instructions and an explicit legacy recovery plan.

## Scope and files

Modify only aromin-agent/. Root architecture documents remain reference-only. Reuse existing Phase 2 components; refactor only as required for durable execution. Follow the planned file map and migration plan.

No RAG, embeddings, web search, real LLM verification, SMS/WhatsApp, real webhook delivery, CRM, sales, website/dashboard integration or real business actions. Test external effects with fake adapters. Fallback is internal and must not imply real salesperson assignment. SSE and visitor-token work remain deferred as recorded in the specification. Do not register unsupported business schedules.

## Execution sequence

1. Record current baseline and requirement-to-file/test checklist.
2. Add safe expand migration and backfills, preserving IDs, journal and legacy effect keys.
3. Implement claim/fencing/heartbeat and shared write-ahead runner.
4. Connect runtime, ToolExecutor and ledger through the existing security pipeline.
5. Make approvals, waits and cancellation durable and asynchronous.
6. Add retry, recovery, dead-letter, rewind, scheduling and lane fairness.
7. Add operations, metrics, shutdown and release sync.
8. Execute the failure matrix, migrations, smoke test and benchmark; fix demonstrated failures.
9. Document exact commands, contract changes, rollout, limitations and final evidence.

Do not stop at scaffolding or a plan. Continue through implementation and verification. Do not merge or deploy. If an essential gate cannot run, report it as blocked and leave Phase 3 incomplete, with exact remaining command and reason.

## Required verification

Run existing unit/security tests and lint/format checks. Preserve assertions except documented API behavior changes; explain every changed old assertion.
Run real PostgreSQL 16 + Redis 7 integration tests and multiple actual worker processes. Cover every row of phase-3-specification.md's acceptance matrix, using durable fake receipts and kill/freeze barriers. Include 4 workers × 2,000 tasks, 3 schedulers × 100 slots, and specified lane reserve stress tests. Simulated exceptions alone are insufficient for process-crash proof.
Test populated 0001 → 0002 → new schema; fresh upgrade/down/upgrade on disposable PostgreSQL; schema/model consistency; fresh locked installation. Guard destructive/unrepresentable downgrade states explicitly.
Live smoke: authenticated intake → approval wait → service decision denied → authorized decision queued → worker resume → one reply; then cancellation, restart recovery and unknown fake effect resolution. No real external action.
Measure enqueue/claim/startup/completion p50/p95, queue depth and worker count with environment details. Clearly distinguish successful logical completion from repeated safe pure computation and possible unknown model billing.

## Final delivery

Save implementation and documentation on the implementation branch with reviewable commits. Open a draft PR if repository access permits; do not merge. Report:
- source/final SHA, branch, changed files and PR
- architecture and transaction boundaries
- lease/fencing, retry/recovery and effect guarantees
- approval/wait/cancel/scheduling behavior
- generation/legacy migration compatibility
- tests: collected/passed/failed/skipped and reasons
- PostgreSQL/Redis and process concurrency results
- migrations, smoke, benchmark and fresh-install results
- explicit deviations, remaining risks and limitations
- recommended Phase 4, without starting it
