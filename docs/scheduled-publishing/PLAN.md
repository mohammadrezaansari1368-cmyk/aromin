# AROMIN scheduled product publishing — implementation plan

Branch `feature/scheduled-publishing` from `baseline/application-3.9.41` (commit `16536b6`). Live server reports
`APP_VERSION = "3.9.41"`; this branch's `deployment/server.py` contains the live Telegram/Composio publishing
code (identical tg_*/COMPOSIO/_s3/worker code to the last verified 3.9.38 build). `main` is an initial commit only.

## Goal
A daily, server-side pipeline: verified product → one structured Persian copy request → deterministic channel
visual + 1080×1920 Instagram Story → (manual approval by default) → scheduled per-destination delivery →
per-destination report. Disabled until an exact publishing time and destination configuration exist.

## Hard constraints
- Keep FastAPI + MariaDB + the in-process worker (`sa_start_worker` loop). No PostgreSQL/Redis/Docker/runtime Graphify.
- Preserve `/post`, the existing webhook, `approve_post:`/`reject_post:` callbacks, `tg_*` tables and behaviour.
- Never call TELEGRAM_GET_ME / getUpdates / setWebhook from code or tests; never replay `tg_posts` id 3.
- No LLM for scheduling, formatting, validation, rendering or delivery. One AI call per product draft
  (plus at most one validation retry, counted against the per-run limit). Copy output is reused for every destination.
- Never fabricate price/specification. Persian text, digits and prices are drawn by code, never by image AI.
- Secrets only from env; redact in errors/logs/audit/API responses.

## Fixed configuration (env, with these defaults documented in `.env.example`)
- `TELEGRAM_ADMIN_ID=71157396`, `TELEGRAM_CHANNEL=-1001005246727`, new `TELEGRAM_CHANNEL_USERNAME=aromin_online`
  (used only to build public links `https://t.me/aromin_online/<message_id>`; also fixes the existing `tg_publish`
  link which is empty when the channel is numeric).
- Telegram transport stays the existing Composio adapter (`_tg_composio`, `COMPOSIO_*`); server cannot reach api.telegram.org.
- Bale: `BALE_BOT_TOKEN`, `BALE_CHANNEL_ID`, `BALE_API_BASE=https://tapi.bale.ai` (official Bot API, Telegram-compatible
  `sendPhoto`; reachable from Iran). Verify method/field names against https://docs.bale.ai during build; if a field
  cannot be verified, use only `chat_id`, `photo`, `caption` (plain text, no parse_mode).
- Instagram Story via Composio Platform: `COMPOSIO_IG_ACCOUNT` (connected account id), `COMPOSIO_IG_USER_ID`
  (Composio user id; default `COMPOSIO_USER_ID`), `INSTAGRAM_IG_USER_ID` (publishing IG user id). Tool schemas
  discovered 2026-10-07 (cache in code as constants, no runtime discovery):
  `INSTAGRAM_POST_IG_USER_MEDIA {ig_user_id, image_url, media_type:"STORIES"}` → `id` (creation_id);
  `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH {ig_user_id, creation_id, max_wait_seconds:60}` → published media `id`.
  The verified `aromin.online` BUSINESS connection exists only under Composio "For You"; a Platform connection is a
  deployment prerequisite (blocker until provided).
- WhatsApp Channels: no verified channel-capable API/connector → destination is always `BLOCKED` with reason
  `no verified WhatsApp Channels API`; job report includes manual-ready assets (caption text + both image URLs).
  Do not implement contact/number messaging as a substitute.
- `PUBLIC_BASE_URL=https://dashboard.arominco.com`, `PUB_MEDIA_DIR` (default `<server dir>/media/pub`),
  optional `PUB_FONT_DIR` (licensed Peyda TTFs if supplied; otherwise vendored Vazirmatn OFL TTFs in
  `deployment/assets/fonts/`). Peyda files are not present in the repository.

## Code layout
- `deployment/aromin_publish.py` (new, pure, no server import): schedule math (zoneinfo `Asia/Tehran`, fallback
  fixed +03:30), settings validation, rotation selection, copy validation (reuse rules of `tg_compose`: no price,
  hashtag, link, phone, numbers absent from source; features ≤3, each ≤45 chars), snapshot hashing (sha256 of
  canonical JSON), Persian text shaping (`arabic_reshaper` + `python-bidi`, Persian digits), Pillow rendering of the
  channel visual (1080×1080 JPEG) and Story (1080×1920 JPEG), delivery-error classification helpers.
