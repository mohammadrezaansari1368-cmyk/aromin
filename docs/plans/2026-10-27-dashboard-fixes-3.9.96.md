# Dashboard fixes 3.9.96

## Prompt-master analysis (first)
1. Import: restore forecast Excel backup/save with the current dashboard session. Constraints: origin/source/message validation, no wildcard credentials, no credential persistence/logging, backup must precede mutation. Ambiguity: expiry is a hypothesis until reproduced; hidden import and general legacy frames have separate lifecycles. Success: synthetic import backs up and saves; one 401 retry; refreshed session reaches already open frames; forged messages rejected.
2. Council: measure initial load and remove evidenced bottlenecks. Constraints: preserve council behavior, no dependencies/schema/index migrations. Ambiguity: local synthetic timings cannot establish production DB/network latency. Success: recorded before/after API timings, request count/payload and chunk sizes/render evidence; room usable without waiting for decorative WebGL.
3. Site assistant/ZURVAN: reproduce synthetic failure paths and restore handled answers. Constraints: no live keys, no invented knowledge, keep origin/rate/tenant security and logo, no raw exception or secrets. Ambiguity: production configuration is unavailable, so do not assert its state. Success: normal synthetic response and handled Persian fallback/contact path for no key, unavailable KB, model failure, timeout, disabled agent and unknown site.

Shared constraints: existing worktree/branch, no commit/push/main/deploy; no dependency/schema changes. Version marker 3.9.96 must remain compatible with install health check. Run requested full checks; keep generated assets/screenshots outside tracked files.

## Brainstorming
Import: authenticate explicitly in each frame and before backup rather than rely on legacy UI login state; retry only unauthorized operations once. Council: inspect server seats path, eager dependency graph and WebGL initialization before choosing caching or splitting. Widget: preserve fail-closed registry/origin boundaries while rendering service unavailability as a normal handled assistant message.

## Writing-plans
1. Record baseline and add failing regression tests; reproduce root causes before production edits.
2. Implement bounded session bridge, authenticated import and renewal for open frames.
3. Profile council API and build; isolate heavy rendering only where measurements justify it.
4. Add handled widget degradation with safe diagnostic codes and failure-mode tests.
5. Bump version, self-review each diff, run full tests/typecheck/build, capture synthetic browser screenshots where available, prepend short HANDOFF note.

## NEEDS APPROVAL
No schema/dependency change planned. Deployment and production configuration changes belong to the user; no live mutation authorized.

## Evidence / verification
Completed evidence follows: red regressions were recorded before their fixes; final commands were executed locally.

## Systematic-debugging: root causes and reproductions

### 1. Forecast import/session
- `ImportPage` originally sent only `{aromin, id, files}`; its hidden engine never received credentials. `backupNow` requires a session, an admin role and a token before issuing any request. This explains a local backup failure before the backup POST.
- `LegacyHost` recreated its message listener on session changes but sent auth only on initial frame load/ready. The embed handler additionally skipped authentication whenever the login overlay was already hidden. Therefore neither side actually applied the advertised 20-minute renewal to open frames.
- Red evidence: both new bridge tests initially failed; the import message had no token and rerendering the host with a renewed session sent no auth message.
- Fix: current session ref at import dispatch (including after asynchronous work), same-origin and exact frame-source checks, message validation, explicit session resume before reload/backup, and a single 401 renewal/retry on backup/save. Open import/general frames receive auth changes; legacy always accepts renewed credentials irrespective of overlay state. Credentials remain in memory and use the exact origin.
- Green evidence: executable legacy bridge test asserts auth → load → backup → import → save; foreign origin/source, malformed files and failed authentication do not mutate data. The bounded retry test checks two operation attempts maximum. Browser CSV fixture reached auth → backup → save and displayed «۱ فایل وارد و ذخیره شد». Existing backend expiry/resume/tenant-binding tests also ran in the full suite; no auth server changes were needed.

### 2. Council profiling and fix
- Root cause: a cold scoped `_kb_docs` request recursively loaded all tenant documents before filtering collections. Body downloads were sequential. The council only needed council documents. The browser also imported/initialized decorative Three.js before displaying seats.
- Red evidence: the new council regression observed two body GETs for one council and one unrelated document (expected one).
- Fix: cache per tenant/public/scope, filter S3 metadata before downloading document bodies, retain body-level tenant/collection/internal validation, reuse a fresh full cache, and invalidate all scopes on existing KB writes. No schema/index/migration change. Decorative Globe now loads separately after seats have painted; the council's existing CSS glow is the fallback. The existing seats API remains one request; no independent API awaits existed to parallelize.

| Measurement | Before | After |
| --- | ---: | ---: |
| Cold `/api/council/seats`, synthetic 20-document KB, 10 ms per body GET | 207.99 ms | 13.03 ms |
| S3 content GETs (one council document, 19 unrelated) | 20 | 1 |
| Synthetic body text read | 20,000 chars | 1,000 chars |
| Endpoint JSON response | 3,455 bytes | 3,455 bytes |
| Browser seats-visible, local Chromium/Vite single run | 1,633.2 ms | 643.7 ms |
| Browser `/api/council/seats` resource duration, mocked API | 11 ms | 8 ms |
| Initial council JS chunk, production build | 33.25 kB | 26.69 kB |
| Initial council JS gzip | 12.14 kB | 9.69 kB |
| Decorative Globe JS, deferred | bundled | 7.39 kB (3.11 gzip) |
| Three.js chunk, deferred after fix | 695.88 kB | 704.83 kB |
| Observed long tasks, navigation through two seconds after seats | 39 / 3,261 ms total | 20 / 1,965 ms total |
| Largest observed long task | 274 ms | 324 ms |

