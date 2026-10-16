# XSI

CONFIRMED: Independent partial SmartX reconstruction. No reference API integration or copied customer records. See docs/evidence.md and docs/product-map.md for observations and limits.

CONFIRMED: Start the loopback allowlisted preview with `node serve.mjs`, then open http://127.0.0.1:8081/. The club dashboard/customer-list buttons open branch.html. All 125 fixtures are generated and labeled synthetic, with TEST-PHONE identifiers rather than real phone numbers.

CONFIRMED: Search applies with the adjacent button; draft and Enter leave the current results unchanged. Filters, page sizes, pagination and more-menu disclosure work locally. Exports, imports, record creation/edit/delete/credit and unvisited destinations remain disabled.

INFERRED: Local substring matching fields, synthetic filter predicates, page reset/clamping and visual styling are independent choices. They do not assert exact SmartX data or visual parity.

CONFIRMED: Run all unit suites with `node --test --test-isolation=none tests/*.test.mjs`. Latest result: 16 passed, 0 failed. tests/browser-scenario.json is the reproducible REA input (Windows Edge executable path is host-specific). Capture its local-only result, then run `node tests/verify-browser.mjs path/to/capture.json`. Desktop and mobile each passed 34 assertions; return-navigation regression passed 8. tests/browser-results.json records evidence IDs and totals. Raw local captures are ignored.

UNKNOWN: Authentication outcomes, backend rules, role enforcement, exact matching/sorting and record-changing workflows. Never add browser profiles, credentials, tokens, cookies or reference customer data. Both .local-browser/ and .local-browser-chrome/ are ignored and excluded from delivery.
