# Architecture (Phases 1–2)

This service implements the foundation of the [AROMIN AI Architecture Blueprint](../../docs/aromin-ai-blueprint.md). This page maps what exists in code to the blueprint sections. Where Phase 1 is a subset, the missing part is named.

## Process model

One codebase, two process types (blueprint §1):
- **`api`** (FastAPI): implemented.
- **`worker`**: not implemented yet. `python -m app.workers` exits with code 2.

PostgreSQL is the source of truth; SQLite is accepted for development and tests only (production config refuses it). Redis is optional in Phase 1 and only checked by `/ready`.

## Packages

| Package | Responsibility | Blueprint |
|---|---|---|
| `app/core` | Settings (`config.py`), composition root (`container.py`), error hierarchy, prefixed ULIDs, structured logging with secret redaction | §15, §16, §18 |
| `app/api` | FastAPI routes, dependencies (auth, permissions, rate limit), problem+json handlers, request-context middleware, request/response schemas | §16 |
| `app/agent` | `AgentRuntime` (turn orchestration), `AgentProfile`, transport-neutral runtime events | §3 |
| `app/providers` | `LLMProvider` interface, normalized errors, `MockProvider`, generic `OpenAICompatibleProvider`, `ArvanProvider` (gated), factory and `ModelRouter` | §15 |
| `app/memory` | Conversation memory: message sequencing, last-K history | §4 (conversation layer only) |
| `app/context` | Context engine: system prompt + recent turns within a token budget | §5 (two slots) |
| `app/tools` | `ToolSpec` metadata, `ToolRegistry` (catalog + argument gate), `ToolExecutor` (the only path to a handler), `EffectLedger`, read-only `ToolDataAccess`, safe calculator, five built-in tools | §6, ref §9.6–9.7 |
| `app/policy` | `PolicyEngine`: ALLOW / DENY / REQUIRE_APPROVAL from actor, permissions, tool risk, scope, environment and approval state | §14 |
| `app/tasks` | `TaskEngine`: inline task rows, transition table, one running turn per conversation, wait/resume/cancel | §9 (subset) |
| `app/events` | Event types and `EventRecorder` writing the transactional outbox | §10 (write side) |
| `app/models` | SQLAlchemy models: conversations, messages, tasks, events_outbox, api_keys, audit_log | §17 |
| `app/db` | Engine/session, `UnitOfWork`, repositories with fixed queries, readiness ping | §6, §17 |
| `app/security` | `Authenticator` interface + API-key implementation, role permissions, rate-limiter interface + in-process bucket | §14 |
| `app/services` | Use cases: conversations, approvals + task cancellation, API keys (CLI only), audit logger | §14 |
| `app/workers` | Placeholder entry point for the Task Engine worker | §9, §20 phase 4 |
| `migrations/` | Alembic; `0001` creates the schema and, on PostgreSQL, the task-transition and audit append-only triggers | §17, ref §9.3 |

## A chat turn

```
POST /v1/chat
  auth → permission chat:write → rate limit
  AgentRuntime.run_turn
    txn 1: lock conversation → dedupe client_msg_id → user message (seq n)
           → task row (agent.run, immediate, lane 0, running, lease, concurrency_key conv:<id>)
           → outbox message.received → load last 20 messages
    model: ContextEngine.build → provider.stream (timeout = LLM_TIMEOUT_SECONDS)
    txn 2: lock conversation → assistant message (seq n+1) → answered_through_seq
           → task succeeded → outbox message.sent
    on ProviderError: task failed (last_error.code/error_class) → TurnFailed event → HTTP problem+json
```

Design rules carried over from the blueprint and the Task Engine reference:
- **Eager task row.** Every turn gets its task row in the same transaction as the user's message (ref §9.1).
- **No open transaction during the model call** (ref §9.6).
- **One running turn per conversation.** Enforced by the unique partial index `tasks_one_running_per_key`. A second concurrent message gets `409 conversation_busy` (ref §9.5 rule 5). The full attach/deliver-gate protocol comes with the Task Engine phase.
- **Idempotent intake.** A retry with the same `client_msg_id` returns the stored reply and never starts a second turn (ref §9.14 step 1).
- **Stale lease handling without a reaper.** A running inline task whose lease expired (API crash) is marked `failed (lease_expired)` when the next message for that conversation arrives, so the conversation is never blocked.
- **No reasoning stored.** Provider reasoning fields are dropped in the adapter and have no place in the types or the schema.
- **No arbitrary SQL.** The agent has no database access; tools and services use repositories with fixed ORM queries. A test scans `app/` for raw SQL; the only literal statement is the readiness `SELECT 1` (plus SQLite connection pragmas).

