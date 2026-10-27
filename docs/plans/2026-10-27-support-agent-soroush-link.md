# Support agent / Soroush link — implementation plan and evidence

**Current contract:** Update A–E below supersedes the original seven-slot interview and original envelope-only JSON schema. Earlier results are historical evidence; final update evidence is recorded at the end.

## Prompt-master analysis
Goal: give each business an independently revocable customer support link, guided Persian intake, and a durable authenticated handoff to external Soroush-Support.
Constraints: existing worktree and branch; no commit/push/main/deploy; no new dependencies, schema, migrations, customer data, secrets in logs, or logo changes. Version becomes 3.9.97 using both existing legacy APP_VERSION markers only when implementation is verified.
Assumptions: Soroush-Support is external and performs SmartX actions without owner approval after customer consent. Link possession authorizes intake only. A confirmation means queued, never that SmartX execution succeeded.
Ambiguities resolved by this proposed design: pull is the initial transport; optional push is deferred; tenant-scoped service credentials are preferred over a global credential; consent is explicit and server-validated. No model decides whether to execute an action.
Success: isolation, revocation, bounded input, atomic durable enqueue, retry/idempotency, signed delivery, audit, RTL UI, complete test/build evidence and synthetic screenshots.

## Brainstorming and recommendation
1. Recommended: reuse existing sa_state(tenant,k,v) with support-prefixed keys and transactional chunked JSON. Existing VARCHAR(255) values require chunks of at most 200 Unicode characters, with a manifest and every chunk written in one transaction. All key names stay within VARCHAR(32). This avoids schema changes and keeps support state separate from editable dashboard state. Trade-off: bounded queue size and more rows per request; fail closed when full.
2. Reuse tenant_state.payload: simpler JSON, but general state replacement/export can overwrite or expose support state; reject.
3. Dedicated outbox tables: better indexing and scaling, but explicitly prohibited without approval; do not implement.

Existing evidence: server.py defines sa_state with a composite tenant/key primary key, _SaTx provides independent transactional connections, _w_allow provides abuse limits, _w_body caps public bodies, and _w_guard provides dashboard manager authorization. Agent registry includes support; agent_spec supplies its scope. AgentsCard.tsx is the existing settings entry point. No graphify executable was available; targeted rg was used.

## Approved architecture and implemented refinements
Use a focused deployment/aromin_support.py domain service with injected storage/clock/transport; wire routes into deployment/server.py. Storage acquires a per-tenant support sentinel row FOR UPDATE, then reads/writes namespaced chunks atomically. Never hold database locks across model/network calls. Discover links using a server-verifiable opaque token containing an authenticated tenant locator and 256-bit random capability; store only its digest and generation. Reject malformed/revoked generations before reading conversation data. Keep the URL capability in the fragment; public API receives it in a dedicated header, never query strings. Serve the chat shell without credentials and set no-referrer/no-store and restrictive CSP.

Guide the interview through server-owned slots: name, contact, business identity as supplied, request type, details, urgency, consent. Persist a bounded session under the resolved tenant. Any optional KB response uses agent_spec(tenant, support) and public kb_context with precisely the allowed support/general/products/dashboard_help scope; a tenant-neutral system prompt excludes the global Aromin identity and dashboard persona; model text cannot alter tenant, consent, slots, or enqueue state. Escape all UI text via React/textContent. Do not persist raw headers, cookies, initData, or full transcripts in audit. Summary is a fixed PII-minimized template from validated type/urgency, rather than model-generated free text. Business identity/urgency/consent remain bounded intake metadata; signed handoff has the required schema below.

Enqueue and session completion share a transaction. requestId is server-created and stable across repeated completion calls. Queue cap: 100 nonterminal requests per tenant; 8KiB handoff; 4KiB incoming body; customer detail input max 1700 characters; business identity max 200 characters, combined signed details <=2000 characters. Audit create/deliver/ack with request ID, event, timestamp, actor class only. Retain terminal requests for 30 days (max 300 total requests; max 100 nonterminal); audit retains the newest 2000 events or 30 days, whichever is shorter. Every create/deliver/ack, including repeated terminal ack and heartbeat, appends metadata-only audit. Admission stops at 1,250,000 serialized bytes, reserving 750KB within the 2MB storage cap for accepted requests, terminal notes/timestamps, and audit; completion/revocation never use the admission gate. Clear intake values after enqueue to avoid a second PII copy. Sessions expire after 24 hours (max 100). Return 503 on storage failure and never confirm an uncommitted request.

