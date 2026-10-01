# Development

## Setup

```bash
cd aromin-agent
uv sync                      # Python 3.12 virtualenv in .venv from uv.lock
cp .env.example .env         # never commit .env
uv run alembic upgrade head
```

All configuration is read from environment variables (or `.env`); see `.env.example` for every setting. Secrets (`LLM_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `*_API_KEY`) are `SecretStr`: they never appear in `repr`, logs or API errors.

Notes:
- List settings such as `CORS_ALLOWED_ORIGINS` take JSON (`["https://a.example"]`).
- `APP_ENV=production` refuses `LLM_PROVIDER=mock` and SQLite.
- `SMS_SENDING_ENABLED=true` is refused in this phase.

## Common tasks

| Task | Command |
|---|---|
| Run the API | `uv run uvicorn app.main:app --reload` |
| Create an API key | `uv run python -m app.cli create-api-key --name <name> --role service` |
| Revoke an API key | `uv run python -m app.cli revoke-api-key <key_id>` |
| Tests (SQLite) | `uv run pytest` |
| Tests (PostgreSQL + Redis) | `TEST_DATABASE_URL=postgresql+asyncpg://… TEST_REDIS_URL=redis://… uv run pytest` |
| Lint / format | `uv run ruff check . && uv run ruff format --check .` |
| New migration | `uv run alembic revision --autogenerate -m "…"`, then review the file by hand |
| Check models vs migrations | `uv run alembic check` |

Roles: `admin`, `sales_manager`, `salesperson`, `service`, `visitor` (see `app/security/permissions.py`). Use `service` for server-to-server clients.

## Conventions

- **IDs** are prefixed ULIDs: `conv_`, `msg_`, `task_`, `evt_`, `key_`, `aud_`, `req_`.
- **Database access** goes through a `UnitOfWork` (`async with container.uow_factory() as uow:`) and repository methods. Don't add raw SQL to `app/`: `tests/test_security_guards.py` fails the build if you do.
- **Events** are recorded in the same unit of work as the change that caused them (`EventRecorder.record`).
- **Errors:** raise an `AppError` subclass with a stable `code`. Never put provider payloads, SQL or secrets into `detail`.
- **Logging:** use `get_logger(__name__)` and log ids, sizes, latencies and codes. Never log message text, prompts or model reasoning.
- **Providers:** new adapters implement `_generate` and `_stream`, map every failure to a class in `app/providers/errors.py`, and drop reasoning fields.
- **Tests:** each test gets its own migrated database. Use `MockProvider(script=[...], fail_with=..., delay_s=...)` to drive the runtime deterministically.
  - Tool scenarios: script `MockReply(tool_calls=[{"name": ..., "arguments": {...}}])`.
  - The `tool_env` fixture (in `tests/conftest.py`) gives a container with the built-in tools plus the test-only tools in `tests/tool_fixtures.py`, and service + manager keys.
- **New tools:** define strict input/output models (`extra="forbid"`) and a `ToolSpec` with every metadata field. Read through `ctx.data`. Route any external call through `ctx.effects.perform(...)`. Mark credential inputs with `sensitive()`. Never add identity or scope fields to the input.

## Local PostgreSQL / Redis

Any PostgreSQL 16 and Redis 7 work. Create a dedicated empty database for `TEST_DATABASE_URL`: the PostgreSQL test run truncates all tables. On PostgreSQL, migration `0001` also installs the `tasks_guard` (illegal status transitions) and `audit_log_append_only` triggers.

`docker-compose.yml` defines postgres, redis, a one-off `migrate` job and `api`; set `POSTGRES_PASSWORD` before `docker compose up`. It was not exercised in the Phase 1 environment.
