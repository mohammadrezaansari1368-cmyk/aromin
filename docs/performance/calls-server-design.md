# WP-C — تماس‌ها روی سرور (ریزِ تماس + عملکردِ تماس)

وضعیت: ماژولِ خالص (`aromin_calls.py` + `tests/test_calls.py`) پیاده شد؛ مهاجرت/اندپوینت/فرانت باقی است · الگو: عیناً WP-A/B (`006_identity_attendance.sql`، `aromin_attendance.py`، مسیرهای حضور در `server.py`).
اصول: پارسِ اکسل در مرورگر، ردیفِ خام بدون تغییر به سرور؛ ماژولِ پارس خالص (بی DB/FastAPI)؛ نگاشتِ شخص **در زمانِ خواندن** از `identity_aliases`؛ هیچ شخصِ جدیدی ساخته نمی‌شود.

## ۱. مشاهده‌ها از نمونهٔ واقعی (`calldetail_sample.json`، `callsummary_sample.json`)
- هر طرفِ تماس سه ستون دارد: `«مبدا/مقصد تماس-ID»`، `«مبدا/مقصد تماس»` (شماره)، `«نام مبدا/مقصد»`.
- طرفِ کارمند: شماره = داخلیِ ۳رقمی **عددی** (100…208)، ID = شناسهٔ کاربرِ جولیو (3، 5، 7، 8، 17، 23، 25).
- طرفِ مشتری: شماره = **رشته** با صفرِ اول (`0911…`، `013…`)، ID = شناسهٔ مخاطب (156، 604، 3257…) یا خالی (مخاطبِ ثبت‌نشده؛ نام = خودِ شماره).
- **فضای عددیِ ID کاربر و ID مخاطب هم‌پوشان است** (مخاطب 156 در برابر کاربر 25؛ مخاطبِ 8 هم ممکن است). پس نوعِ ID را **فقط از شماره‌ی همان طرف** تعیین می‌کنیم، نه از بزرگیِ ID.
- فرضیهٔ جهت **با ۱۱ ردیفِ نمونه سازگار است**: ۹ خروجی (مبدا داخلی → مقصد موبایل/ثابت)، ۱ ورودی (موبایل/مخاطب 3257 → داخلی 200، بی‌پاسخ/ازدست‌رفته)، ۱ داخلی (101 → 202). ستونِ `«اپلیکیشن»` در همه `Dial` است (حتی ورودی) → برای جهت قابل استفاده نیست. نمونهٔ صف/ID خالیِ طرفِ کارمند در این ۱۱ ردیف نیست؛ قاعدهٔ آن (بند ۴) بر پایهٔ ساختار است و باید روی فایلِ کامل (۲۷۵ ردیف) با آزمونِ دستی تأیید شود.
- خلاصه: در نمونه داخلی 200 صفر تماس دارد ولی در ریز یک تماسِ **ورودی** به 200 هست ⇒ فایلِ خلاصه جهت‌دار است؛ حدسِ جهت از نام فایل کنار می‌رود. مجموعِ `موفق+بدون‌پاسخ+مشغول+عدم‌موفقیت = تمامی رکوردها` در همهٔ ردیف‌های نمونه برقرار است؛ خانهٔ خالی = 0. `کارایی` و `درصد…` مشتق‌اند (ذخیرهٔ ستونی نمی‌شوند، فقط در raw_json).

