# Grok SMS

Settings → اتصال‌ها · Grok SMS is organization-manager-only. New routes use the existing dashboard identity helper; the integration does not alter the existing SMS/OTP provider or dashboard state.

- Set `PAYAMRESAN_API_KEY`, sender, maximum recipients (default 100) and confirmation (default true). Blank secret inputs retain stored values.
- Generate a cryptographically random 48-byte token on the server, or enter a ≥32-character token. Generation immediately revokes the previous token. The generated value is delivered once with `Cache-Control: no-store` and is masked until copied. It is never returned by settings GET. Only SHA-256 of the high-entropy token is stored.
- Private, tenant-hashed files live under `GROK_SMS_SECRET_DIR`, default `srv/.grok-sms-secrets`: directory 0700, configuration/audit files 0600, atomic configuration replacement, file locks. The API key is server-readable in this protected file (not application-level encrypted). Keep OS/backups restricted; this directory is excluded from Git and packaging. No secrets enter `/api/state`.
- Copy OpenAPI from the settings page; paste token separately into Grok's secure bearer credential field. `PUBLIC_BASE_URL` determines schema server URL, default `https://dashboard.arominco.com`; the UI shows the dashboard origin. Use HTTPS. Non-default tenants must retain their `?tenant=` query parameter.
- `GET /api/grok/health` requires bearer auth and reports configuration presence, not provider connectivity. `POST /api/grok/send-sms` uses the input contract specified in the task. Confirmation must be a JSON boolean, not a string. The token holder is responsible for obtaining actual user approval; `confirmed_by_user` is an assertion, not independent proof.
- Mobile normalization supports 09, +98, 0098, 98 and Persian/Arabic digits. Duplicates are removed after enforcing the submitted recipient limit. Optional sender overrides are validated. Message length is capped at 10,000 characters and HTTP body at 100KB.
- Settings test checks saved configuration only. No provider no-send test endpoint was verified. It explicitly states: «برای تست واقعی، یک پیامک آزمایشی باید ارسال شود.» No actual SMS was sent during development.

## Routes

Manager authentication: `GET/POST /api/settings/grok-sms`, `POST .../regenerate`, `POST .../test`, `GET .../schema`, `GET .../audit` (last 50 events).

Bearer authentication: `GET /api/grok/health`, `POST /api/grok/send-sms`. Errors 401 unauthorized, 400 invalid input, 409 missing confirmation, 502 provider failure/uncertain delivery. Settings access denied is 403.

Audit has durable pending intent and success/failed_or_unknown completion sharing request_id, UTC milliseconds, recipient count, sender, SHA-256 message hash, and message IDs. It contains no recipients, full message, key or token. The settings page displays the log. Disk failure before writing intent prevents sending. Operations require normal log retention/backup management; no deletion policy is invented.

## Provider contract still needs live documentation review

Outbound URL, ApiKey header and SenderNumber/Message/MobileNumber/SendToBlocksNumber body exactly follow the user's supplied contract. TLS checks are enabled, redirects refused, timeout 20s; calls run in a threadpool. No automatic retries: a timeout may occur after acceptance.

Provider Swagger could not be fetched from this environment. A verified provider response example was not supplied. The current conservative parser accepts only explicit boolean success (`success`, `Success`, `IsSuccess`) plus a nonempty message ID list (`message_ids`, `MessageIds`, `MessageIDs`); unknown JSON or success-without-IDs returns 502/unknown. These aliases are provisional, covered by synthetic contract tests, **not claimed as the vendor's verified schema**. Before production enablement, compare with official response documentation. Provider free text is deliberately not echoed; the wrapper returns a fixed acceptance/error message to prevent reflected secrets. This differs from forwarding the vendor's raw message and is documented for review.

No live provider credentials were installed, no production deployment or database writes performed. Application changes begin from main fd2fc4b / 3.9.55. Existing performance work is untouched.

## Validation

- Frontend production build/TypeScript and lint pass (existing warnings); 161 unit tests pass, 1 skipped.
- Full Python suite: 118 passed, 6 skipped (124 total), including 12 Grok API tests. MariaDB integration tests remain skipped; no live DB/provider exercised.
- Chromium: masked fields, clearing secrets after save, config-only test, one-time token masking/hiding, 390px RTL and hiding controls from sales users pass. Browser uses only synthetic route responses.
- `bash -n deployment/install.sh deployment/rollback.sh` passes. Package wiring includes the new module; private directory is excluded by existing dot-directory packaging rules.

Reproduce: `python -m unittest discover -s deployment/tests -v` (test environment needs FastAPI TestClient transport httpx2 for current Starlette); `cd frontend && npm ci && npx vitest run && npm run lint && npm run build`. Start Vite at port 5191, then run `node frontend/tests/browser/grok-sms.cjs` with Playwright/Chromium installed in the test environment.
