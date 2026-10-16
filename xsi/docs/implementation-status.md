# XSI implementation status

| Capability | Status | What actually works |
|---|---|---|
| Local authentication | CONFIRMED | First-owner setup, login, logout, password hashing, session expiry enforcement and CSRF checks |
| Customer basics | CONFIRMED | Create validated name/mobile, reject duplicate/invalid input, view owner-scoped basics and list stored records |
| Persistence | CONFIRMED | SQLite records and credential hashes survive actual process exit/restart; old-session/database reopen tested through API |
| Live/demo separation | CONFIRMED | Real local data starts empty; demo uses a separate read-only SQLite file with explicit synthetic notice |
| Search/filter/page | CONFIRMED | API-backed combinations and 10/20/50/100 pagination; local predicate choices remain INFERRED |
| UI states | CONFIRMED | Loading, empty results, server error/retry, field errors, duplicate feedback, mobile dialog and auth redirects |
| Financial/group/history | UNKNOWN | Disabled/unimplemented pending reference rules and schemas; real monetary fields remain null |
| Reference form parity | BLOCKED | Await manual unsaved-form opening; independent minimal XSI form is not claimed as SmartX parity |
| Unit/API tests | CONFIRMED | Final complete run: 30 passed, 0 failed, 0 skipped with --max-old-space-size=128; an earlier rerun aborted with native OOM and was not counted |
| Browser tests | CONFIRMED | 85 assertions passed, 0 failed: bootstrap/basic-create 14, desktop API-backed controls 31, mobile 31, error/loading/mobile-form 9 |
| Layout | CONFIRMED | Local screenshots reviewed at 1280x800 and 390x844; mobile navigation collapses and form buttons/fields fit visible dialog |
| Exact visual parity | UNKNOWN | Not established; no screenshots of reference customer records saved |
| Remote delivery | CONFIRMED | Authenticated connector access; changes prepared on chore/xsi-folder-20261016 based on 16cd2ed31ad1eecc55e3d755baf4fff57d28f356 |

CONFIRMED: User entry is http://127.0.0.1:8082/login.html. Create a local account (not SmartX credentials), register basic customers, search/filter/page the local account, switch explicitly to synthetic demo, and return/re-login without losing stored records. node run.mjs (or node serve.mjs) starts the application; old static 8081 preview is obsolete.

CONFIRMED: Browser tests use isolated synthetic customer records and newly generated test credentials; the real application database has not been populated with these test accounts. No passwords, session tokens or database files enter Git.

CONFIRMED: Actual browser-test process IDs changed from 15280 to 11588 and later 4416. The stored synthetic test customer and credentials remained available after restart. Default API tests also close/reopen server and both SQLite files and verify prior session access.

BLOCKED: Direct shell launch of Playwright failed with spawn EPERM, and connection to the already-open reference Chrome timed out. No restriction changes were made; local browser tests ran through REA's available owned-browser tool. No reference form submission/financial mutation tests were run because prohibited by scope; their business outcomes remain UNKNOWN.

CONFIRMED: Browser profiles remain local and ignored. .data/, databases/WAL, .delivery/, local captures and environment files are excluded by explicit publication allowlist. Local source remains in D:\\xsi. Publication SHA is stored in the ignored delivery receipt and final response, since a commit cannot contain its own SHA.
