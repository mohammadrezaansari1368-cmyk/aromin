# WP-01: server authentication, first slice

**Status:** item 1 done; item 2 partial (React password login); item 3 deferred; item 4 done for all six requested routes; item 5 deferred. No stored passwords or database schemas changed.

## Implemented

`POST /api/auth/session` accepts `{tenant, username, password}`. Nonempty tenant uses the existing tenant directory; empty tenant uses legacy DB-users. It supports plaintext (constant-time UTF-8 byte comparison) and bcrypt in `pass`/`pass_hash`, rejects inactive people and nonexistent tenants, and returns password-free metadata plus a one-hour HMAC token. Signed versioned claims contain user, role, tenant, issued time and expiry. Bearer verification rejects tampering, expiry and tenant mismatch; live roles/removals/inactive status are rechecked. Invalid Bearer never downgrades to legacy credentials. Legacy headers and `/api/login` remain supported.

Set `AROMIN_SESSION_SECRET` (at least 32 bytes), or `AROMIN_SESSION_SECRET_FILE`. Otherwise a random 32-byte key is created at `deployment/.assistant-secrets/session.key`, already Git-ignored and excluded by the release packager. Creation uses a private temporary file and atomic link for concurrent workers; existing files must be private regular files. Provision persistent storage writable by the service account before use. Share the key across replicas; preserve it across upgrades. Key errors fail closed; rotation invalidates sessions.

React password login uses the endpoint first; only 404/405 enables old-server fallback. Tokens remain in page memory; `authHeaders` and forecast backup/save send the active identity. Logout clears it; tenant mismatch suppresses credentials. The password remains in memory for embedded legacy login. Reload/expiry requires login again. OTP/Google still use legacy credentials. Legacy backup calls now send existing identity headers and specify tenant on download.

Users/upsert and tenants POST/DELETE require a **DB-user** manager/admin Bearer session (empty tenant), preventing tenant managers from administering global resources. Backup POST, backups GET and backup/{bid} GET require manager/salesmgr/accmgr/admin within the requested tenant; downloads also filter by tenant. Errors use Persian JSON with 401/403. Existing global-management UI lacks DB-session login and now receives 401; use an authenticated administrative API client. Nonmanager automatic backups now receive 403.

## Deferred risks and exact blocker for item 3

**B1 remains:** unconditional state password removal breaks legacy synchronous `doLogin`, `loginByMobile` (passes the stored password), password-change/reset UI, React-to-legacy embedded login, and React OTP/Google `sessionOf` (reads passwords for API headers). Migrate these to server sessions before redacting state and transactionally preserving omitted passwords. No state-redaction test is claimed.

Unauthenticated state writes still allow credential/role modification, bypassing the new guards: B2 is not fully resolved. B3/default `123` accounts remain; no must-change flag exists. Follow-up needs authenticated state access, password hashing/onboarding, OTP/Google/legacy migration, rate limiting and revocation. Password changes do not revoke tokens before expiry. Use HTTPS and never log credentials/tokens.

## Migration, rollback and validation

Ship server/module/frontend together with a persistent private key; verify login, embedded tabs and manager backup/restore with synthetic data. Rollback needs no data migration and restores the previous management exposure; older servers support React's explicit fallback. Do not package credentials.

Backend: new tests 9/9 pass. Normal discovery hangs in the existing attendance TestClient test in this sandbox; a temporary runner skipping TestClient requests reports **203 tests, OK, skipped=14** (6 existing + 8 HTTP tests). No skip was added to repository tests. Frontend: **203 passed, 1 skipped**; `npx tsc -b` passes. Rerun normal backend discovery outside this sandbox.
