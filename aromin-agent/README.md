# AROMIN AI Agent

Standalone AI agent service for AROMIN. **Status: Phase 2 (controlled tool use).** The service answers chat messages and can call internal, read-only tools under server-side validation, permissions, policy, approvals and audit. It runs on a mock model provider and is not connected to a real LLM, to the AROMIN Dashboard or to the website chat.

Architecture reference: [AROMIN AI Architecture Blueprint](../docs/aromin-ai-blueprint.md) and the [Task Engine reference](../docs/aromin-ai-task-engine.md).

## 1. What this project is

A separate Python service that will become AROMIN's AI agent platform. It will chat with customers, remember them, use AROMIN knowledge, qualify and route leads, follow up, send SMS and hand conversations to salespeople. Other systems (Dashboard, website chat, SMS provider, n8n) will connect to it only through its HTTP API and events. It never reads or writes their databases.

Phase 1 delivers the foundation those features build on:
- configuration
- database schema and migrations
- the API with authentication and a standard error model
- structured logging
- a provider-independent LLM interface
- the agent runtime that orchestrates one chat turn

## 2. How to run it

Requirements: Python 3.12 and [uv](https://docs.astral.sh/uv/). PostgreSQL 16 and Redis 7 are optional for local development; SQLite works out of the box.

```bash
cd aromin-agent
uv sync                                   # create .venv and install locked dependencies
cp .env.example .env                      # defaults: SQLite + mock provider
uv run alembic upgrade head               # create the schema
uv run python -m app.cli create-api-key --name local --role service   # prints the key once
uv run uvicorn app.main:app --reload --port 8000
```

Try it, replacing `<KEY>` with the printed key:

```bash
curl -s localhost:8000/health
curl -s localhost:8000/ready
curl -s -X POST localhost:8000/v1/chat \
  -H "Authorization: Bearer <KEY>" -H "Content-Type: application/json" \
  -d '{"message": "سلام"}'
```

To use PostgreSQL and Redis instead, set `DATABASE_URL=postgresql+asyncpg://…` and `REDIS_URL=redis://…` in `.env`, then run the migration again. `docker-compose.yml` describes the same stack, but it was not run in the Phase 1 environment (no Docker daemon was available there).

## 3. How to run the tests

```bash
uv run pytest                     # SQLite: every test gets a fresh migrated database
uv run ruff check . && uv run ruff format --check .
```

Run the same suite against real PostgreSQL and Redis:

```bash
TEST_DATABASE_URL=postgresql+asyncpg://<user>:<password>@localhost:5432/<empty_test_db> \
TEST_REDIS_URL=redis://localhost:6379/0 uv run pytest
```

The PostgreSQL run truncates every table in that database, so point it at a database used only for tests. Three tests only run with these variables set: the PostgreSQL triggers and real Redis readiness.

## 4. Current architecture

```
HTTP ──▶ RequestContextMiddleware (request_id, access log)
     ──▶ auth (API key → Principal → permissions) ──▶ rate limit
     ──▶ routes: /health /ready /v1/conversations /v1/chat /v1/tasks[/steps|/cancel]
                 /v1/tool-executions /v1/approvals[/approve|/reject]
                    │
                    ▼
               AgentRuntime ── LLMProvider (mock | openai_compatible | arvan*) + ModelRouter
                    │       ── ConversationMemory   ── ContextEngine (token budget, tool transcript)
                    │       ── ToolRegistry ── ToolExecutor ── PolicyEngine / ApprovalService
                    │       ── TaskEngine (inline turns, waiting, cancel) ── EffectLedger
                    │       ── EventRecorder (outbox) ── AuditLogger ── CostEstimator (llm_usage)
                    ▼
        UnitOfWork + repositories (fixed ORM queries) ──▶ PostgreSQL / SQLite
```

\* the Arvan adapter refuses to start until its API is verified (blueprint §15 checklist).

A chat turn:
1. **Intake transaction:** store the user message, create the task row, record `message.received`.
2. **Loop** (bounded by tool iterations, turn time, token and cost budgets):
   - The model is called; every call is recorded as a `model_call` step with tokens, cost and latency in `llm_usage`.
   - If the model requests tools, each request goes through the ToolExecutor: name → schema (unknown arguments and type mismatches rejected) → permissions → policy → approval → idempotency → handler.
   - Each tool request gets a `tool_call` step and a `tool_executions` row, and its result goes back to the model.
3. **Completion transaction:** store the reply, mark the task `succeeded`, record `message.sent`.

A tool that needs approval pauses the turn: `/v1/chat` answers `202` and the task is `waiting`. A permitted human (not the requester) approves or rejects it, and the turn then resumes inline. The model never chooses identities, scope or approval state. It supplies only a tool name and arguments.

Built-in tools (all LOW risk, read-only): `get_conversation`, `get_message_history`, `get_task`, `get_current_time`, `calculate`.

Package layout: `app/core`, `app/api`, `app/agent`, `app/memory`, `app/context`, `app/tools`, `app/policy`, `app/tasks`, `app/events`, `app/models`, `app/providers`, `app/services`, `app/security`, `app/db`, `app/workers`; plus `migrations/`, `tests/` and `docs/`. Details: [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), [docs/development.md](docs/development.md).

## 5. Not implemented yet

These are deliberately out of Phases 1–2. The blueprint section that covers each is in brackets.

- **Real LLM:** Arvan's API is not verified [§15]. The generic OpenAI-compatible adapter is unit-tested against mocked HTTP only, never against a live provider.
- **Tools:** only the five internal read tools exist; no SMS, CRM write, payment or other external or destructive tools [§6]. The effect ledger is ready, but no real external effect exists to use it.
- **Task Engine background features:** no worker process (`python -m app.workers` exits with an error), claim loop, task-level retries/backoff, reaper, schedules, dead-letter or fallback task [§9].
  - Turns, including the continuation after an approval decision, run inline in the API request.
  - An inline turn whose lease expired is marked `failed` when the next message arrives.
  - Approval expiry is checked lazily, when the approval is read or decided or a new message arrives; nothing sends reminders.
  - New messages are refused (`409`) while a turn in the conversation waits for approval.
- **Events:** the outbox is written, but nothing delivers it yet (no dispatcher, no webhooks) [§10].
- **Memory and knowledge:** no rolling summary, customer/semantic memory, RAG or web research [§4, §7, §8].
- **Domain and channels:** no Sales Agent, leads, scoring, routing, follow-ups, SMS, handoff [§11–13] and no SSE streaming endpoint [§16].
- **Auth:** no staff JWT or website-visitor tokens [§14].
- **Rate limiting:** the limiter is in-process, so it is per-replica; the Redis limiter comes with hardening [§14].
- **Observability:** no Prometheus metrics, tracing or alerting [§15, §16].
- **Customer data:** no data-deletion endpoint.
