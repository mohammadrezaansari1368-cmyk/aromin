-- =====================================================================
--  مهاجرت ۰۰۳ — افزودنِ نقشِ «کارشناس آنلاین» (online)
--  (اجرای دوباره بی‌خطر است: MODIFY همان enum را دوباره تعریف می‌کند)
-- =====================================================================

ALTER TABLE users
  MODIFY COLUMN role ENUM('manager','finance','sales','support','salesmgr','accmgr','online')
  NOT NULL DEFAULT 'sales';

ALTER TABLE role_access
  MODIFY COLUMN role ENUM('manager','finance','sales','support','salesmgr','accmgr','online')
  NOT NULL;

ALTER TABLE people
  MODIFY COLUMN role ENUM('sales','support','finance','salesmgr','accmgr','online')
  NOT NULL DEFAULT 'sales';

-- کارشناسِ آنلاین در تارگتِ فروش نقشی ندارد؛ دسترسیِ پایه مثلِ پشتیبانی
INSERT IGNORE INTO role_access (role, panel) VALUES
 ('online','p-dash'),('online','p-inv'),('online','p-own'),('online','p-ticket'),('online','p-calls');