Pull delivery leases requests for 120 seconds; expired delivered/executing leases can be redelivered with the same requestId and a fresh opaque lease receipt. Only the current lease may ack/nack. Status transitions: queued → delivered → executing → done/failed. nack requeues with exponential delay capped at one hour. Retries have no automatic execution-count cutoff: Soroush must deduplicate actual SmartX effects. Return dashboard projections only (reference/status/timestamps/result note), never link digests, credentials, lease receipts or customer contact.

## Proposed endpoints
- GET /support: standalone lightweight Persian RTL customer page.
- GET /api/agent/support?tenant=…: manager-only link enabled state and recent queue projection.
- POST /api/agent/support/link?tenant=…: manager-only action generate/rotate/revoke; raw customer link returned only on generate/rotate.
- POST /api/support/session: X-Support-Link capability; create/resume guided session.
- POST /api/support/message: capability plus sessionId, message, expectedStep (integer 0–6); no tenant input accepted. A retry of the immediately preceding identical step/message returns its current result; stale/conflicting steps return 409.
- POST /api/support/question: capability plus sessionId and message (max 1000 chars); public tenant KB answer without changing interview state. Missing knowledge returns a deterministic no-knowledge message without calling a model.
- POST /api/support/submit: capability plus session ID; explicit consent, idempotent enqueue and reference.
- POST /api/soroush/pull: Bearer service credential and tenant; returns a leased batch capped at 10.
- POST /api/soroush/requests/{requestId}/ack: same auth/tenant plus receipt and status executing/done/failed, bounded resultNote.
- POST /api/soroush/requests/{requestId}/nack: same auth/tenant plus receipt; requeue with backoff.

The customer URL is /support#<capability>, never a query/path token. JS immediately removes the fragment using history.replaceState and keeps it only in memory; reopening the original link starts a new interview. API header: X-Support-Link. /support-assets/support.js and support.css are allowlisted static routes. CSP prohibits inline scripts/eval/frames and third-party resources.

Public routes enforce same-origin when Origin is supplied, reject foreign origins, allow normal navigation without Origin, and use existing IP extraction/rate limiting with additional per-link and per-tenant quotas. No permissive CORS. Rate limits (per process, as in the existing assistant): customer IP 120/10min, link 100/10min, public tenant 500/10min; manager tenant 200/10min plus link mutations 10/10min; service IP and service tenant independently 2000/10min. Service traffic does not consume customer quotas. Poll no faster than every 5 seconds per tenant and send executing heartbeats every 60 seconds. Manager mutations also receive rate limits. Tenant-scoped lookup applies before every queue read/change; unknown and foreign references return indistinguishable 404s.

## Soroush-side integration needed
Configure SOROUSH_SUPPORT_TOKENS_JSON (mapping tenant to independent high-entropy bearer credential) and SOROUSH_SUPPORT_SIGNING_KEY in server env/arvan.env. Credentials are never sent to customers/dashboard or logged. Missing signing key disables support operations with 503. Missing service-token mapping disables pull/ack/nack with 503. Changing the signing key also invalidates links and requires a plan for verification of already queued signatures; do not rotate it casually. Use TLS only.

Payload JSON schema: object with exactly schemaVersion(integer, const 1), requestId(string opaque server reference), tenantId(string <=64), customer(object with name string <=120 and contact string <=160), requestType(string <=80), details(string <=2000), chatSummary(string <=300), createdAt(UTC ISO8601 string), signature(lowercase HMAC-SHA256 hex). All fields required. Signature covers UTF-8 JSON of the object excluding signature, recursively sorted object keys, separators comma/colon, ensure_ascii=False; Soroush must reproduce these bytes. Verify constant-time before use.

Machine-readable payload schema (JSON Schema 2020-12):
```json
{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "type":"object","additionalProperties":false,
  "required":["schemaVersion","requestId","tenantId","customer","requestType","details","chatSummary","createdAt","signature"],
  "properties":{
    "schemaVersion":{"const":1},
    "requestId":{"type":"string","pattern":"^[A-Za-z0-9_-]{22}$"},
    "tenantId":{"type":"string","minLength":1,"maxLength":64},
    "customer":{"type":"object","additionalProperties":false,"required":["name","contact"],"properties":{"name":{"type":"string","minLength":1,"maxLength":120},"contact":{"type":"string","minLength":1,"maxLength":160}}},
    "requestType":{"enum":["راهنمایی","خطا","پیگیری","سایر"]},
    "details":{"type":"string","minLength":1,"maxLength":2000},
    "chatSummary":{"type":"string","maxLength":300},
    "createdAt":{"type":"string","format":"date-time"},
    "signature":{"type":"string","pattern":"^[0-9a-f]{64}$"}
  }
}
```
The serialized signed payload is capped at 8192 UTF-8 bytes. Treat all customer fields as untrusted data, including business identity, details and any markup. Never execute natural-language instructions as code; the external agent must map the consented request into its explicitly allowed SmartX operations.