- `deployment/server.py`: thin integration — tables via migration, worker tick, adapters reusing `tg_api`/`_tg_composio`,
  `product_detail`, `ai_chat` + `assistant_system(scope="telegram")`, `_w_guard` auth, routes (defined before the static
  mount). Image deps are imported lazily; if missing, preparation records `BLOCKED: image dependencies missing` and the
  server still starts and `/post` keeps working.
- `deployment/migrations/005_publishing.sql` (idempotent `CREATE TABLE IF NOT EXISTS`) + `deployment/migrations/005_publishing.down.sql.txt`.
- `deployment/install.sh` / `rollback.sh` / packaging: also back up and copy `aromin_publish.py`, `assets/`, migration 005;
  best-effort `"$SRV_DIR/.venv/bin/pip" install Pillow==11.3.0 arabic-reshaper==3.0.0 python-bidi==0.6.6` (failure is
  reported, not fatal). Same `004` conflict guard style for `005`.
- `deployment/tests/test_publishing.py` (offline unittest, mocks/fakes, no network).

## Data model (migration 005)
- `pub_settings(tenant PK, settings JSON TEXT, updated_by, updated_at)`.
- `pub_jobs(id, tenant, schedule_key, local_date, status, product_url, product_json, copy_json, ai_calls, snapshot_sha256,
  channel_asset, story_asset, visual_mode, approval_mode, approved_by, approved_at, approved_snapshot, publish_at_utc,
  lease_until, last_error, created_at, updated_at, UNIQUE(tenant, schedule_key, local_date))`.
  Status: `PREPARING → AWAITING_APPROVAL|READY → APPROVED → DELIVERING → DONE|PARTIAL`, side states `BLOCKED`, `REJECTED`,
  `STALE`, `DEFERRED`, `MISSED`.
- `pub_deliveries(id, job_id, destination, status, attempts, next_at, inflight, lease_until, remote_id, remote_state JSON
  (e.g. Instagram creation_id), remote_url, last_error, sent_at, UNIQUE(job_id, destination))`.
  Status: `PENDING, SENDING, SENT, FAILED(retryable), UNCERTAIN, BLOCKED, SKIPPED`.
- `pub_assets(sha256 PK, kind, mime, width, height, path, created_at)`; files are content-addressed `<sha>.jpg`.
- `pub_audit(id, job_id, delivery_id, actor, action, detail, at)`.

## Settings (per tenant; authenticated managers only; defaults safe)
`enabled=false`, `preparation_time`, `publishing_time` (HH:MM, Asia/Tehran; prep strictly before publish),
`destinations` subset of `telegram,bale,instagram_story,whatsapp_channel`, `approval_mode=manual|automatic`
(default `manual`; automatic only if explicitly set), `late_approval_policy=defer|immediate` (default `defer`),
`rotation={cooldown_days:30, exclude_urls:[], exclude_keywords:[], priority_urls:[], require_in_stock:true}`,
`story_show_price=false`, `price_max_age_minutes=60`, `cost_limits={max_ai_calls_per_run:2, max_product_fetches_per_run:15,
max_image_api_calls_per_run:0}`. Enabling is rejected unless `publishing_time` is set and every selected destination
except `whatsapp_channel` has its env configuration. API: `GET/PUT /api/publishing/settings?tenant=`.

## Daily flow (worker tick, every ≤20 s, deterministic)
1. Local Tehran date D. If enabled and now ≥ D+prep and now < D+publish and no job for (tenant,"daily",D): INSERT
   (unique key makes duplicate ticks/restarts no-ops) and prepare. If now ≥ D+publish with no job: record nothing for D
   (no catch-up burst, no backfill of earlier dates); next run is D+1.
2. Prepare (resumable under a lease): pick product (priority list first, then not-excluded, not posted in cooldown across
   `pub_jobs` and `tg_posts`, complete data name/image/description, availability `InStock` when exposed; bounded by
   `max_product_fetches_per_run`) → persist product snapshot → if `copy_json` empty: one structured AI request
   `{problem, product, value, cta, features[≤3]}` validated deterministically (one retry max) → persist → fetch the
   official product photo (existing SSRF-safe fetch) → render channel visual + Story → store assets → snapshot hash.
   A resumed preparation never repeats a successful AI call or re-renders an existing asset.
3. Manual mode: private Telegram preview to admin (channel visual with exact caption, Story image, report of
   destinations/blocked ones) with buttons `approve_pub:<job_id>:<snapshot[:12]>` / `reject_pub:<job_id>`; also
   dashboard `POST /api/publishing/jobs/{id}/approve {snapshot}`. Approval is accepted only for the current snapshot,
   records `approved_snapshot`, and is routed in `tg_handle_callback` by a new regex branch that leaves `approve_post`
   handling unchanged. Automatic mode: READY counts as approved.
