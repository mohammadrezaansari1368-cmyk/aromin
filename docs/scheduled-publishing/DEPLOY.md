# انتشارِ زمان‌بندی‌شدهٔ محصول — راهنمای استقرار، برگشت و چک‌لیستِ پیکربندی (۳.۹.۴۲)

پس از نصب، قابلیت **خاموش** است (`enabled=false`) و تا تنظیماتِ کامل ثبت نشود هیچ کاری نمی‌کند. `/post`، وب‌هوکِ فعلی و
دکمه‌های `approve_post`/`reject_post` بدونِ تغییر می‌مانند.

## ۱. پیش‌نیازها (روی سرور)
- نسخهٔ پایتونِ سرویس: `"/var/www/arominco/dashboard/srv/.venv/bin/python" --version` (Pillow 11.3.0 به ۳.۹ تا ۳.۱۳ نیاز دارد).
- دسترسیِ pip به PyPI (نصب‌کننده Pillow، arabic-reshaper و python-bidi را نصب می‌کند؛ اگر نشد، سرور بالا می‌آید ولی
  آماده‌سازیِ پست با خطای «image dependencies missing» متوقف می‌شود و باید دستی نصب شود).
- نصب‌کننده پیش از هر تغییر از `server.py`، `web`، `legacy.html`، `aromin_publish.py`، `assets` و مهاجرتِ ۰۰۵ بکاپ می‌گیرد.

## ۲. نصب
همان روالِ همیشگی با بستهٔ `aromin-deploy-3.9.42`: پاک‌سازیِ `/var/tmp`، آپلود، اجرای `install.sh`. مهاجرتِ
`005_publishing.sql` هنگامِ بالا آمدنِ سرویس خودکار اجرا می‌شود (فقط `CREATE TABLE IF NOT EXISTS`؛ دادهٔ موجود دست نمی‌خورد).

بررسی پس از نصب:
```bash
curl -s localhost:3000/legacy | grep -o 'APP_VERSION *= *"[0-9.]*"' | head -1
sudo timeout 10 mysql aromin_sales -e "SHOW TABLES LIKE 'pub_%';"
```
باید `3.9.42` و جدول‌های `pub_settings, pub_slots, pub_jobs, pub_deliveries, pub_assets, pub_audit` دیده شوند.

## ۳. متغیرهای env (فایلِ `.env.main` سرویس؛ فقط روی سرور، هرگز در چت)
| متغیر | مقدار | وضعیت |
|---|---|---|
| `TELEGRAM_CHANNEL` | `-1001005246727` | از قبل تنظیم شده |
| `TELEGRAM_CHANNEL_USERNAME` | `aromin_online` | **جدید** — برای لینکِ عمومیِ پست‌ها (پست‌های `/post` هم لینک می‌گیرند) |
| `PUBLIC_BASE_URL` | `https://dashboard.arominco.com` | **جدید** — نشانیِ عمومیِ تصاویر (`/api/pub-media/<sha>.jpg`) |
| `BALE_BOT_TOKEN`, `BALE_CHANNEL_ID` | توکنِ ربات و شناسهٔ کانالِ بله | **لازم برای بله**؛ ربات باید در کانال ادمین با اجازهٔ ارسال باشد |
| `COMPOSIO_IG_ACCOUNT` | شناسهٔ اتصالِ Instagram در **Platform** (`ca_…`) | **لازم برای اینستاگرام**؛ اتصالِ For You کافی نیست |
| `COMPOSIO_IG_USER_ID` | کاربرِ Composio صاحبِ آن اتصال | اگر خالی، `COMPOSIO_USER_ID` |
| `INSTAGRAM_IG_USER_ID` | IG User IDِ حسابِ `aromin.online` | **لازم برای اینستاگرام** |
| `PUB_FONT_DIR` | پوشهٔ TTFهای پیدا (اختیاری) | خالی = Vazirmatn (OFL)؛ فایل‌های پیدا در مخزن نیست |

