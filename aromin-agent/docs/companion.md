# Aro: animated AROMIN companion

A separately authorized UI follow-up after the seven Phase 3 engineering cycles.
It does not complete or replace Phase 3, enable RAG, publish Telegram messages,
or change Cloud Assistant v3.9.38/MariaDB.

## What is implemented

- Original blue crystal Aro character: floating, blinking, mouse gaze, greeting,
  thinking, responding, approval wait, and error states; reduced-motion support.
- Responsive Persian/RTL interface with collapsible island, suggested questions,
  conversation reset, server messages, and task/status polling.
- Same-origin local Python/FastAPI gateway to the existing authenticated AROMIN
  conversation/chat/task API. Service credentials remain server-side.
- Optional `aromin-companion` Persian specialist profile using the existing
  container, provider configuration, builtin tools, policy and API permissions.
  The default application and legacy Dashboard are unchanged.
- Timeout retries preserve conversation and client message ID. Unknown outcomes
  are shown as unknown; no frontend canned or invented model replies.

## Run locally

From `aromin-agent/`, install the frozen dependencies (`uv sync --frozen`) and
use the existing agent database/provider setup described in the project README.
Apply its migrations with `uv run alembic upgrade head`. SQLite is a development
option; it does not verify the PostgreSQL/Redis Phase 3 acceptance requirements.

Use an existing appropriate API key, or provision a dedicated key through the
existing operator CLI: `uv run python -m app.cli create-api-key --name companion
--role service`. This command displays the new secret once; store it privately.
Never commit it or paste it into browser code.

Add these settings to the private `.env` (the API-key value is your own secret):

```dotenv
COMPANION_AGENT_URL=http://127.0.0.1:8001
COMPANION_AGENT_API_KEY=<private service API key>
```

Start the optional specialist agent in one terminal:

```sh
uv run python -m app.companion.agent
```

Start its local gateway in another terminal:

```sh
uv run python -m app.companion
```

Open `http://127.0.0.1:8877/`. Both entry points bind to loopback. To connect to
an already running generic agent instead, set `COMPANION_AGENT_URL` to its
HTTP(S) origin and run only the gateway. Specialist identity/provider display
is available through the optional authenticated `/companion/info` endpoint.

A configured real provider/model/key is necessary for intelligent live answers.
The default development provider is `mock`, visibly labeled by the specialist
host. No live model, organizational knowledge, products/prices, voice or RAG
has been verified or loaded by this follow-up. The existing chat API returns a
final response; this UI does not claim token streaming.

## Authority and limits

This is a single-user local interface, not a public multi-user service or native
desktop overlay. Host allowlisting, same-origin writes, a random CSRF token,
local conversation/task ownership, inert text rendering, and a restrictive CSP
protect the local gateway. Its session ownership/deduplication maps are in memory,
bounded to 1,000 submitted IDs and lost on restart. Agent persistence remains
in the existing database. Starting a new UI conversation does not delete history.
Run one gateway worker. Gateway restart does not grant access to old conversations.
Do not publicly expose this gateway without separately implementing user sessions,
TLS, durable ownership/recovery, deployment controls, and tenant isolation.
No gateway approval/cancel/Telegram endpoints are provided. Existing agent runtime
and tool-policy limitations still apply; no durable Phase 3 worker is wired here.

## Coucou reference and licensing

Interaction inspiration: [Louis-CFM/coucou](https://github.com/Louis-CFM/coucou),
reviewed at `ae385208700fcd5fff2da21762e3aca065d171b1` (animation/state/island
implementation and installation docs). Coucou is an application, not an
installable Codex skill; no `SKILL.md` was present. This follow-up creates the
requested AROMIN interface rather than claiming Coucou was installed.

Coucou's code is under its [MIT license](https://github.com/Louis-CFM/coucou/blob/ae385208700fcd5fff2da21762e3aca065d171b1/LICENSE).
Its separate [asset license](https://github.com/Louis-CFM/coucou/blob/ae385208700fcd5fff2da21762e3aca065d171b1/LICENSE-ASSETS)
reserves its character/name/artwork/media. This implementation uses independently
written HTML/CSS/JS, its own SVG Aro character and AROMIN branding; no Coucou/Mochi
artwork, animations, sounds or other reserved media were copied.

## Verification

- `tests/test_companion.py`: 9 passed using the actual existing API/runtime,
  migrated SQLite and explicit MockProvider: authenticated chat, persisted
  messages, idempotent retry, timeout recovery, CSRF/Host/scope rejection,
  missing-credential honesty, origin validation and authenticated specialist info.
- Chromium desktop 1280x920 and mobile 390x844: no horizontal overflow or
  JavaScript exceptions; prompt filling, error display without fake answers,
  retained retry text, new chat, collapse/expand and motion toggle passed.
- Chromium connected test: browser -> gateway -> authenticated AROMIN runtime ->
  migrated SQLite/MockProvider -> visible server reply; mock labeling, busy state
  and responding animation passed. This is not live LLM verification.
- Full suite: 240 passed, 12 skipped; SQLite background-thread/event-loop warnings
  were observed (pre-existing intermittent suite warnings). Ruff/format/diff checks
  passed. PostgreSQL/Redis integration/process acceptance remains unverified.
- Playwright was installed only in the disposable validation environment; no
  dependency lock changes and no production services were started or changed.