Synthetic schema-valid example (illustrative signature; verify the actual signature delivered by the server):
```json
{"schemaVersion":1,"requestId":"syntheticReference0001","tenantId":"demo-shop","customer":{"name":"مشتری آزمایشی","contact":"test@example.invalid"},"requestType":"راهنمایی","details":"درخواست راهنمایی برای تنظیمات آزمایشی","chatSummary":"درخواست راهنمایی؛ فوریت عادی؛ رضایت ثبت شد","createdAt":"2026-10-27T10:00:00Z","signature":"0000000000000000000000000000000000000000000000000000000000000000"}
```

Pull body: {"tenantId":"demo-shop","limit":5}. Response: {"items":[{"payload":<signed object>,"receipt":<opaque lease>,"leaseUntil":<UTC>}]}.
First ack body: {"tenantId":"demo-shop","receipt":<lease>,"status":"executing","resultNote":""}. After durable execution, ack again with status "done" or "failed" and a nonsecret resultNote (max 300 chars), e.g. "ثبت آزمایشی تکمیل شد". Repeating executing renews the 120-second lease. Direct delivered → done/failed is rejected with 409. Nack body: {"tenantId":"demo-shop","receipt":<lease>}; no reason/free-text field is accepted. Duplicate same terminal ack returns success; stale receipt or invalid transition returns 409. Errors: 400 invalid fields, 401 missing/bad auth, 404 unknown/foreign request, 409 conflict/stale lease, 413 size cap, 429 quota, 503 config/storage unavailable.

Soroush must poll, verify signatures, durably deduplicate requestId before SmartX effects, mark executing, execute without owner approval, then ack done/failed. Recover ambiguous SmartX outcomes by checking its own durable operation record before retrying. Renew executing leases through authenticated heartbeat ack before expiry. Never include credentials or unnecessary customer PII in result notes. A push adapter may be added later behind the same lease interface; no webhook receiver or outbound URL is enabled in this iteration.

## Implementation plan (approval received via parent agent on 2026-10-27)
- [x] Write failing domain tests in deployment/tests/test_support.py: tenant isolation, capability rotation/revocation, idempotent submit, lease expiry/stale ack, signatures, body caps, consent, queue full, transaction rollback, PII-minimized audit.
- [x] Implement deployment/aromin_support.py and existing-table storage; verify focused unittest fails first then passes.
- [x] Wire FastAPI routes and add endpoint tests with synthetic storage/auth; test foreign tenant reads/acks and forged tenant input.
- [x] Add frontend/src/components/agent/SupportLinkCard.tsx to AgentsCard; add a lightweight standalone customer page served before the existing static mount. Write failing card UI tests for safe rendering, link controls and configuration errors first; verify conversation/queued confirmation in Chromium.
- [x] Self-review every diff, including storage callers and route ordering; fix failures using reproduction → cause → minimal fix → rerun.
- [x] Bump both deployment/legacy.html version markers to 3.9.97 and prepend one short HANDOFF paragraph.
- [x] Run cd frontend && npx vitest run && npx tsc -b && npm run build.
- [x] Run cd deployment && python3 -m unittest discover -s tests -v.
- [x] Capture synthetic conversation/confirmation at 390px/1440px and settings queue card in /workspace/aromin-support-link-shots/, with capability/credential values hidden.
- [x] Record actual results here; no commit/push/deploy or workspace deletion.

## NEEDS APPROVAL
Design approval was received and the brainstorming gate is satisfied. No schema change is required or proposed. Before deployment the user must approve/configure service credentials and signing key, public URL/proxy exposure and header/access-log redaction, rate-limit/proxy settings, customer privacy/retention wording, and external Soroush's unattended SmartX execution and durable deduplication. Push webhooks are deferred; adding them requires URL/egress configuration and retry verification.

## Code review and systematic debugging
Self-reviewed runtime, SQL, UI, packaging, tests and version diffs; independent requesting-code-review skill reviewer also reviewed read-only. Fixed findings with regression coverage: global Aromin identity/dashboard persona leaked unrelated facts into business answers; double-counted shared IP quotas interfered with service heartbeats; repeated audit growth could block accepted work. Added a binary-tenant regression using a NOCASE primary key to reject case/collation aliases. Existing metadata and round-robin sa_state keys are untouched.