افزودن (نمونه؛ مقدارها را روی سرور جایگزین کنید):
```bash
printf '\nTELEGRAM_CHANNEL_USERNAME=aromin_online\nPUBLIC_BASE_URL=https://dashboard.arominco.com\n' | sudo tee -a /var/www/arominco/dashboard/srv/.env.main >/dev/null
sudo systemctl restart aromin-sales
```

## ۴. روشن کردن (فقط مدیر؛ پس از کاملِ شدنِ env)
تنظیمات با `PUT /api/publishing/settings?tenant=team` و هدرهای ورودِ مدیر (`X-Aromin-User`، `X-Aromin-Pass`) ثبت می‌شود.
روشن‌شدن رد می‌شود اگر `publishing_time` خالی باشد یا مقصدی انتخاب شده باشد که env آن کامل نیست.

```json
{"enabled": true, "preparation_time": "08:00", "publishing_time": "10:00",
 "destinations": ["telegram", "bale", "instagram_story"],
 "approval_mode": "manual", "late_approval_policy": "defer", "story_show_price": false}
```
- `approval_mode`: پیش‌فرض `manual`؛ `automatic` فقط با تنظیمِ صریح.
- `late_approval_policy`: پیش‌فرض `defer` (تأییدِ دیرتر از ساعتِ انتشار → نوبتِ بعدی)؛ `immediate` → بلافاصله پس از تأیید.
- `whatsapp_channel` همیشه BLOCKED است (API رسمیِ کانالِ واتس‌اپ تأیید نشد)؛ گزارشِ هر نوبت متن و تصاویرِ آماده برای انتشارِ دستی را دارد.

## ۵. آزمونِ زنده بدونِ انتشارِ عمومی
با `approval_mode=manual` و ساعتِ آماده‌سازیِ چند دقیقه بعد: پیش‌نمایشِ خصوصی (تصویرِ کانال + Story + متن) فقط برای ادمین
`71157396` می‌آید. **«رد»** را بزنید → هیچ مقصدی ارسال نمی‌شود. وضعیت: `GET /api/publishing/jobs?tenant=team`.

## ۶. برگشت (Rollback)
1. `bash rollback.sh` (از همان پوشهٔ نصب) فایل‌های بکاپ‌شده را برمی‌گرداند و سرویس را ری‌استارت می‌کند.
2. اختیاری — حذفِ جدول‌های این قابلیت (دادهٔ کسب‌وکار دست نمی‌خورد):
   `sudo mysql aromin_sales < /var/www/arominco/dashboard/srv/migrations/005_publishing.down.sql.txt`
3. ساده‌ترین خاموش‌کردن بدونِ برگشت: `enabled=false` در تنظیمات.

## ۷. رفتارِ تضمین‌شده (آزموده با تست‌های آفلاین)
- هر روز یک نوبت (یکتایی با `pub_slots`)؛ ری‌استارت یا قطعیِ سرور نوبتِ تکراری یا جبرانیِ رگباری نمی‌سازد.
- هر مقصد جدا ردیابی می‌شود؛ ارسالِ موفق هرگز تکرار نمی‌شود؛ خطای مبهم = `UNCERTAIN` (بدونِ تکرارِ خودکار، با
  `POST /api/publishing/deliveries/{id}/resolve` حل می‌شود)؛ ارسالِ هم‌زمان یا اتمیِ همهٔ پلتفرم‌ها تضمین نمی‌شود.
- پیش از هر ارسال (و هر تلاشِ دوباره) دادهٔ محصول از سایت تازه‌سنجی می‌شود؛ هر تغییر (قیمتِ نمایش‌داده، توضیح، تصویر،
  موجودی) پیش‌نویس را مسدود و بازسازی می‌کند و در حالتِ دستی تأییدِ دوباره می‌خواهد.
- پیش‌نویسِ تأییدنشده ۴۸ ساعت پس از نوبتش `MISSED` می‌شود.