4. At D+publish: if approved → revalidate (fresh `product_detail`, cache bypassed): unavailable, name/image change, or
   (when a price is displayed) price change or price older than `price_max_age_minutes` without successful revalidation →
   job `STALE`, admin notified, draft regenerated (new snapshot; manual mode needs new approval; publish follows
   late policy). If valid → create one `pub_deliveries` row per destination and deliver independently.
   If still awaiting approval at D+publish: `defer` → when approved, publish at the next slot (that slot creates no new job
   while a deferred job holds it); `immediate` → publish right after approval (after revalidation).
5. Report to admin (Telegram) after the delivery round settles: per destination ✅ link / ⚠️ uncertain / ⛔ blocked/failed;
   `GET /api/publishing/jobs` returns the same.

## Delivery rules
- Claim with `inflight+lease`; success → `SENT` (never resent); definite not-sent (connect failure, 429, Bale/Composio
  explicit rejection classified retryable) → `FAILED` with bounded backoff 1m, 5m, 15m, 4 attempts; permanent rejection →
  `FAILED` terminal; timeout after send / 5xx / unclear → `UNCERTAIN` (no automatic retry; admin resolves via
  `POST /api/publishing/deliveries/{id}/resolve {outcome: sent|not_sent}`; `not_sent` → retry). Lease expiry with inflight → `UNCERTAIN`.
- Instagram: persist `creation_id` after container creation; retries reuse it; publish call uncertainty → `UNCERTAIN`.
- Cross-destination delivery is independent and not atomic or simultaneous; reports say so.
- Assets are served publicly at `GET /api/pub-media/{sha256}.jpg` (64-hex only, immutable cache headers) from `PUB_MEDIA_DIR`.

## Visual template (deterministic, Pillow)
Brand: primary `#8A0C72` (sampled from `aromin-logo.webp`; matches app `--primary`), white background, logo
`deployment/assets/aromin-logo.webp`. Product photo is scaled to fit (no crop, no distortion, no recolor) inside a
reserved area. Story: 1080×1920 JPEG, safe margins 120 px sides / 250 px top+bottom, right-aligned RTL text, product name
(bold, wrapped ≤2 lines, shrink-to-fit), ≤3 feature bullets, optional verified price (Persian digits, `٬` separators,
range when min≠max), CTA `۰۱۳۹۱۰۰۲۰۳۰ · arominco.com`, logo. Channel visual: 1080×1080 JPEG, photo + brand bar with
product name. No image API is used (`visual_mode="deterministic_composition"`); `max_image_api_calls_per_run=0`.

## Acceptance criteria
1. Settings default disabled; enabling without publishing_time/configured destinations fails; non-managers get 401/403.
2. Scheduler: Tehran-time slot math correct; two ticks / restart produce one job; start after publish time creates no job
   for that date; downtime spanning days creates no backfill.
3. One AI call per draft (≤2 with validation retry); resumed preparation makes none; delivery retries never re-render.
4. Story is 1080×1920 JPEG; all text inside safe margins; Persian shaped/RTL; prices only from verified data; photo
   aspect ratio preserved.
5. Approval bound to snapshot; stale snapshot approval rejected; late policy defer/immediate both work.
6. Partial failure: only failed destinations retried; SENT never resent; UNCERTAIN never auto-retried; Instagram reuses
   creation_id; WhatsApp is BLOCKED with manual-ready assets.
7. Stale price/availability blocks delivery and regenerates the draft.
8. Telegram regression: `/post`, `approve_post`/`reject_post`, existing tests unchanged and passing; channel link uses
   `TELEGRAM_CHANNEL_USERNAME` when channel is numeric.
9. Secrets never appear in errors, audit, API responses.

## Verification
- Proof: `cd deployment && "C:/Users/Administrator/AppData/Local/Temp/claude/C--Users-Administrator/fa16e50c-a95a-4907-a9dc-1ec1bd39c6da/scratchpad/venv/Scripts/python.exe" -m unittest discover -s tests -v`
  (venv has fastapi, pymysql, bcrypt, httpx, Pillow 11.3.0, arabic-reshaper 3.0.0, python-bidi 0.6.6; no network needed).
- `python -m pyflakes deployment/server.py deployment/aromin_publish.py` clean.
- Host (not builder): render one real product preview (live arominco.com data) to local JPEGs for visual inspection;
  no publishing. Live private preview to admin only after deployment.

## Non-goals
Dashboard UI for settings (API only), video/Reels, carousels, WhatsApp contact messaging, image-generation APIs,
multi-schedule per day, deploying or pushing (prepared only).

## Risks
Server venv Python version and PyPI reachability for Pillow; Composio Platform Instagram connection absent;
Bale field names unverified until docs check; Peyda font not supplied (Vazirmatn fallback).