TDD evidence: domain import failed before module existed; API tests failed before routes existed; UI tests failed before card existed. Additional red → green cycles covered repeated ack audit, strict executing transition, message retry step guard, missing-KB model suppression, tenant-neutral context, collation aliases, audit saturation and storage headroom. A body-limit test initially returned 400 before 413: size validation now precedes content-type validation. Screenshot harness failures came from Playwright API syntax, CSP-blocked polling eval and Vite's cross-origin proxy; the harness uses locator assertions and a synthetic same-origin API adapter for the card, without relaxing application CSP/origin policy.

## Runtime files changed
- deployment/aromin_support.py: deterministic interview, HMAC/capabilities, bounded JSON chunk codec, leases/idempotency/state/audit.
- deployment/server.py: existing-table transactional storage and dashboard/public/service routes before static mount.
- deployment/support.html, support.js, support.css: standalone mobile-first RTL customer chat, safe text rendering, queued confirmation.
- frontend/src/components/agent/SupportLinkCard.tsx and AgentsCard.tsx: authenticated link controls and recent read-only queue.
- deployment/install.sh, rollback.sh, tools/package_release.py: copy/backup/restore/require the new runtime module and page assets; no installation executed.
- deployment/legacy.html: both APP_VERSION markers 3.9.97, same pattern as 3.9.96.
- deployment/tests/test_support.py and frontend/src/components/agent/SupportLinkCard.dom.test.tsx: synthetic contracts/regressions.
- HANDOFF.md and this requested plan: short handoff plus integration/evidence.

## Verification evidence
Final verification commands and observed results:
- `cd frontend && npx vitest run && npx tsc -b && npm run build`: exit 0; 44 Vitest files, 274 passed / 1 skipped; TypeScript passed; SPA, widget-bot and widget-agent builds passed. Existing jsdom canvas warnings from VioletSwirl and Vite chunk-size warnings are nonfatal; no dependencies were installed.
- `cd deployment && python3 -m unittest discover -s tests -v`: exit 0; 386 tests, 6 skipped (380 passed). Includes 23 dedicated support tests. Existing unavailable-database/optional integration diagnostics remain; no real database or service was contacted by the support fixtures.
- `bash -n deployment/install.sh deployment/rollback.sh`, `node --check deployment/support.js`, and `git diff --check`: exit 0.
- Python Playwright/Chromium: both customer flows completed against actual FastAPI routes + domain service with isolated in-memory transactional fake storage; screenshots captured at widths 390 and 1440, no horizontal overflow, no page errors. Fragment removal and textContent rendering of malicious markup were asserted. Dashboard screenshot mounts the actual React card through Vite with a synthetic API adapter (to preserve production same-origin enforcement); customer link value is masked.
- Storage verification uses production SQL via a transactional SQLite compatibility adapter with column length checks, rollback and NOCASE-alias regression. It does **not** establish MariaDB/InnoDB concurrency behavior; no MariaDB executable is installed here. Run the existing synthetic integration environment before deployment.

An additional red → green regression prevents an integration from echoing configured service/signing credentials or Authorization bearer text in result notes; these values are redacted before storage/display. Result notes still must contain no other secrets or unnecessary PII.

Screenshots (synthetic only):
- `/workspace/aromin-support-link-shots/customer-390-conversation.png`
- `/workspace/aromin-support-link-shots/customer-390-confirmation.png`
- `/workspace/aromin-support-link-shots/customer-1440-conversation.png`
- `/workspace/aromin-support-link-shots/customer-1440-confirmation.png`
- `/workspace/aromin-support-link-shots/dashboard-support-card.png`

Temporary browser fixture HTML/server/scripts were removed and both local preview processes stopped. Generated frontend/dist is ignored; the pre-existing node_modules symlink is preserved for the parent. Worktree and all source changes remain available for parent review. No commit, push, deployment, schema migration, dependency installation, real tenant data, or external SmartX action is part of this work. Branch remains codex/support-agent-soroush-link based on 2039301. Initial frontend/node_modules symlink is preserved.

## Update A–E: SmartX master prompt, campaigns and Goftino (2026-10-27)
Goal: ship the exact supplied master prompt as an editable tenant template, deterministic validated campaign interview and signed stage-5 handoff; share the engine between dedicated link and Goftino. Constraints remain no commit/push/deploy, schema/dependency changes or secrets. Success requires prompt substitution tests, campaign/date/enum/consent validation, cross-channel isolation/replay tests, updated UI/screenshots and full verification.

Brainstorming decision: keep server-owned typed slots as the authority; the editable master template governs knowledge answers and deployed identity, never trusts model JSON as executable input. Prefer the existing public KB collections over duplicating SmartX content; prefer an authenticated fail-closed adapter over guessing provider signatures. The updated user specification authorizes these refinements to the approved design.

