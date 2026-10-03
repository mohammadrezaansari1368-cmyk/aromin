-- =====================================================================
--  مهاجرت ۰۰۲ — افزودنِ نقش‌های «مدیر فروش» و «مدیر حساب»
--  (اجرای دوباره بی‌خطر است: MODIFY همان enum را دوباره تعریف می‌کند)
-- =====================================================================

ALTER TABLE users
  MODIFY COLUMN role ENUM('manager','finance','sales','support','salesmgr','accmgr')
  NOT NULL DEFAULT 'sales';

ALTER TABLE role_access
  MODIFY COLUMN role ENUM('manager','finance','sales','support','salesmgr','accmgr')
  NOT NULL;

ALTER TABLE people
  MODIFY COLUMN role ENUM('sales','support','finance','salesmgr','accmgr')
  NOT NULL DEFAULT 'sales';

-- دسترسیِ پیش‌فرضِ نقش‌های جدید (مثل مدیر، بدون تنظیماتِ حساس اگر لازم شد بعداً محدود کن)
INSERT IGNORE INTO role_access (role, panel) VALUES
 ('salesmgr','p-dash'),('salesmgr','p-inv'),('salesmgr','p-own'),('salesmgr','p-team'),
 ('salesmgr','p-kpi'),('salesmgr','p-ticket'),('salesmgr','p-forecast'),('salesmgr','p-perfteam'),
 ('salesmgr','p-ladder'),('salesmgr','p-report'),
 ('accmgr','p-dash'),('accmgr','p-inv'),('accmgr','p-own'),('accmgr','p-team'),
 ('accmgr','p-kpi'),('accmgr','p-ticket'),('accmgr','p-forecast'),('accmgr','p-perfteam'),
 ('accmgr','p-ladder'),('accmgr','p-report');