These are synthetic/local measurements, not production benchmarks. Endpoint auth, config, listing and migration were mocked in the S3 latency experiment; no live network or DB was profiled. The API payload and API call count remain unchanged. The dev Three.js resource is about 5.68 MB uncompressed. Splitting improves the initial path, not total eventual bytes (the Three.js output grew slightly after chunking). Long-task sampling includes parsing/WebGL and is not an isolated React commit measurement; the largest task did not improve. The existing animation remains expensive in software-rendered Chromium; no claim of sustained render-cost elimination.

### 3. Public site assistant/ZURVAN
- Reproduced causes: an AI/configuration failure became `ok:false`/HTTP 502; a worker exception escaped `Future.result`; the explicit ZURVAN registry fail-closed path returned 403; an empty/unreachable scoped KB returned only «اطلاعات ندارم»; unknown sites returned 404. The widget displayed raw caught error text instead of a contact recovery message.
- Red evidence: synthetic regressions saw 502 instead of a handled 200, an uncaught worker exception, and no contact fallback for missing KB.
- Fix: a handled `{ok:true, unavailable:true, text, code, mood}` with Persian contact text; fixed diagnostic codes in logs, bounded worker timeout and safe exception boundary. Fallback turns are not training samples and do not trigger a purchase action. Existing lead capture stays visible. Unknown-site config/chat are handled without granting CORS to an unregistered origin; disallowed origins still receive 403, and the widget shows a local Persian fallback when CORS/network access fails. No registry auto-enable or fabricated KB answers.
- Green regressions cover no API key, empty KB, KB connection exception, model failure, timeout, disabled agent, unknown site/config, config connection failure, untrusted origin, worker exception and a normal mocked answer. Existing lead persistence/error audit tests now assert the new 200 response while retaining their DB/lead assertions.
- Production cause cannot be narrowed to a particular key, model, site registration or S3 setting from this offline worktree. Those settings were never inspected, changed or logged. Enabling/configuring a disabled or missing production agent remains an operator action, not something the code silently does.

## Code review
Self-reviewed every production/test diff: auth credentials use exact target origin and parent/frame identity; no new storage of credentials; backup stays before import mutation; retry cannot loop; scoped caches retain tenant/public separation and invalidation; provider exceptions are not printed or returned; origin/rate/registry boundaries remain enforced; no logo, schema, dependencies or protected financial fields changed. `git diff --check` passes. Version runtime expression and the terminal install-health marker both read 3.9.96; the existing package/health regression verifies their agreement.

## Verification-before-completion
- `cd frontend && npx vitest run`: 43 files passed; 272 passed, 1 skipped.
- `cd frontend && npx tsc -b`: passed.
- `cd frontend && npm run build`: passed for dashboard, widget and agent builds (final widget-agent build completed successfully).
- `cd deployment && python3 -m unittest discover -s tests -v`: 363 run, OK, 6 skipped (MariaDB-dependent checks); no live DB integration claim.
- Chromium exercised the actual council component, actual import component/legacy engine with local API stubs and a synthetic monthly CSV, and actual public widget with synthetic normal/fallback API responses. Ancillary import identity/attendance/knowledge components were stubbed for the screenshot harness. An unrelated legacy fixture console event reported `Unexpected identifier 'PeydaWeb'`; backup/save still completed. No screenshot/log contains an actual credential.

## Screenshots
All eight PNGs are outside Git in `/workspace/aromin-fixes-shots/`:
- `council-390.png`, `council-1440.png`
- `import-after-backup-390.png`, `import-after-backup-1440.png`
- `widget-fallback-390.png`, `widget-fallback-1440.png`
- `widget-normal-390.png`, `widget-normal-1440.png`

## Files changed / delivery
`deployment/server.py`, `deployment/legacy.html`, `deployment/tests/test_dashboard_degradation.py`, `deployment/tests/test_aromin_agent.py`, `frontend/src/components/ImportPage.tsx`, `frontend/src/components/LegacyHost.tsx`, `frontend/src/components/council/CouncilRoom.tsx`, `frontend/src/components/council/CouncilRoom.dom.test.tsx`, `frontend/src/lib/legacy-session.dom.test.tsx`, `frontend/public/zurvan-widget.js`, this plan, and the short top note in `HANDOFF.md`.

Branch `codex/dashboard-fixes-3.9.96`; no commit, push, main change or deployment. Parent retains the worktree and existing node_modules symlink for review/commit. User approval/execution is required for production installation and any production key/model/registry/site/KB configuration; no additional schema/dependency approval is needed for these changes.

Cleanup: stopped the task-owned Vite dev server and removed temporary harness/edit scripts and intermediate logs; retained the requested screenshots, ignored build output and four final verification logs under `/tmp/aromin-{vitest,tsc,unittest,after-build}.log`. Worktree and the pre-existing node_modules symlink are preserved for the parent.