Discovery: no tenant SmartX brand directory exists in the inspected dashboard sources (product brand metadata is unrelated; tenant_state identifies businesses, not SmartX account brands). Provide an editable per-tenant list of {name,active} with no invented entries. PR #30's tools/kb_docs/smartx-kb.md is absent at this worktree's base 2039301; do not copy SMARTX_KB.md again or merge branches. Add `smartx` to existing KB collections and support registry scope; owner/parent must integrate PR #30 and upload that document as public knowledge for each relevant tenant using existing uploader/knowledge UI.

Implementation tasks (TDD, then self-review and verification):
- [x] Copy the full master prompt to deployment/support_prompts/aromin-support-agent.fa.md; package/copy/rollback that directory. Store template/config/brands/priority definitions in existing chunked sa_state; variables are server-derived or editable safe defaults. Strip unresolved placeholders from all customer-visible model output; never expose internal JSON/prices.
- [x] Add typed campaign branch: brand/branch/contact/role/mobile, need, event, exclusive benefit and conditional amounts/duration/reminders, audience/RFM, future valid Jalali date, quarter-hour time, service/club message, holdout, notes, optional expert answers, summary and exact explicit confirmation. Unknown fields/enums/invalid values are rejected on server before advancing; changes reset confirmation. Noncampaign requests collect technical ticket details/priority or sales/complaint needs. Do not promise activation.
- [x] Keep schemaVersion/requestId/tenantId/createdAt/signature/customer/chatSummary envelope; add `campaign` holding the complete stage-5 object (contact, campaign fields, expert_answers, confirmation, flags/open_questions/next_steps). Revalidate at enqueue; cap payload at 16KiB for the richer shape, with existing 2MB chunk storage/headroom and stricter admission/request count if needed.
- [x] Add manager GET/PUT /api/agent/support/settings, and UI for template, brands, proposed P1–P4 definitions, AGENT_NAME/MEHR_CONTACT/SALES_CONTACT/SOROUSH_HANDOFF_CHANNEL/TICKET_TOOL. TODAY_JALALI is computed in Tehran; LINK is the current capability supplied by caller at runtime, not a persisted raw secret.
- [x] Add Goftino channel adapter interface and fake transport tests; webhook verifies an env-held shared secret or HMAC before parsing account-mapped events, ignores operator echoes and deduplicates message IDs durably. Never trusts an event's tenant. Outbound uses verified API contract only; no live credentials or registration calls.
- [x] Update synthetic screenshots, short HANDOFF paragraph, review each diff, run all Python/Vitest/tsc/build commands again.

### Goftino verified vs assumed / NEEDS APPROVAL
Official documentation: https://api.goftino.com/ (checked 2026-10-27), including send_message and Webhook sections. Verified: outbound POST /v1/send_message requires goftino-key header and chat_id/operator_id/message JSON; success status is `success` with data.message_id. Webhook signature/authentication and exact event fields are recorded below after examining its section. No real registration, key use or API message occurs in development. Provider credentials, account/widget-to-tenant mapping, dedicated bot operator ID, webhook authentication capability and a sanitized real event fixture must be provided and confirmed before enabling production. Any receiver contract not documented by provider will be explicitly identified as an AROMIN gateway contract and remain disabled by default. Customer conversation remains agent-only; Soroush, not a SmartX expert or owner, fills the form and coordinates technical activation with Tehran. No owner approval step is added to campaign execution.

### Updated Soroush-side integration needed (A–E authoritative contract)
The existing pull/ack/nack endpoints and HMAC canonicalization remain unchanged. Envelope schemaVersion stays 1; new requests have required `campaign` (the complete master stage-5 object, or null for noncampaign) and `ticket` (null for campaign, otherwise the validated noncampaign handoff). Legacy already-enqueued envelopes remain readable. The signed payload cap is now 16384 UTF-8 bytes; request total cap150 (nonterminal cap100), admission1250000 bytes, chunk200 characters/column255, storage2MB unchanged. Dynamic interview replaces expectedStep0–6 with nonnegative current step; each response supplies totalSteps/maxLength. Customer message cap4096 bytes stays unchanged; settings PUT cap160000 bytes.

