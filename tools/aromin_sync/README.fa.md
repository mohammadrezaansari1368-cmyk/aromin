# آرومین‌سینک

نیازمند Python 3.12 و ویندوز مالک است. در ریشهٔ همین مخزن:

```powershell
python -m venv tools/aromin_sync/.venv
tools/aromin_sync/.venv/Scripts/python -m pip install -r tools/aromin_sync/requirements.txt
tools/aromin_sync/.venv/Scripts/python -m playwright install chromium
tools/aromin_sync/.venv/Scripts/python -m tools.aromin_sync login
```

مدیر در تنظیمات ← وب سرویس، کلیدی با دسترسی‌های `calls:write`، `joolio:write`، `conversion:write` و `sync:notify` بسازد. هنگام اولین `login` شناسه تیم و کلید را وارد کنید. رمز ذخیره نمی‌شود؛ کلید با DPAPI فقط برای همین کاربر نگهداری می‌شود. در پنجرهٔ اختصاصی جولیو و داشبورد دستی وارد شوید و «مرا به خاطر بسپار» را بزنید. CAPTCHA فقط دستی است.

فرمان‌ها با پیشوند `python -m tools.aromin_sync` اجرا می‌شوند: `status`، `run-once calls --dry-run`، `run-once calls`، `run-once summary`، `run-once deals`، `login`، `install`، `uninstall`، `update` و `selftest`. برای نصب از همان Python محیط مجازی استفاده کنید. نصب، وظیفهٔ ورود به ویندوز `AROMINSync` را می‌سازد؛ پنجرهٔ ورودی شبکه ندارد. تنظیم فاصلهٔ تماس‌ها در `%LOCALAPPDATA%\AROMINSync\config.json` است؛ پیش‌فرض پنج دقیقه.

میان‌بر ویندوز نیز موجود است: `tools\aromin_sync\aromin_sync.cmd selftest`؛ اگر پوشهٔ آن را به PATH کاربر اضافه کنید، `aromin_sync selftest` اجرا می‌شود.

با پایان نشست، منبع ساعتی امتحان می‌شود و اعلان به مدیر ارسال می‌شود. `login` را اجرا کنید؛ توقف خطاها نیز با ورود دوباره پاک می‌شود. پنج خطای متوالی یا تغییر ساختار پاسخ، منبع را متوقف می‌کند. جزئیات وضعیت در `status` است. `--dry-run` فقط شمارش می‌کند و چیزی به داشبورد یا نشانگرها نمی‌نویسد؛ نیازمند نشست معتبر و Playwright است.

محدودیت این نسخه: ساختار واقعی پاسخ KPI و نگاشت مرحله‌های قیف ارائه نشده؛ منبع KPI، ارسال گزارش روزانه بعد از ۲۰ و ثبت تبدیل عمداً مسدودند و از اعداد حدسی استفاده نمی‌شود. معامله فقط در پیش‌نمایش بدون تعارض، نامعتبر و کارشناس تازه ثبت می‌شود؛ صفحهٔ داشبورد باید نشانگرهای همین نسخه را داشته باشد.

به‌روزرسانی فقط با مخزن بدون تغییر محلی و `git pull --ff-only` است؛ پیش از آن از فایل‌های گیت نسخه‌ای در پوشهٔ خصوصی مالک ساخته می‌شود. در شکست آزمون، وظیفه به پوشهٔ نسخهٔ قبلی برمی‌گردد؛ تاریخچهٔ گیت بازنویسی نمی‌شود. `login` و `update` ابتدا وظیفهٔ جاری را متوقف می‌کنند؛ پس از ورود دوباره، `install` را برای شروع سرویس اجرا کنید.

اثبات آفلاین و بدون نصب بستهٔ تست:
```powershell
python -m unittest discover -s tools/aromin_sync/tests
python -m tools.aromin_sync selftest
```
