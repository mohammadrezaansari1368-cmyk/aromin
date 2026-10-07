# آزمون‌های MariaDB و مرورگر (فقط دادهٔ مصنوعی)

1. MariaDBِ یک‌بارمصرف روی 127.0.0.1:3307 با پایگاهِ `aromin_dev` و کاربرِ `aromin` / `local-test-only`.
2. سرورِ واقعی: `DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=aromin DB_PASS=local-test-only DB_NAME=aromin_dev PORT=3010 SPA_DIR=<frontend/dist> python server.py`
3. `AROMIN_LOCAL_INTEGRATION=1 python tests/integration/run_integration.py <deployment>` — tests/test_local_integration روی پورتِ 3010
4. `python tests/integration/e2e_mariadb.py <deployment>` — اصلاحِ تاریخی (dry-run/apply/rollback) و مسیرِ تأیید مالی
5. `python tests/integration/seed_team.py <deployment>` سپس `playwright-cli run-code --filename=tests/integration/ui_spec.js`

تهیه‌کنندهٔ همهٔ داده‌ها خودِ اسکریپت‌هاست؛ هرگز روی پایگاهِ اصلی اجرا نشود (`DB_NAME=aromin_dev`).
6. ایمپورتِ کاملِ تازه: `python tests/integration/seed_team.py <deployment>` و `python tests/integration/make_joolio_fixture.py D:/aromin-mariadb/joolio-fixture.xlsx`، سپس `playwright-cli run-code --filename=tests/integration/import_spec.js` (پیش‌نمایش، تعارض، نامِ تازه، ثبت، ایمپورتِ دوباره بدونِ تغییر، موبایل)
7. گزارشِ اعتبارسنجی (فقط خواندن): `python validate_ledger.py --tenant team --json OUT.json`