## Provider abstraction

`LLMProvider` gives every adapter the same surface:
- `generate()`: non-streaming.
- `stream()`: deltas, with the final delta carrying usage.
- `generate_structured(request, PydanticModel)`: JSON-schema output, validated.
- Model selection through `ChatRequest.model`, chosen by `ModelRouter` from the profile's tier (`small`, `main`, `large`).
- A per-call `timeout_s`, enforced around the whole call or stream.
- `Usage` metadata on every response.
- `embed()`: declared, not implemented in Phase 1.

Every adapter maps its failures to these normalized error classes:

| Class | Code | Retryable | Error class (ref §9.8) |
|---|---|---|---|
| `ProviderTimeoutError` | `provider_timeout` (504) | yes | transient |
| `ProviderRateLimitError` | `provider_rate_limited` (503) | yes | transient |
| `ProviderUnavailableError` | `provider_unavailable` (503) | yes | transient |
| `ProviderAuthError` | `provider_unavailable` (503) | no | dependency_unavailable |
| `ProviderBadRequestError` | `provider_bad_request` (502) | no | permanent |
| `ProviderResponseError` | `provider_invalid_response` (502) | no | permanent |
| `ProviderConfigurationError` | `provider_not_configured` (503) | no | permanent |

The **Arvan adapter** is connectable but gated: it raises `provider_not_configured` until `ARVAN_API_VERIFIED=true` is set after completing the blueprint §15 verification checklist. If Arvan turns out to be OpenAI-compatible it works through the generic adapter; otherwise only `app/providers/arvan.py` changes.

## Data model

Tables:
- `conversations`
- `messages`
- `tasks`
- `events_outbox`
- `api_keys` (SHA-256 hashes only)
- `audit_log` (append-only; a trigger enforces it on PostgreSQL)

Columns are reserved so later phases extend rather than replace these tables:
- `conversations.customer_id`, `tasks.customer_id` and `tasks.lead_id` are plain nullable columns; their foreign keys arrive with the `customers` and `leads` tables.
- `tasks` already carries the reference §9.2 status set, lanes, modes, lease/fencing columns, `dedupe_key` and `parent_task_id`.

Planned additions:
- Customer, Lead, Salesperson, FollowUp, Handoff and Approval tables [§12, §17].
- `task_steps` (tool executions) and `side_effects` (external effects), ref §9.2/§9.7.
- `schedules` and `webhook_subscriptions`/`webhook_deliveries`.

## Phase 2: controlled tool use

### Tool contract

The model may request a tool only by **name + arguments**.

Tool metadata (`ToolSpec`):
- `name`, `description`, `version`
- input/output models, from which `input_schema` (with `additionalProperties: false`) and `output_schema` are derived
- `risk_level` (LOW, MEDIUM, HIGH, CRITICAL), `permissions_required`, `approval_required`
- `timeout_s`, `retry_policy`, `idempotency_policy` (none, key, ledger), `side_effect` (none, internal_write, external_idempotent, external_unsafe)
- `requires_conversation`, `handler`

Registration rejects:
- input fields the model must never control: `customer_id`, `conversation_id`, `tenant_id`, `user_id`, `salesperson_id`, roles, permissions, approval and audit fields, internal ids;
- side effects without an idempotency policy;
- external effects that bypass the ledger;
- retries on non-idempotent external effects.

Handlers get a `ToolContext` built server-side (actor, conversation, customer, task, step, idempotency key) and a read-only data facade. They never get a database session, so they cannot run SQL.

### Execution pipeline (`ToolExecutor`)

```
name offered to the profile? ── no ──▶ fail the turn (fail closed), audited
arguments: JSON object, no unknown keys, strict types ── no ──▶ validation_error → model
RBAC: actor holds permissions_required (and credential still active) ── no ──▶ authorization_error → model
PolicyEngine ── DENY ──▶ policy_denied → model
             ── REQUIRE_APPROVAL ──▶ approval row, step waiting_approval, task waiting, 202
             ── ALLOW ──▶ idempotency (a succeeded step is never re-run) ──▶ handler (timeout, retry policy)
```