`campaign` stage-5 requires exactly handoff_type=campaign_request, schema_version=1.0, created_at_jalali, contact, campaign, expert_answers, customer_confirmation, flags, open_questions and next_steps_for_soroush. Contact requires brand<=120, brand_matched boolean computed from active tenant brands, nullable branch<=120, name<=120, role<=80, mobile09+9 digits and preferred_contact=chat. Nested campaign requires event_name<=120; benefit_type inform_only|gift_credit|percent_discount; inactive benefit objects null; active gift {amount_toman1..10^12,validity_days1..3650,wallet_mode merge_with_wallet|separate,expiry_reminder}; active discount {percent1..100,cap_toman positive<=10^12 or null with no_cap=true,no_cap boolean,usage_count1..10000,validity_days1..3650,expiry_reminder}. Reminder requires enabled boolean; when enabled days_before integer1..min(3,validity_days), text nullable<=500; when disabled days/text null. Audience type all|rfm, rfm_groups0..10 nonempty strings<=80 (required if rfm; empty if all), rfm_may_be_unavailable boolean (true if RFM has not been established). send_date_jalali is calendar-valid and >= server Tehran today; send_time HH:mm with minutes00/15/30/45 and hours00..23 (09..21 recommended, otherwise warning). message_text<=1000 must mention club membership/customers; advertising phrases are rejected; final service appropriateness still needs Tehran technical review. holdout boolean; notes nullable<=500. Optional expert strings<=200, average ticket positive<=10^12 or null, goal winback|new_customers|basket_size|null. Explicit customer confirmation and Jalali timestamp are server-derived; no model JSON can enqueue. Unknown fields and wrong types are rejected.

Soroush must verify signature over the **whole envelope including campaign/ticket**, durably deduplicate requestId, ack executing, fill SmartX exclusively from validated campaign fields, and coordinate text approval/activation with Tehran technical team. No SmartX expert joins the customer chat; no owner approval exists. Do not treat enqueue or form submission as activation, promise prices, or activate before technical approval. Unknown/inactive brand (brand_matched=false) and RFM availability require checking, never guessing. Pricing is routed to configured sales, complaint to configured Mehr, technical support uses configurable priority definitions (explicit proposed/confirmed status) and ticket destination. These settings label routing; they do not add a new integration or silently contact a person.

Changed text is a new consented request: Soroush must stop the old execution, ack failed with a safe note explaining the new text and ask the customer to start/reconfirm from the same chat. It must never mutate or execute a modified version of an already-signed payload. The link now supports POST /api/support/status with sessionId and capability (only its own request status/resultNote during its24h session lifetime); the page polls every10s while queued/executing, displays notes as text and offers a fresh interview on terminal status. Goftino terminal result notes are relayed through the mapped account's bot operator; successful notification is recorded, retries may duplicate a message on ambiguous network outcomes. A Goftino customer writes «شروع» after a submitted request to create a fresh draft. Soroush ack retries are idempotent and retry failed result delivery; it must report only nonsecret, minimal notes.

Synthetic complete payload (test key used only to produce an example signature; no deployment credential):
```json
{
  "schemaVersion": 1,
  "requestId": "ReikS5--fnFzh6zRTVbliA",
  "tenantId": "synthetic-tenant",
  "createdAt": "2026-10-27T11:01:16.443790Z",
  "customer": {
    "name": "مشتری آزمایشی",
    "contact": "09120000000"
  },
  "chatSummary": "درخواست campaign_request؛ تأیید صریح ثبت شد",
  "requestType": "campaign_request",
  "details": "رویداد آزمایشی",
  "campaign": {
    "handoff_type": "campaign_request",
    "schema_version": "1.0",
    "created_at_jalali": "1405/08/05 14:31",
    "contact": {
      "brand": "برند آزمایشی",
      "brand_matched": false,
      "branch": null,
      "name": "مشتری آزمایشی",
      "role": "مدیر",
      "phone": "09120000000",
      "preferred_contact": "chat"
    },
    "campaign": {
      "event_name": "رویداد آزمایشی",
      "benefit_type": "inform_only",
      "gift_credit": null,
      "percent_discount": null,
      "audience": {
        "type": "all",
        "rfm_groups": [],
        "rfm_may_be_unavailable": false
      },
      "send_date_jalali": "1405/08/05",
      "send_time": "10:30",
      "time_note": "ارسال تا حدود ۲ ساعت ممکن است تأخیر داشته باشد",
      "message_text": "عضو گرامی باشگاه مشتریان؛ از عضویت شما در باشگاه سپاسگزاریم.",
      "message_mentions_club": true,
      "measure_effectiveness_holdout": true,
      "notes": null
    },
    "expert_answers": {
      "top_margin_item": null,
      "busy_slow_times": null,
      "avg_ticket_toman": null,
      "goal": null
    },
    "customer_confirmation": {
      "confirmed": true,
      "confirmed_at_jalali": "1405/08/05 14:31",
      "confirmation_quote": "تأیید می‌کنم"
    },
    "flags": {
      "sales_followup": false,
      "price_asked": false,
      "complaint_escalated_to_mehr": false
    },
    "open_questions": [
      "برند با فهرست فعال تطبیق نشد؛ بررسی شود."
    ],
    "next_steps_for_soroush": [
      "فرم کمپین اسمارت‌ایکس را پر کن",
      "تأیید متن و فعال‌سازی را با تیم فنی تهران هماهنگ کن",
      "هر اصلاح متن را از همین چت به ایجنت برگردان و تأیید دوباره بگیر",
      "تا تأیید فنی فعال‌سازی نکن؛ تأیید مالک لازم نیست"
    ]
  },
  "ticket": null,
  "signature": "f3a155a45c3b78b4af0fc74898e26c77c2ac8c42d0b53fe393e457e741b6a737"
}
```