## ۲. مهاجرت ۰۰۷
`deployment/migrations/007_calls.sql` (Idempotent):
```sql
-- 007 — calls on the server (WP-C). Idempotent. Down: 007_calls.down.sql.txt
CREATE TABLE IF NOT EXISTS call_batches (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 tenant VARCHAR(64) NOT NULL,
 kind VARCHAR(10) NOT NULL,            -- calllog | calls
 file_sha256 CHAR(64) NOT NULL,        -- sha256 of the raw file bytes
 file_name VARCHAR(255) NOT NULL,
 source VARCHAR(20) NOT NULL,          -- import-center
 uploaded_by VARCHAR(100) NOT NULL,
 direction VARCHAR(3),                 -- calls only: in | out (user-chosen)
 period_from CHAR(10), period_to CHAR(10),   -- calllog: min/max date_j; calls: user-chosen
 rows_total INT NOT NULL, inserted INT NOT NULL, updated INT NOT NULL, unchanged INT NOT NULL, conflicts INT NOT NULL,
 skipped TEXT,                         -- JSON [{row, reason}] max 200
 details TEXT,                         -- JSON {conflicts:[{key, reason, fields}], updates:[{key, reason, fields}]} max 200 each
 created_at DATETIME NOT NULL,
 UNIQUE KEY call_batch_file (tenant, file_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS call_logs (
 tenant VARCHAR(64) NOT NULL,
 channel_code VARCHAR(32) NOT NULL,    -- «کد کانال», ASCII digits
 date_j CHAR(10) NOT NULL,             -- «تاریخ کانال» YYYY/MM/DD
 time_s INT,                           -- «ساعت» seconds since midnight; NULL if unparsable
 direction VARCHAR(8) NOT NULL,        -- in | out | internal | unknown
 o_ext VARCHAR(8), o_julio VARCHAR(32), o_phone VARCHAR(32), o_contact VARCHAR(32), o_name VARCHAR(200),
 d_ext VARCHAR(8), d_julio VARCHAR(32), d_phone VARCHAR(32), d_contact VARCHAR(32), d_name VARCHAR(200),
 total_sec INT, talk_sec INT,
 channel_status VARCHAR(12) NOT NULL,  -- success | no_answer | busy | failed | other
 call_status VARCHAR(12) NOT NULL,     -- answered | missed | other
 sync_at CHAR(16),                     -- «تاریخ همگام‌سازی» → 'YYYY/MM/DD HH:MM'
 raw_json TEXT NOT NULL,               -- original row, canonical JSON
 row_sha256 CHAR(64) NOT NULL,         -- sha(raw_json)
 core_sha256 CHAR(64) NOT NULL,        -- sha(canonical(core fields)), see §5
 batch_id BIGINT NOT NULL,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, channel_code), KEY call_log_date (tenant, date_j), KEY call_log_batch (tenant, batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS call_summaries (
 tenant VARCHAR(64) NOT NULL,
 period_from CHAR(10) NOT NULL, period_to CHAR(10) NOT NULL,
 direction VARCHAR(3) NOT NULL,        -- in | out
 ext VARCHAR(8) NOT NULL,              -- «داخلی»
 agent_name VARCHAR(200),              -- «کارشناس», display only
 total INT NOT NULL, answered INT NOT NULL, no_answer INT NOT NULL, busy INT NOT NULL, failed INT NOT NULL,
 talk_sec INT NOT NULL,
 raw_json TEXT NOT NULL, row_sha256 CHAR(64) NOT NULL,
 batch_id BIGINT NOT NULL, updated_at DATETIME NOT NULL,
 PRIMARY KEY (tenant, period_from, period_to, direction, ext), KEY call_summary_batch (tenant, batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
`007_calls.down.sql.txt`:
```sql
-- Manual destructive rollback only. Export call data before use. identity_aliases (006) is untouched.
DROP TABLE IF EXISTS call_summaries;
DROP TABLE IF EXISTS call_logs;
DROP TABLE IF EXISTS call_batches;
```
`deployment/tests/db_fake.py`/`load_schema` باید ۰۰۷ را هم بخواند (مثل ۰۰۶).

## ۳. ماژول `deployment/aromin_calls.py` (خالص)
از `aromin_attendance` بازاستفاده: `norm_header, norm_date, canonical, sanitize_row, TooLarge, SHA_RE, _clean_text`؛ از `aromin_identity`: `normalize_key, normalize_name`؛ از `aromin_stage`: `_j2g` (طولِ دوره).
```python
LIMITS = dict(rows=20000, keys_per_row=40, key_len=64, value_len=300)
SOURCES = ('import-center',)
DIRECTIONS = ('in', 'out')                       # summary upload
def digits(v) -> str | None                      # fa/ar digits→ASCII, int/float(x.0)→str, keeps leading zeros; None if not all-digit
def classify_party(id_raw, number_raw, name_raw) -> dict   # {type: ext|external|unknown, ext, julio, phone, contact, name}
def direction_of(o: dict, d: dict) -> str        # in | out | internal | unknown
def parse_clock(v) -> int | None                 # "18:13':14\"", "18:13:14", "18:13", Excel fraction → seconds
def parse_duration(sec_v, hms_v) -> int | None   # seconds column first, else "HH:MM:SS" (hours ≤ 999); 0..86400 for a call
def parse_sync(v) -> str | None                  # "18:13 1405/06/20" or "1405/06/20 18:13" → "1405/06/20 18:13"
def norm_status(channel_v, call_v) -> tuple[str, str]
def parse_call_row(row: dict, cmap: dict) -> tuple[dict | None, str | None]   # (call, None) | (None, reason)
def parse_log_payload(payload) -> dict           # {file_name, sha256, source, calls:[...], skipped:[{row, reason}], in_file_conflicts:[...]}
def plan_calls(existing: dict, calls: list) -> dict   # existing {code: {row_sha256, core_sha256, sync_at, [ستون‌های core]}} → {insert:[call], update:[{key, reason, fields, call}], unchanged:int, conflicts:[{key, reason, fields}]}
def parse_period(p) -> tuple[str, str]           # {month:'1405/06'} | {from, to} → (from, to); ValueError
def parse_summary_payload(payload) -> dict       # {file_name, sha256, source, direction, period_from, period_to, rows:[...], skipped, warnings}
def plan_summary(existing: dict, rows: list) -> dict  # existing {ext: row_sha256} → {insert, update, unchanged}
def confirmed_index(aliases) -> dict             # identity_aliases rows → {(kind, key): personId} فقط julio/ext confirmed
def resolve_party(ext, julio, aliases) -> tuple[str | None, str | None]   # (personId, issue); aliases = rows یا confirmed_index
def daily_stats(calls, aliases, start, end, work=(600, 1080)) -> dict     # §8؛ work به دقیقه (۱۰:۰۰–۱۸:۰۰)
def daily_records(stats) -> list                 # WP-3 adapter, §8
```

## ۴. قواعدِ نرمال‌سازی
- **سرستون‌ها** با `norm_header` (ی/ک عربی، ZWNJ→فاصله، lower). اجباری: `کد کانال`، `تاریخ کانال`، `مبدا تماس`، `مقصد تماس`؛ نبودِ هر کدام ⇒ 400 «ستون … در فایل نیست» (هیچ چیز ذخیره نمی‌شود).
- **کد کانال**: `digits()` و حذفِ صفرِ ابتدایی (`normalize_key('julio', …)`)؛ خالی/نامعتبر ⇒ ردیف skip با «بدون کد کانال».
- **تاریخ**: `norm_date`؛ نامعتبر ⇒ skip «تاریخ نامعتبر». **ساعت**: `parse_clock` با regex `(\d{1,2})\D+(\d{2})(?:\D+(\d{2}))?` روی متنِ ارقام‌لاتین‌شده؛ نامعتبر ⇒ `time_s=NULL` (ردیف حفظ می‌شود). تماسِ گذرنده از نیمه‌شب به تاریخِ شروع تعلق دارد.
- **classify_party** (برای هر طرف):
  - `n = digits(number_raw)`. اگر `number_raw` رشته‌ای با `0` شروع شود یا `len(n) ≥ 5` ⇒ `external`: `phone=n` (صفرِ اول حفظ؛ اگر اکسل عدد کرده و ۱۰رقمی با 9 شروع شود، `'0'+n`)، `contact=normalize_key('julio', id_raw)`.
  - اگر `n` با `^[1-9][0-9]{1,3}$` بخواند ⇒ `ext`: `ext=n`، `julio=normalize_key('julio', id_raw)` (None = **صف/داخلیِ مشترک**؛ تماسِ ورودی به آن فقط در سطلِ صف شمرده می‌شود، §۸).
  - شمارهٔ خالی/غیرعددی ⇒ `unknown` (ID این طرف نادیده؛ فقط در raw_json).
  - `name`: `_clean_text` (≤۲۰۰)؛ اگر برابرِ شماره بود ⇒ None.
- **direction_of**: ext→ext = `internal`؛ ext→(external|unknown) = `out`؛ (external|unknown)→ext = `in`؛ سایر = `unknown` (ذخیره می‌شود، به کسی نسبت داده نمی‌شود، در `unassigned` شمرده می‌شود).
- **وضعیت‌ها** (بعد از `normalize_name`، ZWNJ→فاصله و حذفِ فاصله برای مقایسه): `وضعیت کانال`: موفق→success، بدون‌پاسخ→no_answer، مشغول→busy، عدم‌موفقیت→failed، سایر→other. `وضعیت تماس`: پاسخ‌داده‌شده→answered، ازدست‌رفته→missed، سایر/خالی→ از کانال: success→answered، no_answer|busy|failed→missed، وگرنه other.
- **مدت‌ها**: `total_sec` از `زمان کل (ثانیه)` وگرنه `زمان کل`؛ `talk_sec` از `مدت مکالمه (ثانیه)` وگرنه `مدت مکالمه`. منفی/>86400/اعشاری ⇒ NULL. اگر ستونِ ثانیه مقدار دارد ولی نامعتبر است ⇒ NULL (به HH:MM:SS برنمی‌گردد).
- ردیف با `sanitize_row` (همان سقف‌ها)؛ `raw_json = canonical(row)` کلیدها همان سرستون‌های فایل. در `skipped`، `row` = اندیسِ ۱-پایه در `payload.rows`.
- **خلاصه**: اجباری `کارشناس`، `داخلی`، `تمامی رکوردها`. `ext = digits(داخلی)` با `^[1-9][0-9]{1,3}$` وگرنه skip «داخلی نامعتبر» (ردیفِ «جمع» هم همین‌جا رد می‌شود). شمارش‌ها: خالی→0، باید عددِ صحیحِ ۰..۱۰۰۰۰۰ وگرنه skip «مقدار نامعتبر در ستون …». `talk_sec` از `مدت مکالمه` (HH:MM:SS، ساعت ≤ 999). اگر مجموعِ چهار وضعیت ≠ total ⇒ ذخیره + `warnings` «جمعِ وضعیت‌ها با کل نمی‌خواند (داخلی X)» (فهرستِ رشته؛ اندپوینت آن را `warnings.sums` برمی‌گرداند). داخلیِ تکراری با محتوای یکسان ⇒ یکی + skip «تکراری در فایل».
- **دوره**: `{month:'1405/06'}` ⇒ `1405/06/01`..`1405/06/31` (ماه ۷–۱۲: `/30`)؛ `{from,to}` با `norm_date` و `from ≤ to`؛ بیش از ۳۶۶ روز ⇒ 400.

## ۵. dedupe و تعارض
**ریز تماس** — کلید `(tenant, channel_code)`. `core = {date_j, time_s, direction, o_*, d_* (بدون name), total_sec, talk_sec, channel_status, call_status}`؛ `core_sha256 = sha(canonical(core))`.
- داخلِ یک فایل: کدِ تکراری با raw یکسان ⇒ یکی حساب (skipped «تکراری در فایل»)؛ با raw متفاوت ⇒ **هر دو** کنار می‌روند و در `conflicts` با reason `in_file` می‌آیند.
- `plan_calls` در برابرِ DB:
  1. نبود ⇒ `insert`.
  2. `row_sha256` برابر ⇒ `unchanged`.
  3. `core_sha256` برابر (فقط نام/همگام‌سازی/دلایل تماس عوض شده) ⇒ `update` با reason `meta`.
  4. core متفاوت و `new.sync_at > old.sync_at` (هر دو موجود) ⇒ `update` با reason `newer_sync` و `fields` = نامِ فیلدهای core تغییرکرده (برای این، `existing` باید ستون‌های core را هم داشته باشد؛ بی آن‌ها `fields=[]`). conflictها هم `fields` دارند.
  5. در غیر این صورت ⇒ **conflict**: ردیفِ موجود دست نمی‌خورد؛ reason `older_or_same_sync` یا `no_sync`.
- همهٔ updateها و conflictها (حداکثر ۲۰۰ تا) در `call_batches.details` ثبت و در پاسخ برگردانده می‌شوند ⇒ هیچ بازنویسیِ بی‌صدا نیست. راهِ حلِ conflict: حذفِ دستهٔ قدیمی و بارگذاریِ دوباره (ردیف‌های دستهٔ حذف‌شده پاک می‌شوند).
- فایلِ تکراری (sha یکسان) ⇒ `duplicate: true` با دستهٔ قبلی، بدون نوشتن (همان الگوی حضور، شاملِ مسیرِ `IntegrityError`).

**عملکرد تماس** — کلید `(tenant, period_from, period_to, direction, ext)`. داخلیِ تکراری در فایل با محتوای متفاوت ⇒ هر دو skip «داخلیِ تکراری با محتوای متفاوت». `plan_summary`: نبود→insert، sha برابر→unchanged، متفاوت→update و فهرستِ `ext`ها در `details.updates` (خروجیِ تازه‌ترِ همان دوره جایگزین می‌شود و گزارش می‌شود). اگر برای همان direction دوره‌ای **هم‌پوشان ولی نابرابر** ذخیره باشد ⇒ نوشتن انجام می‌شود ولی `warnings` شامل `overlaps:[{from,to}]`.

## ۶. نگاشتِ هویت
- در **آپلود** (درون همان تراکنش، مثل حلقهٔ کارت در حضور): برای هر طرفِ `ext` یکتا در فایل:
  - اگر `julio` دارد: `merge_alias(ex, 'julio', julio, raw=name or ext, 'calllog', match(name, people))`.
  - `merge_alias(ex, 'ext', ext, raw=name or ext, 'calllog', match(name, people))`.
  - خلاصه: فقط `ext` با `raw=کارشناس`، `source='callsummary'`.
  - بی‌نام ⇒ `match('')` ⇒ `review` (شخص NULL). تأییدِ انسانی هرگز بازنویسی نمی‌شود (منطقِ موجودِ `merge_alias`). **هیچ ردیفی در people نوشته نمی‌شود.**
  - پاسخ: `unmapped:[{kind, key, rawName, status}]` برای هر aliasِ غیر confirmed ⇒ همان کارتِ `IdentityReview` (برچسب‌های `جولیو`/`داخلی` از قبل هست؛ بعد از decide روی julio/ext، `loadCallStats` دوباره صدا زده شود).
- **صف/داخلیِ مشترک** (تصمیمِ مالک): تماسِ ورودی که طرفِ کارمندش `julio` ندارد به `resolve_party` نمی‌رود؛ به سطلِ تیمیِ همان داخلی/صف (`queues`) می‌رود — نه به هیچ فرد و نه به صاحبِ confirmedِ داخلی، حتی اگر alias `ext` آن تأیید شده باشد.
- در **خواندن**، `resolve_party(ext, julio, aliases)` فقط aliasهای `confirmed`:
  julio confirmed ⇒ همان؛ وگرنه ext confirmed ⇒ همان؛ هر دو confirmed و متفاوت ⇒ `(None, 'julio_ext_conflict')`؛ هیچ ⇒ `(None, 'unmapped')`. (اولویتِ julio چون داخلی ممکن است جابه‌جا شود.)
- فرض: `julio` در ریزِ تماس همان فضای شناسهٔ کاربرِ جولیو است که `IdentityReview` از وظایف (`source:'tasks'`) اسکن می‌کند؛ در پیاده‌سازی با یک کاربرِ واقعی تطبیق داده شود.

## ۷. اندپوینت‌ها (`server.py`، **پیش از** `GET /api/performance/{view}`؛ همان `_att_ctx`/`_att_deny`/`_SaTx`/`_alias_write`)
نوشتن و جزئیات: `ATT_ADMIN_ROLES`. **تصمیمِ مالک:** مدیرِ فروش (و هر نقشِ غیر `ATT_ADMIN_ROLES`) فقط آمار (`daily`، `summary`) را می‌بیند؛ ریزِ هر تماس و شمارهٔ مشتری (`GET …/calls/log`) هرگز. خطاها `{"ok":false,"error":"…"}` با 400/401/403/404/409/413.

| Method · Path | Auth | توضیح |
|---|---|---|
| `POST /api/performance/calls/log` | write | آپلودِ ریز تماس |
| `POST /api/performance/calls/summary` | write | آپلودِ عملکرد تماس |
| `GET /api/performance/calls/daily?start&end&person` | read (scope) | آمارِ روزانهٔ هر شخص |
| `GET /api/performance/calls/log?start&end&person&direction&offset&limit` | write-roles | ردیف‌های ریز (شمارهٔ مشتری = PII) |
| `GET /api/performance/calls/summary?direction&from&to` | read (scope) | خلاصه‌های ذخیره‌شده |
| `GET /api/performance/calls/batches?kind` | write-roles | تاریخچهٔ دسته‌ها |
| `DELETE /api/performance/calls?batch=ID` یا `?all=1&kind=calllog\|calls` | write | حذف؛ aliasها دست نمی‌خورند |

- `POST …/calls/log` بدنه: `{tenant, fileName, sha256, source:"import-center", rows:[{<header>: value}]}` ⇒ 201
  `{ok, duplicate:false, batch:{id, kind, fileName, sha256, source, uploadedBy, createdAt, periodFrom, periodTo, rows, inserted, updated, unchanged, conflicts, skipped, details}, unmapped:[…]}`؛ تکراری ⇒ 200 `{ok, duplicate:true, batch}`. هیچ ردیفِ معتبر ⇒ 400 با `skipped`.
- `POST …/calls/summary` بدنه: `{tenant, fileName, sha256, source, direction:"in"|"out", period:{month:"1405/06"} | {from:"1405/06/01", to:"1405/06/15"}, rows:[…]}` ⇒ 201 `{ok, duplicate, batch, unmapped, warnings:{overlaps:[…], sums:[…]}}`. نبودِ direction/period ⇒ 400 «جهت و دوره را انتخاب کنید».
- `GET …/calls/daily` (scope دقیقاً مثل `attendance_read`: ادمین همه؛ دیگران `perf.directory`؛ person خارج از دامنه ⇒ 403/404؛ بازه با `norm_date`، پیش‌فرض ماهِ جاری نیست ⇒ هر دو اجباری، بیش از ۳۶۶ روز 400):
  `{ok, scope, period:{from,to}, settings:{workStart, workEnd}, people:[{personId, personName, days:[DayStat], totals:DayStat}], queues:[QueueStat], unassigned:[{date, in, inMissed, out, internal, unknown}]*, issues:[{kind, key, raw, reason, calls}]*, updatedAt}` — `*` فقط ادمین. `queues` آمارِ تیمی است (بی شمارهٔ مشتری) و برای مدیرِ فروش هم قابل نمایش است.
- `GET …/calls/log` ⇒ `{ok, total, rows:[{channelCode, date, time:"HH:MM:SS", direction, origin:{ext, julio, phone, contact, name, personId}, dest:{…}, totalSec, talkSec, channelStatus, callStatus, syncAt, batchId}]}`؛ `limit ≤ 1000`.
- `GET …/calls/summary` ⇒ `{ok, rows:[{periodFrom, periodTo, direction, ext, agentName, personId, personName, total, answered, noAnswer, busy, failed, talkSec}]}` (غیرادمین فقط ردیف‌های اشخاصِ مجاز).

## ۸. شکلِ آمارِ روزانه (قرارداد برای WP-3)
`DayStat = {date, in, inAnswered, inMissed, out, outAnswered, outUnanswered, internal, answered, missed, talkSec, totalSec, afterHours}`
- هر تماس به طرفِ(های) کارمندِ resolveشده نسبت داده می‌شود: `in`→مقصد، `out`→مبدا، `internal`→**هر دو** (هر کدام +۱ internal و talk؛ اگر مبدا و مقصد یک نفر بود فقط یک‌بار).
- **صف**: `in` با مقصدِ `ext` بی `julio` ⇒ فقط `queues` = `QueueStat = {ext, date, in, inAnswered, inMissed, talkSec, totalSec, afterHours}` (کلید: داخلی/صف + روز)؛ در هیچ DayStat، `unassigned` یا `issues` شمرده نمی‌شود. (ورودیِ پاسخ‌داده‌شدهٔ صف هم همین‌جاست: پاسخ‌دهنده از ریز معلوم نیست؛ خروجی/داخلیِ داخلیِ بی julio همچنان با `ext` confirmed resolve می‌شود.)
- `answered = inAnswered + outAnswered`؛ `missed = inMissed`؛ `outUnanswered` جدا (بی‌پاسخیِ مشتری «ازدست‌رفته» برای کارمند نیست). internal در answered/missed نیست. `talkSec/totalSec` جمعِ مقادیرِ غیر NULL.
- `afterHours`: `time_s` بیرون از `[workStart, workEnd)` از `attendance_settings` (پیش‌فرض 10:00–18:00؛ `work=(600, 1080)` دقیقه). `time_s` NULL ⇒ afterHours نیست. `totals.date = null`.
- خروجی: `{people:[{personId, days, totals}], queues, unassigned, issues}` (`personName` را اندپوینت می‌افزاید). `unassigned.internal` یک‌بار برای هر تماسی که دست‌کم یک طرفش resolve نشد؛ `issues` به ازای هر طرفِ resolveنشده، با کلیدِ julio اگر هست وگرنه ext.
- تماسِ بی‌نسبت (unknown/unmapped/conflict) ⇒ `unassigned` و `issues`؛ هرگز حدسی نسبت داده نمی‌شود.
- `daily_records(stats)` ⇒ ردیف‌هایی هم‌شکلِ `records()`:
  `{'id':'calls:<pid>:<date>:<metric>','personId','date','metric','value','unit','source':'call_logs','note'}` با metric ∈ `calls_in, calls_out, calls_internal, calls_answered, calls_missed, talk_seconds` (unit `تماس`/`ثانیه`)؛ صفرها تولید نمی‌شوند؛ `queues`/`unassigned` هرگز رکوردِ شخص نمی‌شوند. سیم‌کشی به `records()`/`metrics()` در WP-3 است.

## ۹. فرانت‌اند
- `frontend/src/lib/attendanceApi.ts`: فقط `export` کردنِ `call` و `qs` (بدون تغییرِ رفتار).
- **جدید** `frontend/src/lib/callsApi.ts`: انواعِ `CallBatch, DayStat, CallDaily, CallSummaryRow, CallUnmapped`؛ `postCallLog(s, {fileName, sha256, source, rows})`، `postCallSummary(s, {…, direction, period})`، `fetchCallDaily(s, {start, end, person?})`، `fetchCallLog`، `fetchCallSummary`، `fetchCallBatches`، `deleteCalls(s, {batch} | {all:true, kind})`؛ و `readCallRows(buf): Row[]` (شیتِ اول، `XLSX.utils.sheet_to_json(ws, {defval: null, raw: true})`، رشته‌ها بدون trim تا صفرِ اولِ شماره بماند). sha از `sha256Hex(buf)`.
- **جدید** `frontend/src/components/import/CallSummaryOptions.tsx`: زیرِ هر آیتمِ صف با `type==='calls'`:
  - «جهت»: دو دکمهٔ رادیویی `ورودی`/`خروجی` — **بدون پیش‌فرض**، از نامِ فایل حدس زده نمی‌شود.
  - «دوره»: سوییچ `ماه شمسی` (سال + ماه، پیش‌فرض خالی) / `از–تا` (دو ورودیِ `YYYY/MM/DD` با `parseJ` از `lib/jalali.ts`)؛ خطای درجا برای `from > to`.
  - خروجی `{direction, period}` در `QItem.callOpts`.
- `ImportPage.tsx`:
  - `calllog` و `calls` برای `canSeeAll(session)` **علاوه بر** موتورِ قبلی به سرور هم می‌روند (`importCalls(items)` همانندِ `importAttendance`)؛ برای دیگران رفتار مثل امروز. داشبوردهای قدیمی تا WP-3 از موتورِ قبلی تغذیه می‌شوند.
  - دکمهٔ «ورود» وقتی آیتمِ `calls` بدونِ `callOpts` کامل در صف است (و کاربر ادمین است) غیرفعال؛ متن: «جهت و دورهٔ فایلِ عملکردِ تماس را انتخاب کنید».
  - یادداشتِ نتیجه: تکراری / `n جدید · n به‌روز · n تعارض` / `n شناسه نیازمند تأیید نگاشت`؛ تعارض‌ها با `details.conflicts` در یک `<details>` فهرست می‌شوند.
- `IdentityReview.tsx`: پس از decide روی `julio`/`ext` کشِ آمارِ تماس (`callsCache`) باطل شود. تغییرِ دیگری لازم نیست.

## ۱۰. برنامهٔ آزمون (`deployment/tests/test_calls.py` + `frontend/src/lib/callsApi.test.ts`)
فیکسچرِ مصنوعی `deployment/tests/fixtures/calls_synthetic.json` (ساختار و قالبِ مقادیر از نمونهٔ واقعی؛ نام/شماره همه مصنوعی): سرستون‌های واقعی، ردیفِ صف (مقصد 999 بی ID)، نام‌ها «کارشناس یک/دو/سه»، «مشتری الف»، شماره‌ها `09000000001…`، `01300000001`، کدهای کانال `1001…`؛ people: `{id:1,name:'کارشناس یک'}`، `{id:2,name:'کارشناس دو'}`. **هیچ دادهٔ واقعی.**
Pure:
1. `digits`/`classify_party`: `'0911…'`→external با صفر؛ `9110000001` (int ۱۰رقمی)→`'09110000001'`؛ `200`/`'۲۰۲'`→ext؛ `'0200'`→external؛ `None`/`''`/`'صف'`→unknown؛ ID مخاطبِ `8` کنارِ شمارهٔ موبایل ⇒ contact نه julio.
2. `direction_of`: ext→ext internal، ext→ext‑less out، external→ext in، external→external unknown، unknown→ext in.
3. `parse_clock`: `18:13':14"`→65594، `۰۹:۰۵':۰۰"`، `'18:13'`، `0.5`→43200، `'x'`→None.
4. `parse_duration`: ستونِ ثانیه مقدم؛ fallback `'00:08:24'`→504؛ `-1`/`90000`/`1.5`→None.
5. `norm_status`: پاسخ‌داده‌شده با/بی ZWNJ و ی عربی؛ fallback از وضعیت کانال؛ ناشناخته→other.
6. `parse_sync`: هر دو ترتیب؛ نامعتبر→None.
7. `parse_call_row`: بی‌کد کانال، تاریخ `1405/07/31`، ساعتِ بد (حفظ با NULL).
8. `parse_log_payload`: ستونِ اجباریِ گم ⇒ ValueError؛ تکراریِ یکسان ⇒ یکی؛ تکراریِ متفاوت ⇒ هر دو conflict `in_file`؛ `rows>LIMITS` ⇒ TooLarge؛ sha نامعتبر ⇒ ValueError.
9. `plan_calls`: پنج شاخهٔ §5 (insert / unchanged / meta / newer_sync با fields / older_or_same_sync و no_sync).
10. `parse_period`: `1405/06`→`/31`، `1405/12`→`/30`، from>to، ۳۶۷ روز، ماهِ `13`.
11. `parse_summary_payload`: خالی→0، ردیفِ «جمع» skip، داخلیِ تکراری، هشدارِ جمع، direction نامعتبر.
12. `plan_summary`: insert/unchanged/update.
13. `resolve_party`: julio مقدم؛ فقط ext؛ هر دو متفاوت ⇒ conflict؛ suggested/review ⇒ unmapped.
14. `daily_stats`: internal به هر دو، self‑internal یک‌بار، outUnanswered≠missed، afterHours مرزِ 10:00 و 18:00، unassigned، بازه شامل‌دو‌سر؛ ورودیِ صف فقط در `queues` حتی با ext confirmed برای یک فرد.
15. `daily_records`: id، unit، حذفِ صفرها.
Endpoint (با `db_fake`، مثل `test_attendance.py`):
16. 401 بی‌ورود، 403 برای نقشِ sales روی POST/log/batches/DELETE، قبل از هر دسترسی به DB.
17. آپلودِ ریز: 201، شمارش‌ها، aliasهای julio/ext با `source='calllog'`، تطبیقِ دقیق ⇒ confirmed، بی‌نام ⇒ review، **تعدادِ people بدون تغییر**.
18. همان فایل دوباره ⇒ `duplicate:true` بدون نوشتن؛ فایلِ دوم با sync قدیمی‌تر ⇒ conflicts=1 و ردیفِ DB دست‌نخورده.
19. تأییدِ انسانیِ قبلی روی ext با آپلودِ جدید بازنویسی نمی‌شود.
20. `daily` برای sales فقط خودش؛ `unassigned/issues` برای او نیست؛ person خارج از دامنه ⇒ 403.
21. خلاصه: بی‌direction ⇒ 400؛ آپلودِ دوباره با محتوای تغییرکرده ⇒ update و `details.updates`؛ دورهٔ هم‌پوشان ⇒ warnings.
22. DELETE batch فقط ردیف‌های همان دسته؛ aliasها می‌مانند.
Frontend: `readCallRows` صفرِ اول را نگه می‌دارد؛ `CallSummaryOptions` بدون انتخاب ⇒ دکمه غیرفعال؛ `postCallSummary` بدنهٔ درست.