Every request gets one `task_steps` row (`tool_call`) and one `tool_executions` row, whatever the outcome. Each transition is audited in the same transaction:
- `tool.requested`, `tool.allowed`, `tool.denied`, `tool.started`, `tool.succeeded`, `tool.failed`, `tool.cancelled`;
- `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`, `approval.cancelled`.

### Failure classes

| error_type | executed | retried | model sees |
|---|---|---|---|
| validation_error | no | no | the error (may correct itself) |
| authorization_error / policy_denied | no | no | "not permitted" / "denied by policy" |
| approval_required | paused | — | (turn waits) |
| timeout / provider_error / network_error | yes | only for pure tools or tools protected by idempotency; never a non-idempotent external effect | the error |
| business_error | yes | no | the handler's safe message |
| unknown_error | yes | no | a generic message (details only in server logs, without secrets) |

### Policy model

The decision rules are, in order:
1. A disabled tool is denied.
2. A missing permission is denied.
3. A missing conversation scope is denied.
4. CRITICAL is denied unless `ALLOW_CRITICAL_TOOLS=true`.
5. The base decision is the per-tool override (`TOOL_POLICY_OVERRIDES`), or else the risk default: LOW→ALLOW, MEDIUM→ALLOW, HIGH→REQUIRE_APPROVAL, CRITICAL→REQUIRE_APPROVAL.
6. A tool flagged `approval_required` always needs approval, whatever the configuration says.
7. Under REQUIRE_APPROVAL, the stored approval state decides: approved→ALLOW; rejected/expired/cancelled→DENY.

`TOOL_RISK_OVERRIDES` may raise a tool's risk but never lower it below the author's level. Tool output is data only and never feeds a policy input.

### Approval model

States: `pending → approved | rejected | expired | cancelled`.

- **Who can decide:** principals with `approval:decide` (admin, sales_manager). Service keys can read approvals but not decide them.
- **No self-approval:** the principal that started the turn cannot decide its own request (a `403` that is audited).
- **When a decision is allowed:** only while the approval is pending and unexpired and its task is waiting on it.
- **After the decision:** the turn resumes inline. An approved tool executes once. A rejected one never executes, and the model is told.
- **Authority on resume:** re-derived from the requester's current key; a revoked key gets `authorization_error`.
- **Other calls in the same model message:** calls queued after a gated call are not executed; the model is told to request them again.
- **Expiry:** after `APPROVAL_TTL_SECONDS`, checked lazily. Cancelling a task cancels its pending approvals.

### Idempotency and the effect ledger

- **Idempotency key:** each step has a stable key, `sha256(task_id|step_no)`.
- **Re-running a succeeded step:** returns the stored result.
- **External effects:** go through `EffectLedger` (`side_effects` table, reference §9.7):
  - a succeeded or failed record returns the stored outcome;
  - a `pending` record from an earlier attempt is reconciled (provider dedupe or lookup) or marked `unknown`, and is never blindly re-sent;
  - a pre-send failure clears the record.
- **Executions vs. side effects:** a tool execution and an external side effect are separate records.

### Loop limits

Configured by `AGENT_MAX_TOOL_ITERATIONS`, `AGENT_TURN_TIMEOUT_SECONDS`, `AGENT_MAX_TOKENS_PER_TURN` and `AGENT_MAX_COST_PER_TURN`. These sit on top of the per-tool `timeout_s` and the per-call `LLM_TIMEOUT_SECONDS`.

- At the iteration limit the last model call is offered no tools.
- If any limit is still exceeded, the task fails with `budget_exceeded` (`422 agent_limit_exceeded`).
- Cancellation (`POST /v1/tasks/{id}/cancel`) is checked before every model call and every tool execution.

### Token and cost tracking

`llm_usage` has one row per model invocation, failures included: provider, model, tier, input/output/total tokens, estimated cost and latency. Cost is computed from `LLM_PRICING` and left `null` when the model has no price. `GET /v1/tasks/{id}` returns the totals.

### Phase 2 tables (migration `0002`)

- `task_steps`
- `tool_executions` (unique per task+step; unique succeeded idempotency key)
- `approvals` (one pending per step)
- `side_effects`
- `llm_usage`
- new `tasks` columns: `wait_kind`, `wait_ref`, `step_count`
