# WP-04: optimistic concurrency on tenant_state

**Status:** done. `tenant_state` gained a `version` counter; `GET`/`POST /api/state` expose and enforce it; every other server-side writer of `tenant_state.payload` bumps it; legacy and React frontends send it back. No existing behaviour (credentials guard, settlements validation, the `locked` 409, import-history/compensation preservation) changed order or shape.

## Design

`tenant_state` gets a `version BIGINT UNSIGNED NOT NULL DEFAULT 0` column (migration `014_tenant_state_version.sql`, idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, since migrations can run before `ensure_tenant_table()` has ever created the table, and may also run against a DB that already has the table from before this change). `ensure_tenant_table()`'s own `CREATE TABLE IF NOT EXISTS` was updated to include `version` so a brand-new DB matches without needing the migration at all.

`GET /api/state?tenant=` returns the current `version` in the JSON body and as a weak-looking `ETag: "<version>"` response header (quoted per HTTP convention; the value is just the integer, not a real content hash).

`POST /api/state?tenant=` reads `payload, version FROM tenant_state ... FOR UPDATE` inside the existing transaction (same row lock that already guarded the credentials/settlement checks), then:
- parses the client's intended version from the `If-Match` header (or `X-State-Version` as a fallback for callers that can't set `If-Match`), both via `_state_if_match()`;
- if a version was supplied and it doesn't match the current row's version, returns `409 {"ok": false, "error": "...", "conflict": true, "version": <current>}` **without writing**, before any of the existing credential/lock checks run;
- otherwise proceeds exactly as before, and the `INSERT ... ON DUPLICATE KEY UPDATE` sets `version = <current+1>` and the success response includes the new `version`.

The pre-existing `_c1_lock_violation` 409 (`{"locked": true}`, settlement line locked against edits) is unchanged and is checked after the version check; it never carries `conflict: true`, so callers can tell the two 409s apart.

Every other place that writes `tenant_state.payload` directly (`_store_password`, `import_history_delete`, `_c1_save`, `fix_stage_dates.py`'s rollback/apply paths, `compensation_update`) now also does `version = version + 1` in the same `UPDATE`/`INSERT ... ON DUPLICATE KEY UPDATE`, so a version bump always tracks a payload change regardless of which code path wrote it.

## Header contract

- `If-Match: <version>` (no quotes required, though quoted values are accepted) on `POST /api/state` — enforced: mismatch ⇒ 409, no write.
- `X-State-Version: <version>` — accepted as a synonym for callers that can't set `If-Match` directly.
- Absent entirely ⇒ **compatibility mode**: the write is accepted unconditionally (last-write-wins, as before), and the response still carries the new `version` so the caller can adopt the header on its next save.

## Frontend

`frontend/src/lib/forecastStore.ts` remembers `version` from `fetchFull()`/`saveState()` responses and sends it as `If-Match` on the next save. A `409` with `conflict: true` shows a fixed-position Persian notice («این داده هم‌زمان توسط کاربر دیگری تغییر کرده است...») with a «بارگذاری دوباره» button that reloads the page, and the pending save rejects — it never retries with the stale blob.

`deployment/legacy.html`'s `API.load`/`API.save` track `API.version` the same way; the debounced autosave and the fire-and-forget AI-mirror POST (~line 13231) both attach `If-Match` and both stop issuing further saves once a `409 conflict` is seen (`API.conflicted`), until the user reloads or the app re-applies a fresh snapshot (which clears the flag).

## Compatibility default (open question, not blocking)

Treating a missing `If-Match` as "accept unconditionally" is a deliberate business/compat decision for this slice, not a technical requirement — it keeps older cached SPA bundles and any other callers that predate this change working exactly as before. The tradeoff: those callers get none of the new protection and can still silently clobber a concurrent editor. If/when all first-party callers are confirmed to send `If-Match`, this could be tightened to reject writes without it; that is left as a follow-up decision for whoever owns the rollout, not made here.

## Shipping

`014_tenant_state_version.sql` / `.down.sql.txt` were added to install.sh's conflicting-migration guard, its backup list, and its copy-to-`migrations/` line, and to rollback.sh's restore list, following the existing 006–010 pattern. While auditing those lists per the WP-04 brief, found and fixed a **pre-existing gap**: `aromin_security.py` and `aromin_sessions.py` (added by WP-01) were imported by `server.py` but never shipped by install.sh, and `aromin_identity.py`/`aromin_attendance.py`/`aromin_calls.py`/`aromin_tickets.py` were missing from rollback.sh's restore list even though install.sh shipped them — both fixed here. `deployment/tests/test_install_shipping.py` now asserts every `migrations/*.down.sql.txt`'s matching `.sql`, and every `aromin_*` module imported by `server.py`/`fix_stage_dates.py`/`validate_ledger.py`, is referenced in both scripts, so this class of gap fails CI going forward.

## Rollback

`014_tenant_state_version.down.sql.txt` drops the `version` column. After rollback, `POST /api/state` code from this branch is gone too (rollback restores the prior `server.py`), so there's nothing left trying to read/write a missing column.

## Tests

Backend: `deployment/tests/test_state_concurrency_wp04.py` (migration idempotency text, `GET` reports version + sets `ETag`, matching `If-Match` saves and bumps version, stale `If-Match` → 409 conflict with no write, no `If-Match` → accepted for legacy compat, the pre-existing `locked` 409 stays distinct from `conflict`, other writers bump version) and `deployment/tests/test_install_shipping.py` (shipping-gap guard above). Full suite: `Ran 227 tests ... OK (skipped=6)` (was 217/skipped=6 before this slice — 10 new tests, all passing, nothing skipped).

Frontend: `frontend/src/lib/forecastStore.test.ts` (sends remembered version as `If-Match`, surfaces conflict without retrying the stale payload, omits `If-Match` before any version is known). `npx vitest run`: `210 passed | 1 skipped` (was 207/1 skipped). `npx tsc -b`: clean.