### Goftino contract verified vs AROMIN gateway contract
Source: [official Goftino API](https://api.goftino.com/) checked2026-10-27. Verified outbound: POST https://api.goftino.com/v1/send_message, headers Content-Type application/json and goftino-key, body {chat_id,operator_id,message}, success {status:success,data:{message_id}}. Verified webhook: POST JSON {event:new_message,data:{chat_id,user_id,sender:{from:user|operator,...},date,content,type:text,message_id,current_owner}}; operator echoes are ignored. Documentation warns repeated endpoint failures may temporarily disable webhook delivery. It does **not** specify a signing header/shared-secret mechanism, account/widget field, retry timing, message ordering or outbound idempotency guarantee.

Implemented receiver POST /api/support/goftino/{account}: account alias is a nonsecret route key mapped by GOFTINO_SUPPORT_ACCOUNTS_JSON in env/arvan.env. Mapping config per alias: tenant, apiKey, operatorId, webhookSecret (>=32 chars), enabled (must be explicitly true); optional widgetId is administrative metadata. No body tenant is trusted. API key and shared secret never enter UI, persisted state, logs or customer links. Unknown/disabled accounts fail503; wrong auth401; foreign tenant403; malformed event400; oversize413; rate429; provider/unavailable503.

**AROMIN gateway auth, not claimed to be native Goftino:** supply X-Aromin-Goftino-Secret, OR X-Aromin-Goftino-Timestamp (Unix seconds within300s) plus X-Aromin-Goftino-Signature=sha256=<hex> using HMAC-SHA256(secret, ASCII(timestamp)+b'.'+raw_body). No URL secrets. The gateway must authenticate original Goftino deliveries before attaching this proof; if direct Goftino cannot supply a protected header, production requires a reviewed authenticated relay/provider-supported alternative. Do not expose an unauthenticated relay that merely signs arbitrary inbound bodies.

The adapter interface is ReplyAdapter.send(config,chat,text); fake implementations inject transport failures/success without live credentials. Same SmartxSupport slots/validation/outbox serve both channels; a private channel facade is constructed only after verified route auth/tenant mapping. Goftino supports «سؤال: ...» for scoped KB queries without advancing slots. Incoming IDs are durably deduplicated (100 messages/chat/24h cap, fail closed rather than forgetting IDs); pending replies retained per ID up to10/chat, delivered after transaction commit and removed only after API success. Gateway must durably retry failed webhooks until success; no worker or provider retry guarantee is invented. Drafts expire24h; orphan mappings explicitly restart from identification. Link rotation preserves independently authenticated Goftino sessions.

### Settings and remaining inputs / NEEDS APPROVAL
GET/PUT /api/agent/support/settings?tenant=… are manager-only, same-origin, existing chunked sa_state. Full exact template is shipped at deployment/support_prompts/aromin-support-agent.fa.md (SHA256d5a0b2e37ae3f80cac34d987695109b15a57169df3512ec740d79ba1a33b0f15 matches supplied source). Runtime uses role through section12, removes internal-only note lines and appends live configured priority definitions. Every variable is substituted; unknown placeholders are replaced with an explicit not-configured message in customer output. LINK derives from the current business capability in memory; TODAY_JALALI derives from server Tehran date. Agent name defaults to the master template's proposed name; contact/destination defaults explicitly say not configured and do not invent phone numbers. Master template is a default, editable per tenant; deterministic constraints remain authoritative even if edited.

Before production: provide confirmed real brand export/statuses, operational P1–P4 definitions, Mehr/sales/destination settings, Soroush credentials/signing key, Goftino API key/account-widget mapping/bot operator, verified webhook auth/relay and retry policy, and a sanitized event fixture. Integrate PR#30's missing local file into this branch via parent workflow, then upload tools/kb_docs/smartx-kb.md to each intended tenant as public `smartx` collection using existing knowledge UI/uploader (--collection smartx). No duplicate KB copy, upload or live webhook registration was performed. Existing SmartX KB is never global tenant customer data. Public URL/proxy/log redaction/privacy/retention and real MariaDB concurrency checks remain pre-deploy items. No schema change is needed. No SmartX expert/customer handoff or owner approval workflow is added.

### A–E final review, verification and cleanup
Read-only independent review plus self-review covered all diffs. Red→green regressions fixed link rotation invalidating Goftino sessions, older failed replies being lost after newer events, expired session mappings not restarting, and sensitive first messages receiving no correction prompt. Operational errors propagate for rollback rather than being treated as user validation. Terminal Goftino notes are relayed idempotently (at-least-once on ambiguous network failures); private channel/session references never enter the signed campaign or public queue projection. Added campaign/ticket API tests use actual SmartxSupport with transactional fake storage and fake network adapters. A full-suite failure in an older orchestrator test expected the pre-smartx KB list; updated that explicit expected scope without weakening tool permissions.

Fresh verification evidence:
- `cd frontend && npx vitest run && npx tsc -b && npm run build`: exit0;45 files,275 tests passed /1 skipped; TypeScript and SPA/widget-bot/widget-agent builds passed. Existing jsdom canvas and Vite chunk warnings remain nonfatal.
- `cd deployment && python3 -m unittest discover -s tests -v`: exit0;407 tests /6 skipped (401 passed), including44 support/domain/API/channel tests. Real MariaDB concurrency remains unverified (no executable); no live Goftino/SmartX/model call was made by these tests.
- `git diff --check`, `bash -n deployment/install.sh deployment/rollback.sh`, `node --check deployment/support.js`: exit0. Exact master-template source hash matches the packaged copy.
- Python Playwright/Chromium: actual page/JS/React card and FastAPI+SmartxSupport with synthetic in-memory storage; campaign steps, review summary, exact explicit confirmation, queued reference at390px/1440px, no horizontal overflow or page errors. No capability/service token visible. The card uses a same-origin synthetic API fixture for Vite; no production origin policy relaxed.
- Updated screenshots: /workspace/aromin-support-link-shots/customer-390-conversation.png, customer-390-confirmation.png, customer-1440-conversation.png, customer-1440-confirmation.png, dashboard-support-card.png, dashboard-support-settings.png (all within that directory). Images were visually inspected.
- Temporary preview HTML/scripts removed and local fixture/Vite processes stopped. Worktree and pre-existing frontend/node_modules symlink preserved; frontend/dist remains ignored. No dependency install, schema change/migration, KB upload, commit, push, deploy, webhook registration or external notification to a real account.

Full source paths changed (including earlier support implementation):
- `/workspace/aromin-support-link/HANDOFF.md`
- `/workspace/aromin-support-link/deployment/aromin_support.py`
- `/workspace/aromin-support-link/deployment/aromin_support_campaign.py`
- `/workspace/aromin-support-link/deployment/aromin_support_goftino.py`
- `/workspace/aromin-support-link/deployment/install.sh`
- `/workspace/aromin-support-link/deployment/legacy.html`
- `/workspace/aromin-support-link/deployment/rollback.sh`
- `/workspace/aromin-support-link/deployment/server.py`
- `/workspace/aromin-support-link/deployment/support.css`
- `/workspace/aromin-support-link/deployment/support.html`
- `/workspace/aromin-support-link/deployment/support.js`
- `/workspace/aromin-support-link/deployment/support_prompts/aromin-support-agent.fa.md`
- `/workspace/aromin-support-link/deployment/tests/test_agents_orchestrator.py`
- `/workspace/aromin-support-link/deployment/tests/test_support.py`
- `/workspace/aromin-support-link/deployment/tests/test_support_campaign.py`
- `/workspace/aromin-support-link/deployment/tests/test_support_goftino.py`
- `/workspace/aromin-support-link/docs/plans/2026-10-27-support-agent-soroush-link.md`
- `/workspace/aromin-support-link/frontend/src/components/agent/AgentsCard.tsx`
- `/workspace/aromin-support-link/frontend/src/components/agent/SupportLinkCard.dom.test.tsx`
- `/workspace/aromin-support-link/frontend/src/components/agent/SupportLinkCard.tsx`
- `/workspace/aromin-support-link/frontend/src/components/agent/SupportSettings.dom.test.tsx`
- `/workspace/aromin-support-link/frontend/src/components/agent/SupportSettings.tsx`
- `/workspace/aromin-support-link/frontend/src/lib/agents.ts`
- `/workspace/aromin-support-link/tools/package_release.py`
