# XSI — independent local customer basics

CONFIRMED: Run `node run.mjs` (or `node serve.mjs`) with installed Node 24.20+ and open http://127.0.0.1:8082/login.html. No packages need installation. First setup creates your own local owner account. Never enter SmartX credentials here.

CONFIRMED: You can create name/mobile customer records in the independent SQLite database, view their basic details, search/filter/page the account, log out/in and restart without losing stored records. Demo is explicitly selected and uses a physically separate read-only database. Credit/groups/purchases/edit/delete/import/export stay unimplemented and disabled.

INFERRED: The minimum XSI form, name/mobile validation and ownership policy are proposed local rules, not verified SmartX form/permission parity. See the coverage matrix in docs/product-map.md, architecture.md and unknowns.md. The reference form currently needs manual read-only inspection.

CONFIRMED: Runtime files live under ignored .data/. Per-process XSI_DATA_DIR and XSI_PORT can override location/port. Back up local data yourself before using it for important information; backup/recovery/remote deployment are not implemented. Both browser profiles stay local and excluded from Git; no profile/database/credential/customer records belong in commits.

CONFIRMED: Run all unit/API/integration tests: `node --max-old-space-size=128 --test --test-isolation=none tests/*.test.mjs`. Current complete result: 30 passed, 0 failed. An earlier unbounded rerun aborted with native OOM; it was not counted as passing. Tests use temporary databases, generated passwords and synthetic records only.

CONFIRMED: Current API-backed browser assertions are in tests/app-browser-checks.mjs. Verify an ignored local capture with `node tests/verify-app-browser.mjs path/to/capture.json`. tests/app-scenario.mjs generates a generic REA scenario using an environment-secret reference, never a stored password. tests/browser-fixture.mjs runs an isolated server on 8083 only when XSI_TEST_DATA_DIR is beneath .data/browser-tests/. Provision its throwaway account locally; keep credentials in memory/environment. Never point browser fixtures at the real application database.

CONFIRMED: Current browser result is 85 assertions passed, 0 failed: setup/create/auth 14, desktop controls 31, mobile controls 31, error/loading/mobile form 9. tests/app-browser-results.json records IDs and exact scope. The earlier browser-scenario.json/browser-checks.mjs and browser-results.json are preserved historical static-preview artifacts, not claims about the new backend.

UNKNOWN: Exact SmartX create/edit validation, groups, credit rules, history, role enforcement and visual parity. Only basic local customer management is delivered, not the full application.
