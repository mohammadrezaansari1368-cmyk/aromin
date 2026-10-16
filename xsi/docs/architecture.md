# XSI architecture

CONFIRMED: The current coherent slice is local account setup/login -> owner-scoped customer list -> validated basic customer creation -> stored SQLite record -> reload/restart/read. It is an independent application, never a SmartX write client.

| Layer | Status | Responsibility |
|---|---|---|
| backend/app.mjs | CONFIRMED | Loopback HTTP/static server, JSON API, origin/CSRF/session checks, error boundary; no network client |
| backend/database.mjs | CONFIRMED | Native Node SQLite; WAL and prepared statements; separate .data/xsi.sqlite and .data/demo.sqlite |
| backend/auth.mjs | CONFIRMED | Scrypt password hashes, random session cookies, hashed session identifiers, 8-hour expiry, server-side logout |
| backend/customers.mjs | CONFIRMED | Request validation, digit normalization, create/list/basic detail, owner scope, bounded SQL pagination and escaped LIKE |
| backend/errors.mjs | CONFIRMED | Typed API errors and allowed-field validation |
| src/api.mjs | CONFIRMED | Same-origin API client; in-memory CSRF token; errors/session handling |
| src/branch.mjs | CONFIRMED | UI only: controls, asynchronous loading/error/empty states, dialogs, read-only menu and basic local create |
| src/branch-state.mjs | CONFIRMED | UI transitions; prior pure synthetic selector retained for unit regressions, not used as the data source |
| src/synthetic-data.mjs | CONFIRMED | Generated fixtures imported only by server/demo tests; never imported as live application records |
| run.mjs / serve.mjs | CONFIRMED | Application startup at 127.0.0.1:8082; serve.mjs is a compatibility alias |
| tests | CONFIRMED | Unit + actual HTTP/API + database reopen + isolated REA browser scenarios |

INFERRED: Proportionate XSI choices use installed Node 24.20.0 / SQLite 3.53.4, no installed dependencies, one process and one local database. This is a loopback workstation application, not an internet-hosted production deployment.

## Proposed XSI rules versus reference observations

INFERRED: Local access policy is ownership, not a guessed SmartX role map. First local setup creates one owner; public setup then closes. Existing accounts can log in; management of additional accounts/roles is unimplemented. Every live read/write is scoped to the authenticated user. Tests internally create a second actor solely to verify isolation.

INFERRED: Local credential policy is 3-64 Latin username characters and 12-128 password characters; sessions expire after eight hours. Cookies are HttpOnly, SameSite=Strict, Path=/api on loopback HTTP. Non-GET authenticated requests need CSRF and same-origin checks; login/setup are rate-limited. Remote TLS deployment is not implemented or claimed.

INFERRED: Minimal XSI customer data is name (1-100 characters) and Iranian-style mobile (11 digits starting 09), with Persian/Arabic digit normalization and uniqueness per owner. These are independent XSI validation rules, not established SmartX validation. First local records are active/local-source/untrusted-category defaults for view filtering; no SmartX category parity is claimed.

CONFIRMED: Live credit, purchase date/total and group are unknown/null at creation. API rejects additional financial/group fields. No credit, purchase, group, deletion or edit mutation exists. Demo amounts are arbitrary generated fixtures, not financial calculations.

INFERRED: Search fields, substring normalization, category predicates, page reset/bounds, local validation wording and responsive layout are independent rules. Existing evidence confirms the control interactions, not exact data predicates or pixels.

## Storage and operation

CONFIRMED: .data/ and all SQLite/WAL files are excluded from Git and the static allowlist. No database files, authentication material, profile contents, raw reference captures or customer rows are part of delivery. Demo is a physically separate database and its API is read-only.

CONFIRMED: node run.mjs starts http://127.0.0.1:8082. XSI_DATA_DIR and XSI_PORT are per-process overrides. The real application currently has no seeded account; the user creates their own local account in the UI. Browser tests use separate .data/browser-tests/ directories and generated credentials; no default passwords.

UNKNOWN: Reference form fields/validation, groups, credit rules, purchase-history schema, authorization and production operations such as backups, recovery, TLS and multi-device access remain outside this milestone.

CONFIRMED: Publication preserves the existing branch tree and all unrelated paths, updates xsi/ only, and never force-pushes or touches main. The user's explicit D:\\xsi/five-doc requirements override destination AGENTS defaults about temporary clones and minimal documentation.
