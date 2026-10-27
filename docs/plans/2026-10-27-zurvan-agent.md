# ZURVAN agent — 2026-10-27

## Prompt-master analysis
Goal: extend AROMIN's existing agent registry with زروان, public KB-only sales and authenticated in-app setup surfaces, a tenant-safe explicit-confirmation proposal workflow, and one-code embeddable widget.
Constraints: use only the two supplied worktrees; no commits, pushes, deployment, live uploads, new dependencies, ZURVAN schema changes, logo edits, private documentation content or secrets in the public repository. Corpus belongs only in /workspace/zurvan-kb. Preserve existing finance and registry behavior.
Assumptions/ambiguities: current AI_MODEL is the default; additional Arvan models must be explicitly configured and availability is not assumed. Existing business authentication/storage must be inspected before deciding whether a real settings adapter is possible. Historical documentation is evidence, not a guarantee of currently shipped features or prices.
Success criteria: registry routing and model validation tests; sanitizer tests and offline corpus/dry-run; unconfirmed and cross-tenant operations denied with audit evidence; compatible head snippet and themed accessible widget; real builds/tests in both worktrees; browser screenshots if installed. Any unavailable secure integration is explicitly blocked and never simulated as a successful live apply.

## Brainstorming
Reuse registry/spec/RAG, site token/origin checks, existing leads, mascot moods and settings UI. Keep ZURVAN settings writes behind an adapter. Prefer fail-closed production adapter until the private app's authorization and persistence can enforce owner-confirmed tenant-bound requests. Render a lightweight independent avatar with lazy chat UI.

## Writing-plans
1. Inspect targeted registry, widget, KB uploader, auth, private settings and all-branch docs/expression history. Record discovered paths and blockers without private content.
2. Write failing tests for sanitizer, registry/model routing and tenant-confirmation/audit boundaries.
3. Implement minimal extensions and offline KB corpus generator; run targeted tests, diagnose each failure before changes.
4. Implement dashboard configuration/install and widget using established APIs; verify private head-code compatibility.
5. Self-review every diff, run both projects' prescribed build/test commands, capture screenshots if browser tooling exists, record exact evidence and remaining decisions here. Add one short HANDOFF paragraph.

## Discovery / evidence
See the implementation and evidence below.

## BLOCKED — needs user decision
No ZURVAN schema migration or new dependency was required for the implemented bridge. No live service was contacted. Remaining product decisions and connection prerequisites are listed below.


## Implementation and boundaries
AROMIN extends AGENT_KEYS/defaults/intent routing/agent_spec, the existing agent settings model and UI, existing KB collections, existing public siteId/domain checks and leads. `zurvan_public` is the only public RAG scope; internal app scope adds `zurvan_setup`. A ZURVAN turn uses the configured allowlisted model through existing Arvan `ai_chat`; default is current AI_MODEL, and Google override and visitor model overrides do not replace it. Extra model IDs must be operator-verified and supplied through ZURVAN_MODELS. No model availability is asserted.

The install card has a ZURVAN option generating exactly one external async script with data-site-id. Register the host domain, select that site in the زروان registry row, enable the agent and global switch, then paste the snippet into ZURVAN's enabled «کد اضافی در head». siteId is a public per-tenant site token, never a settings credential. Existing origin/domain checks and limits apply. Public chat explicitly requests the allowed ZURVAN registry entry and fails closed if it is disabled for the site. Public turns do not receive unrelated shop catalog, web grounding or cart products; missing KB evidence returns «اطلاعات ندارم».

