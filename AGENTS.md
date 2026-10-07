# AROMIN — راهنمای مشترکِ کدنویس‌ها (Codex و Claude)

این مخزن را دو کدنویس با هم جلو می‌برند. هر دو همین قواعد را رعایت کنند.

## روال (GitHub-only، حداقلِ توکن)
- منبعِ حقیقت فقط `origin/main` (https://github.com/mohammadrezaansari1368-cmyk/aromin). هیچ clone/نسخهٔ دائمی روی سیستم نگه ندار.
- هر کار: clone موقت در `%TEMP%` (`git clone --depth 1`) → حداقلِ تغییر → تستِ مرتبط → commit → push → بررسیِ remote → حذفِ workspace.
- اول `git status/diff/log`؛ فقط فایل‌های مرتبط را بخوان؛ کلِ مخزن را اسکن نکن (برای پیدا کردن: `graphify update .` و `graphify query "..."`).
- force-push و بازنویسیِ تاریخچه ممنوع؛ push رد شد → `git pull --rebase`.
- `.env`، کلید/توکن، دیتابیس، بکاپ و دادهٔ مشتری هرگز در گیت نه؛ `node_modules`، `frontend/dist`، `deployment/web` و بسته‌های `releases/` commit نشوند.
- توضیح/مستندِ اضافه نساز؛ HANDOFF.md: فقط یک بندِ کوتاه بالای فایل؛ گزارشِ پایانی حداکثر ۵ خط: branch / commit / tests / push / cleanup.
- کدِ کاشی‌ها: docs/TILE-MAP.md.

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
