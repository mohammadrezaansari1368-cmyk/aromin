# AROMIN AI Agent

Standalone AI agent service for AROMIN. **Status: Phase 1 (core foundation).** The service runs and answers chat messages through a mock model provider. It is not connected to a real LLM, to the AROMIN Dashboard or to the website chat.

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
     ──▶ routes: /health /ready /v1/conversations /v1/chat /v1/tasks
                    │
                    ▼
               AgentRuntime ── LLMProvider (mock | openai_compatible | arvan*) + ModelRouter
                    │       ── ConversationMemory   ── ContextEngine (token budget)
                    │       ── ToolRegistry (empty)  ── TaskEngine (inline turns)
                    │       ── EventRecorder (transactional outbox)
                    ▼
        UnitOfWork + repositories (fixed ORM queries) ──▶ PostgreSQL / SQLite
```

\* the Arvan adapter refuses to start until its API is verified (blueprint §15 checklist).

A chat turn works like this:
1. **First transaction:** store the user message and create the task row, then record `message.received`.
2. **Model call:** stream it with no database transaction open.
3. **Second transaction:** store the reply, mark the task `succeeded` and record `message.sent`. If the provider fails, the task is marked `failed` and the client gets a normalized error.

The runtime emits transport-neutral events, so SSE or WebSocket can be added without changing it.

Package layout: `app/core`, `app/api`, `app/agent`, `app/memory`, `app/context`, `app/tools`, `app/tasks`, `app/events`, `app/models`, `app/providers`, `app/services`, `app/security`, `app/db`, `app/workers`; plus `migrations/`, `tests/` and `docs/`. Details: [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), [docs/development.md](docs/development.md).

## 5. Not implemented yet

These are deliberately out of Phase 1. The blueprint section that covers each is in brackets.

- **Real LLM:** Arvan's API is not verified [§15]. The generic OpenAI-compatible adapter is unit-tested against mocked HTTP only, never against a live provider.
- **Tools:** no business tools, policy engine, approvals or tool-execution loop yet. If the model requests a tool, the turn fails [§6, §14].
- **Task Engine background features:** no worker process (`python -m app.workers` exits with an error), claim loop, step journal, side-effect ledger, retries/backoff, waiting states, escalation, reaper, schedules, dead-letter or fallback task [§9].
  - Phase 1 creates only inline task rows.
  - An inline turn whose lease expired is marked `failed` when the next message arrives.
- **Events:** the outbox is written, but nothing delivers it yet (no dispatcher, no webhooks) [§10].
- **Memory and knowledge:** no rolling summary, customer/semantic memory, RAG or web research [§4, §7, §8].
- **Domain and channels:** no Sales Agent, leads, scoring, routing, follow-ups, SMS, handoff [§11–13] and no SSE streaming endpoint [§16].
- **Auth:** no staff JWT or website-visitor tokens [§14].
- **Rate limiting:** the limiter is in-process, so it is per-replica; the Redis limiter comes with hardening [§14].
- **Observability:** no Prometheus metrics, tracing or alerting [§15, §16].
- **Customer data:** no data-deletion endpoint.