## ۱۱. معیارهای پذیرش
- مهاجرت ۰۰۷ دوبار بی‌خطا اجرا می‌شود؛ down فقط سه جدولِ ۰۰۷ را حذف می‌کند.
- فایلِ کاملِ ۲۷۵ ردیفی: ۲۷۵ insert، ۰ skip؛ بارگذاریِ دوباره ⇒ duplicate؛ هر ردیف `batch_id` دارد.
- شمارشِ جهت روی فایلِ کامل دستی بازبینی شود: هیچ ردیفی با هر دو طرف external جز `unknown` نیست؛ ردیف‌های `unknown` در گزارش آمده‌اند.
- هیچ ردیفِ موجودی بی‌آن‌که در `updated`/`conflicts` + `details` بیاید تغییر نمی‌کند.
- هیچ رکوردی در `people` ساخته یا تغییر داده نمی‌شود؛ شناسه‌های ناشناخته در کارتِ بازبینیِ هویت دیده می‌شوند.
- آپلودِ «عملکرد تماس» بدون انتخابِ جهت و دوره ممکن نیست (UI و سرور).
- `GET …/calls/daily` برای کاربرِ فروش فقط دادهٔ خودش را برمی‌گرداند؛ ردیفِ ریز و شمارهٔ مشتری فقط برای `ATT_ADMIN_ROLES`.
- `pytest deployment/tests` و `npm test`/`tsc` سبز؛ مسیرِ قدیمیِ موتورِ ایمپورت برای calllog/calls بدون تغییر کار می‌کند.