The ~10 KB uncompressed widget uses Shadow DOM, lazy creation of the chat panel and lazy config fetch, fixed positioning bottom-left, CSS 3D shading, documentElement data-theme (ZURVAN's marker) with prefers-color-scheme fallback, RTL, reduced-motion support, keyboard Escape/focus restoration, textContent rendering and no new dependency or artwork. Public lead submission uses the existing lead API and an explicit consent form. In the private app, AppLayout exposes a tenant-bound bridge only while permitted head code is installed; chat uses the existing authenticated same-origin workspace panel with CSRF checks. Its server-to-server call uses a separate per-business credential. No attendance rows or customer records are sent as chat context. The public script's site token cannot authenticate a settings or internal KB call.

AROMIN stores proposals and full before/after audit in a new tenant-keyed MariaDB table initialized alongside existing agent tables; row locks serialize proposal/confirmation/apply/rejection. FakeAdapter is test-only; the default adapter can draft unknown-current proposals but rejects every live apply. RemoteAdapter uses an explicit per-tenant HTTPS connection map, rejects redirects and sends only the mapped private business ID/token. Confirmation requires a literal UI boolean and authenticated manager. Remote apply independently requires the private app owner's explicit button confirmation; AROMIN manager confirmation alone cannot authorize private writes.

ZURVAN stores bridge metadata/hashes, proposals and audit in the existing workspace_state JSON, outside public settings/bootstrap. No schema changes. Owner-only token generation rotates a 256-bit token, exposes it only for explicit clipboard copy, stores only SHA-256, and rejects pending proposals on rotation. `/api/zurvan-agent` is a rate-limited server endpoint with business-bound Bearer verification and read/propose/status/apply/reject actions. `/admin/zurvan-agent/{propose,proposals,confirm,apply,reject,token,chat}` go through authenticated owner workspace access and existing optimistic versioning. Model tool `proposeZurvanSettings` can save a draft, never confirm or apply it. HeadCode's approval card displays current/proposed/why, explicit owner confirmation, a separate apply button for supported changes, and rejection. Private audit records tenant, actor, timestamp and before/after; stale or unconfirmed proposals cannot apply. Remote adapter status checks recover an already-applied action without a second private write.

## Remaining decisions / partial coverage
- Automatic settings application is intentionally limited to `missionNotifications` → `settings.notify.missionsAll` (explicit boolean notification policy, asked separately from whether the business uses missions). This is not a claim that it enables/disables mission functionality. Shift hours/types, leave policy, workplace/geofence, business description and headcount can be interviewed and proposed, but applying those proposals remains manual; they need typed mappings/record selection and domain validation, not a new DB table or dependency. Unknown current values remain null, not guessed.
- AROMIN's interview form supports offline and remote multi-field draft proposals. Automatic application only supports a single typed boolean mission-notification diff; other changes are rejected before any write rather than partially applied.
- Connection setup is manual/offline here: generate a private bridge token in the ZURVAN owner UI, configure AROMIN server ZURVAN_CONNECTIONS as a JSON object keyed by AROMIN tenant with `{url, businessId, token}` (url must end in HTTPS `/api/zurvan-agent`), and ZURVAN server ZURVAN_AROMIN_CONNECTIONS keyed by private business ID with `{url, tenant, token}` (url must end in HTTPS `/api/agent/zurvan/bridge`). The same private connection token is used in the two directions; neither map belongs in git or client HTML. No live token has been created here.
- Public KB derives only actual current sidebar option names; plan/pricing/details require owner-reviewed documents. Historical private documents are internal evidence and must not be made public wholesale. Review generated files before any live upload. Choose/verify additional Arvan model IDs before adding them to the allowlist.
- No schema/dependency blocker exists for the implemented subset. The broader settings mapping and public pricing source remain incomplete; no automatic migration or unapproved settings guess was substituted.

## Knowledge corpus and exact offline/operator commands
Generator enumerates every local and remote branch plus `git log --all` history of the targeted documentation, menu, assistant and bot-flow sources, deduplicates blobs and applies conservative secret/contact/private-IP/SSH sanitization before writing outside git. Manifest (source path/revision per document) is at `/workspace/zurvan-kb/manifest.json`. No private document content is added to AROMIN. Public output is a separate `public/` directory, extracted from current sidebar labels, with no invented prices or plan claims.

```bash
python3 tools/generate_zurvan_kb.py --repo /workspace/zurvan-agent-api --out /workspace/zurvan-kb
python3 tools/upload_kb_docs.py --tenant "$AROMIN_TENANT" --dir /workspace/zurvan-kb --collection zurvan_setup --internal --dry-run
python3 tools/upload_kb_docs.py --tenant "$AROMIN_TENANT" --dir /workspace/zurvan-kb/public --collection zurvan_public --dry-run
# After deployment and review, on the user's own machine with AROMIN_USER/AROMIN_PASS set privately:
python3 tools/upload_kb_docs.py --base "$AROMIN_BASE" --tenant "$AROMIN_TENANT" --dir /workspace/zurvan-kb --collection zurvan_setup --internal
python3 tools/upload_kb_docs.py --base "$AROMIN_BASE" --tenant "$AROMIN_TENANT" --dir /workspace/zurvan-kb/public --collection zurvan_public
```

Dry-run: 77 internal documents and 1 public sidebar document; zero uploads. Shell variables above must be set by the operator to their actual deployment/tenant; there are no sample credentials.

## Found paths and history
`git branch -a` and `git log --all` were inspected in the private worktree; all available refs are searched by the generator. No remote fetch or new checkout. Relevant assistant history: 127f243, 8a55f0d, e6af92d. `src/pages/Assistant.jsx` is the old setup questionnaire, not an expressive mascot; its /assistant route now redirects home. No harikan7-named assistant asset exists in the available all-branch history. No separate feature-list file was found; menu paths and bot flows provide source evidence.

Distinct corpus source paths (paths only, no private source contents):
- `AGENTS.md`
- `README.md`
- `docs/AROMIN-DASHBOARD-API.md`
- `docs/AROMIN-TRANSFER.fa.md`
- `docs/ARVAN-SERVICE.fa.md`
- `docs/IMPLEMENTATION-HANDOFF.fa.md`
- `docs/IMPLEMENTATION-STATUS.fa.md`
- `docs/IMPORT-VERIFICATION-20261024.fa.md`
- `docs/MCP-CHATGPT.md`
- `docs/MCP-CLAUDE-CODE.md`
- `docs/PROJECT-ROADMAP.fa.md`
- `docs/WEB-ACCOUNTS.fa.md`
- `docs/WEB-WORKSPACE.fa.md`
- `docs/analysis/REPORT.fa.md`
- `docs/analysis/api-contracts.csv`
- `docs/analysis/api-map.fa.md`
- `docs/analysis/auth-architecture.fa.md`
- `docs/analysis/domain-models.fa.md`
- `docs/analysis/route-map.fa.md`
- `docs/leave77/matrix.js`
- `docs/payroll/API.fa.md`
- `docs/payroll/ASSUMPTIONS.fa.md`
- `docs/plans/2026-10-26-head-code-and-remove-setup.md`
- `docs/plans/2026-10-26-pull-sync-and-sidebar.md`
- `docs/plans/2026-10-26-zurvan-story-scroll.md`
- `docs/plans/2026-10-27-hourglass-clock.md`
- `docs/plans/2026-10-27-settings-single-list.md`
- `docs/plans/2026-10-27-tree-navigation.md`
- `docs/specs/liquid-sculpture-hero.txt`
- `src/menu.jsx`
- `src/pages/Assistant.jsx`
- `src/sidebar-menu.js`
- `tgcloud/lib/bot-surface.js`
- `tgcloud/lib/decision-chat.js`
- `tgcloud/lib/leave-chat.js`
- `tgcloud/lib/mission-chat.js`
- `tgcloud/lib/presets.js`
- `tgcloud/lib/punch-chat.js`
- `tgcloud/lib/request-flow.js`
- `tgcloud/lib/ticket-chat.js`

Additional discovery: `src/pages/HeadCode.jsx`, `src/head-code.js`, `src/theme.js`, `src/layout/AppLayout.jsx`, `server/workspace.mjs`, `server/auth.mjs`, `server/support-agent.mjs`. Untouched logo path: `public/brand/zurvan-approved-logo.jpeg`. AROMIN mascot sources: `frontend/src/widget/agent/core.ts`, `frontend/src/components/agent/expressions3d.ts`, `frontend/src/components/agent/SmartAssistant3D.tsx`, `frontend/public/agent/*.webp` (no raster assets reused/added).

Expression names retained from AROMIN core: neutral, idle, listening, thinking, speaking, happy, laugh, curious, surprised, concerned, confused, serious, annoyed, angry, success, error, sleeping, sad, fear, disgust, smug. Existing 3D reaction aliases retained: joy, anger, surprise, sadness, lookdown, sleep (plus overlapping neutral/fear/disgust/thinking/listening). The light widget uses the same names with CSS eye/mouth/head changes, not external copyrighted assets.

## TDD / debugging / self-review
Initial tests failed for missing ZURVAN registry, sanitizer and setup service. Sanitizer then exposed a standalone Bearer leak; fixed by redacting such lines. First private test run required the normal generated server build; the head-code fixture also incorrectly used POST rather than its real PUT contract and was corrected. Full private suite exposed the new server module missing from packaged release manifests/startup fixture; packaging inputs and the startup fixture were updated. Browser QA initially exposed a fixture Content-Type missing UTF-8; fixed the fixture. Self-review caught Shadow DOM expression selectors needing :host(), cross-site fallback routing, rejecting remote proposals and deployment install/rollback module copying; corrected before final verification. Generated bundler path-comment churn is removed from tracked private files at cleanup.

## Verification evidence
Final command results and changed-file inventory are appended after the final run. Screenshots and browser evidence use synthetic local HTTP responses only, stored outside git at `/workspace/zurvan-agent-shots/`; script invokes the private repo's actual installHeadCode function. Browser checks cover 390/1440 widths, both themes, collapsed/open panel, no page errors/overflow, a synthetic chat response and Escape focus restoration. No live API, S3, deployment, commit or push was used.


All-branch discovered documentation paths (including analysis JSON and non-corpus design/build files):
- `docs/AROMIN-DASHBOARD-API.md`
- `docs/AROMIN-TRANSFER.fa.md`
- `docs/ARVAN-SERVICE.fa.md`
- `docs/IMPLEMENTATION-HANDOFF.fa.md`
- `docs/IMPLEMENTATION-STATUS.fa.md`
- `docs/IMPORT-CHECKPOINT-20261024.json`
- `docs/IMPORT-VERIFICATION-20261024.fa.md`
- `docs/MCP-CHATGPT.md`
- `docs/MCP-CLAUDE-CODE.md`
- `docs/PROJECT-ROADMAP.fa.md`
- `docs/WEB-ACCOUNTS.fa.md`
- `docs/WEB-WORKSPACE.fa.md`
- `docs/analysis/REPORT.fa.md`
- `docs/analysis/api-contracts.csv`
- `docs/analysis/api-contracts.json`
- `docs/analysis/api-map.fa.md`
- `docs/analysis/asset-inventory.json`
- `docs/analysis/auth-architecture.fa.md`
- `docs/analysis/coverage.json`
- `docs/analysis/domain-evidence.json`
- `docs/analysis/domain-models.fa.md`
- `docs/analysis/rea-services-summary.json`
- `docs/analysis/route-map.fa.md`
- `docs/analysis/routes.json`
- `docs/analysis/static-inventory.json`
- `docs/landing/ARVAN-DEPLOYMENT.fa.md`
- `docs/landing/BRIEF.md`
- `docs/landing/FILM-QA.fa.md`
- `docs/landing/FILM-build.log`
- `docs/landing/FILM-targeted-tests.log`
- `docs/landing/FILM-tests.log`
- `docs/landing/LENIS-REFERENCE.fa.md`
- `docs/landing/QA.md`
- `docs/landing/SCROLL-PLAYBACK-FIX.fa.md`
- `docs/landing/build.log`
- `docs/landing/tests.log`
- `docs/leave77/matrix.js`
- `docs/payroll/API.fa.md`
- `docs/payroll/ASSUMPTIONS.fa.md`
- `docs/plans/2026-10-26-head-code-and-remove-setup.md`
- `docs/plans/2026-10-26-pull-sync-and-sidebar.md`
- `docs/plans/2026-10-26-zurvan-story-scroll.md`
- `docs/plans/2026-10-27-hourglass-clock.md`
- `docs/plans/2026-10-27-settings-single-list.md`
- `docs/plans/2026-10-27-tree-navigation.md`
- `docs/specs/liquid-sculpture-hero.txt`
- `docs/zurvan-frames-prompts.md`


## Final verification (2026-10-27, offline)
- AROMIN `cd frontend && npx vitest run && npx tsc -b && npm run build`: exit 0; 42 test files passed, 268 tests passed / 1 skipped; tsc exit 0 (empty error log); all Vite builds succeeded. Evidence: `/workspace/aromin-vitest.log`, `/workspace/aromin-tsc.log`, `/workspace/aromin-build.log`.
- AROMIN `cd deployment && python3 -m unittest discover -s tests -v`: exit 0; 351 tests run / 6 skipped. `python` is not installed; Python 3.13's `python3` executes the same unittest command. Evidence: `/workspace/aromin-unittest.log`. Seven new offline ZURVAN tests cover registry/scope/model, sanitizer, persistence/audit, UI boolean confirmation, unauthorized roles, cross-tenant confirmation, stale/rejected proposals and replay.
- ZURVAN `npm run build && npm test`: exit 0; 1901 tests passed, 0 failed. Evidence: `/workspace/zurvan-build.log`, `/workspace/zurvan-tests.log`. Six new tests cover business token scope, explicit owner confirmation, head-code snippet storage, token rotation, chat proxy isolation, unsupported mappings without partial application, and local owner apply only after confirmation. Build emits the existing large-chunk advisory; it does not fail.
- `bash -n deployment/install.sh deployment/rollback.sh`, Python script compilation, JS syntax check, and both `git diff --check` pass. Actual install/deploy scripts were never executed.
- Browser QA: 8 PNGs (`light|dark` × `390|1440` × `collapsed|open`) and `evidence.json` in `/workspace/zurvan-agent-shots/`; actual private installHeadCode accepted/recreated the single script tag. Local synthetic fixture only. Visual inspection checked the dark 390px open panel. Reproduce with `python3 tools/capture_zurvan_widget.py` using already installed Python Playwright/Chromium; no package changes.
- KB dry-runs: 77/77 internal and 1/1 public files processed locally. No HTTP upload performed. Private corpus and manifest remain only under `/workspace/zurvan-kb/`, outside either repository.
- Branches remain `codex/zurvan-agent` at e840c85 and `codex/zurvan-agent-api` at 7dad9ce. No commits, pushes, remote changes, deployments, migrations on live data or secret creation. Both supplied worktrees are retained for parent review. Only generated tracked path-comment churn was restored; reference worktrees and logo were not edited.

## Final changed-file inventory

AROMIN:
- `HANDOFF.md`
- `deployment/install.sh`
- `deployment/rollback.sh`
- `deployment/server.py`
- `deployment/tests/test_zurvan_agent.py`
- `deployment/zurvan_setup.py`
- `docs/plans/2026-10-27-zurvan-agent.md`
- `frontend/public/zurvan-widget.js`
- `frontend/src/components/WidgetInstallCard.tsx`
- `frontend/src/components/agent/AgentsCard.tsx`
- `frontend/src/components/agent/ZurvanSetup.tsx`
- `frontend/src/lib/agents.ts`
- `tools/capture_zurvan_widget.py`
- `tools/generate_zurvan_kb.py`
- `tools/upload_kb_docs.py`

ZURVAN:
- `deploy/arvan/workspace-update-template.py`
- `scripts/package-arvan-service.py`
- `scripts/package-web-workspace.py`
- `server/auth.mjs`
- `server/workspace.mjs`
- `server/zurvan-agent.mjs`
- `src/layout/AppLayout.jsx`
- `src/pages/AgentApproval.jsx`
- `src/pages/HeadCode.jsx`
- `tests/deployment-startup.test.js`
- `tests/zurvan-agent.test.js`
