# Docker و صف پایدار آرومین

این مسیر هنوز روی سرور اصلی نصب نشده است. سرویس‌ها: MariaDB، اجرای یک‌بارهٔ migration، API تک‌پروسه و Worker مستقل. صف در جدول `background_jobs` همان MariaDB نگه داشته می‌شود؛ Redis برای این مرحله لازم نیست. تنها پورت میزبان `127.0.0.1:3100` است؛ nginx/TLS فعلی بیرون از Compose می‌ماند. Docker socket داخل برنامه نصب نمی‌شود.

## آزمایش روی محیط یک‌بارمصرف

Docker Engine و Compose نسخهٔ ۲.۲۴ یا بالاتر لازم است. روی این رایانه Docker پیدا نشده؛ اجرای تصویر و تست MariaDB باید روی ماشین دارای Docker یا CI انجام شود.

```sh
python ops/docker/prepare_secrets.py --fresh
cp ops/docker/runtime.env.example ops/docker/runtime.env
chmod 600 ops/docker/runtime.env
docker compose config --quiet
docker compose build
docker compose up -d
curl --fail http://127.0.0.1:3100/api/health
docker compose ps
docker compose logs --tail 50 api worker migrate
```

`--fresh` فقط برای نصب جدید/آزمایشی است. برای دادهٔ واقعی کلید رمزنگاری موجود باید حفظ شود؛ ساخت کلید تازه داده‌های `app_secrets` را ناخوانا می‌کند. فایل‌های `secrets/` و `runtime.env` خارج Git و خارج زمینهٔ build هستند. تصویر بدون دسترسی root و با فایل‌سیستم فقط‌خواندنی اجرا می‌شود. دادهٔ برنامه در `app_state` و دیتابیس در `db_data` می‌ماند. `docker compose down -v` داده‌ها را حذف می‌کند و جزو روال به‌روزرسانی نیست.

Migration پیش از API/Worker و پس از سلامت DB اجرا می‌شود. اجرای خودکار migration در API غیرفعال است تا replicaها هم‌زمان schema را تغییر ندهند. Worker هر کار را در پروسهٔ فرزند با سقف زمان اجرا می‌کند. تحویل حداقل یک‌بار است: برای عملیات نوشتنیِ آینده، handler باید ذاتاً تکرارپذیر و دارای کلید یکتای اثر باشد. در این نسخه فقط `performance_report` و `ledger_audit` خواندنی ثبت شده‌اند؛ صف هنوز ایمپورت، تبدیل گفتار یا ارسال پیام را اجرا نمی‌کند.

## پنل و کنترل صف

تنظیمات ← صف پردازش، فقط برای نقش `manager`: افزودن گزارش، وضعیت، شمار تلاش، لغو، تلاش دوباره و دریافت JSON نتیجه. APIها هم مستقل از UI مجوز و tenant را کنترل می‌کنند. ورودی کار شامل رمز/توکن/URL/دستور اجرایی نیست. درخواست تکراری با یک کلید، همان کار را برمی‌گرداند؛ استفاده از همان کلید برای ورودی متفاوت ۴۰۹ می‌دهد. انقضای lease کار را بازیابی می‌کند؛ توکن قدیمی نتیجه را بازنویسی نمی‌کند. خطاهای عمومی به‌صورت کد ذخیره می‌شوند، نه متن استثنا یا دادهٔ مشتری.

```sh
docker compose up -d --scale worker=2
docker compose logs --tail 100 worker
```

تعداد Worker را متناسب با حافظه و ظرفیت DB بالا ببرید؛ هر Worker یک کار را در هر لحظه اجرا می‌کند. پیش از مقیاس‌دهی روی MariaDB واقعی تست هم‌زمانی را اجرا کنید. تست SQLite تضمین قفل‌های InnoDB نیست.

## انتقالِ سرور اصلی، فقط با اجرای مالک

1. نسخه و digest تصویر، نسخهٔ MariaDB فعلی، فضای دیسک، حجم داده و همهٔ secretها ثبت شوند. MariaDB 11.4 انتخاب این Compose است؛ سازگاری dump و schema نسخهٔ قدیمی باید آزمایش شود.
2. بک‌آپ سازگارِ کامل DB و کپی خصوصی فایل‌های سرویس گرفته و بازیابی‌شان در DB جدا آزمایش شود. فایل‌های `kb_s3_config.json`، `kb_s3_secret.json`، `sales_agent.json`، `widget_sites.json`، `ig_*.json`، `.reopen_codes.json`، `.attendance_archive_v1`، `.assistant-secrets/` و رسانه‌ها به volume `app_state` منتقل شوند؛ UID/GID=10001. هیچ‌کدام در image یا Git قرار نگیرند.
3. secretهای سرویس فعلی از جمله `AROMIN_SECRETS_KEY`، نشست، MCP، relay، AI و SMS به مسیرهای خصوصی جدید منتقل شوند. برای کلید برنامه از `prepare_secrets.py --app-key-file <private-file>` استفاده شود. تنظیمات runtime با سرویس فعلی تطبیق داده شود، نه صرفاً کپی قالب خالی.
4. یک restore آزمایشی با `AROMIN_BACKGROUND_ENABLED=0` انجام شود. این پیش‌فرض عمداً حلقه‌های اعلان/انتشار را خاموش نگه می‌دارد تا هم‌زمان با سرویس قبلی پیام تکراری ارسال نشود. سایت آزمایشی فقط روی loopback بماند.
5. داده و عملکرد هر چهار شاخص، حضور Zurvan، هویت، احراز، نشست و دسترسی نقش‌ها تطبیق داده شوند. تاریخچهٔ انتقال نقش هنوز مسئله‌ای جداست؛ Docker آن را اصلاح نمی‌کند.
6. برای cutover نهایی، نوشتن در سرویس قبلی متوقف، بک‌آپ نهایی گرفته و روی DB جدید بازیابی شود؛ سپس migration و کنترل سلامت و تغییر upstream nginx انجام شود. حلقه‌های پس‌زمینه فقط بعد از خاموش‌شدن نمونهٔ قبلی و با `AROMIN_BACKGROUND_ENABLED=1` فعال شوند.
7. rollback قبل از اولین نوشتن در DB جدید: nginx به سرویس قبلی برگردد. پس از نوشتن در DB جدید، rollback نیاز به توقف نوشتن و انتقال/بازیابی دادهٔ تازه دارد؛ صرفاً عوض‌کردن تصویر یا upstream کافی نیست.

## به‌روزرسانی بعدی

image با tag/digest نسخهٔ مشخص ساخته شود؛ ابتدا بک‌آپ DB و app_state، سپس migration و `docker compose up -d` و کنترل سلامت. نصب بستهٔ tgz از داخل برنامه در حالت Docker با پیام روشن رد می‌شود. برای انتشار واقعی imageها به digest قفل شوند؛ tagهای پایهٔ این طرح برای ساخت اولیه‌اند. ذخیرهٔ بک‌آپ خارج همان ماشین و سیاست نگه‌داری نتیجه/تاریخچهٔ صف باید پیش از بهره‌برداری تعیین شوند.

مراجع: [ترتیب راه‌اندازی Compose](https://docs.docker.com/compose/how-tos/startup-order/) و [قفل تراکنشی MariaDB](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/for-update).