## ۱۲. خارج از دامنه
- سیم‌کشیِ تماس به `records()`/`metrics()` و کاشی‌های UI عملکرد (WP-3).
- حذفِ مسیرِ موتورِ قبلی برای calllog/calls یا اصلاحِ حدسِ جهت از نام فایل در آن.
- نگاشتِ زمان‌دار (تاریخچهٔ جابه‌جاییِ داخلی بین افراد).
- نگهداری/تطبیقِ مخاطبانِ مشتری (`o_contact/d_contact`) با دفترچهٔ مخاطبین؛ ضبط مکالمه؛ «دلایل تماس».
- ویرایشِ دستیِ ردیفِ تماس (override) و دکمهٔ «بازنویسیِ اجباری» برای تعارض.
- مهاجرتِ دادهٔ تماسِ ذخیره‌شده در مرورگر/موتورِ قبلی به سرور.
- هر محاسبهٔ پولی/پورسانتی از تماس.

## ۱۳. پرسش‌های کسب‌وکاری (فقط برای مالک)
1. ~~مدیرِ فروش ریز یا فقط آمار؟~~ **تصمیمِ مالک: فقط آمار**؛ هرگز ریزِ تماس یا شمارهٔ مشتری.
2. ~~ورودیِ بی‌پاسخِ صف/داخلیِ مشترک به چه کسی؟~~ **تصمیمِ مالک: به گروه/صف** (سطلِ تیمیِ `queues` با کلیدِ داخلی)، نه هیچ فرد و نه صاحبِ داخلی. (اجرا: همهٔ ورودی‌های بی julio، پاسخ‌داده یا نه، در همان سطل.)
3. داخلی 999 و داخلی‌های بدون کارمند (صف/اپراتور) باید با «رد» در بازبینیِ هویت کنار گذاشته شوند؟ (لازم است کسی یک‌بار رد کند.)
