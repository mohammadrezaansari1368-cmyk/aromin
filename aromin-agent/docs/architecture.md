# Architecture (Phase 1)

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
| `app/tools` | `ToolSpec` (effect, risk, permissions, timeout) and validating `ToolRegistry`; no tools registered | §6 |
| `app/tasks` | `TaskEngine`: inline task rows, transition table, one running turn per conversation | §9 (subset) |
| `app/events` | Event types and `EventRecorder` writing the transactional outbox | §10 (write side) |
| `app/models` | SQLAlchemy models: conversations, messages, tasks, events_outbox, api_keys, audit_log | §17 |
| `app/db` | Engine/session, `UnitOfWork`, repositories with fixed queries, readiness ping | §6, §17 |
| `app/security` | `Authenticator` interface + API-key implementation, role permissions, rate-limiter interface + in-process bucket | §14 |
| `app/services` | Use cases: conversations, API keys (CLI only), audit logger | §14 |
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
