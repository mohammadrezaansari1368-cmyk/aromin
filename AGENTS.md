# AROMIN — راهنمای مشترکِ کدنویس‌ها (Codex و Claude)

این مخزن را دو کدنویس با هم جلو می‌برند. هر دو همین قواعد را رعایت کنند.

**محلِ ذخیره:** منبعِ حقیقت شاخهٔ `main` روی GitHub است (https://github.com/mohammadrezaansari1368-cmyk/aromin). نسخهٔ محلیِ دائمی روی این سیستم: `C:\Users\Administrator\aromin`. نسخه‌های موقت (پوشهٔ Temp/scratchpad) منبع نیستند.

## پیش از شروعِ کار
1. `git pull --ff-only` روی `main` (کارِ بزرگ: شاخهٔ کوتاه‌عمر از `main` و برگشت با fast-forward).
2. **HANDOFF.md** را بخوان؛ بالاترین بخش = آخرین وضعیت و کارهای باز.
3. گراف را تازه کن و برای فهمِ کد از آن بپرس (بدون LLM، فقط AST):
   ```bash
   graphify update .
   graphify query "finance-by permission flow"
   ```
   `graphify-out/` در گیت نیست؛ `.graphifyignore` بخش‌های ساختگی (web/، dist/، تست‌ها، md) را کنار می‌گذارد.
4. کدِ کاشی‌ها: **docs/TILE-MAP.md** (کاربر با کدهایی مثل C1، M15 درخواست می‌دهد).

## پس از پایانِ هر نوبت
- تست‌ها (پایین) را اجرا کن؛ تستی را که اجرا نشده «موفق» اعلام نکن.
- یک بخش **بالای** HANDOFF.md اضافه کن: «تا اینجا انجام دادم» — تاریخ، کدنویس، شاخه/کامیت، چه شد، چه تست شد، کارِ باز.
- commit و push روی `main` (فقط fast-forward؛ **force-push و بازنویسیِ تاریخچه ممنوع**). اگر push رد شد: `git pull --rebase` روی کامیت‌های push‌نشدهٔ خودت، نه force.

## ساختار
- `deployment/server.py` — FastAPI تک‌فایل + MariaDB (pymysql)؛ migrations خودکار.
- `deployment/aromin_stage.py` ↔ `frontend/src/lib/stage-change.ts` — پارسرِ مشترکِ «تغییر مرحله» (بردارها: `deployment/tests/fixtures/stage_change_vectors.json`).
- `deployment/fix_stage_dates.py` — اصلاحِ تاریخی؛ پیش‌فرض dry-run.
- `frontend/` — React 19 + Vite + TS.
- `tools/package_release.py` — بستهٔ نصب در `releases/` (نسخه از `APP_VERSION` در `deployment/legacy.html`).

## تست‌ها
```bash
cd frontend && npx vitest run && npx tsc -b && npm run build
cd deployment && python -m unittest discover -s tests -v
```
آزمونِ MariaDB/مرورگر: `deployment/tests/integration/README.md` (فقط دادهٔ مصنوعی).

## قواعدِ قطعی
- دادهٔ واقعیِ مشتری، `.env`، کلید/توکن و بک‌آپِ دیتابیس هرگز در گیت نمی‌رود.
- تاریخ، ساعت و سال مالیِ دفتر فروش فقط از سلولِ «تغییر مرحله»؛ هیچ fallback و هیچ مقدارِ حدسی.
- `--apply` روی دادهٔ اصلی فقط پس از بک‌آپ و تأییدِ صریحِ کاربر.
- فیلدهای محافظت‌شده (finState، finApproval، finAudit، finBy، stages، وزن‌ها، mgrShare) را ابزارهای اصلاحی تغییر نمی‌دهند؛ finBy فقط از `POST /api/c1/finance-by`.
- تلگرام: بدون تأییدِ ادمین منتشر نکن؛ getMe/getUpdates را از کد صدا نزن؛ webhook را عوض نکن.
- نصب روی سرور را کاربر اجرا می‌کند (WinSCP، `systemd-run`).
