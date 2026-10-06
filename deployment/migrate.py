# =====================================================================
#  آرومین — موتورِ مهاجرتِ خودکارِ دیتابیس (MariaDB) — نسخهٔ پایتون
#  معادلِ migrate.js: هر فایلِ .sql داخلِ migrations/ که هنوز اجرا نشده،
#  به‌ترتیبِ نام اجرا و در جدولِ schema_migrations ثبت می‌شود.
#  اجرای دوباره بی‌خطر است (idempotent).
#
#  دو حالت:
#    ۱) خودکار هنگام بالا آمدنِ سرور (server.py صدایش می‌زند)
#    ۲) مستقل:  python migrate.py
# =====================================================================
import os
import pymysql
from pymysql.constants import CLIENT

MIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations")


def run_migrations(db):
    """db: dict با کلیدهای host, port, user, password, database. تعداد مهاجرت‌های اعمال‌شده را برمی‌گرداند."""
    root = pymysql.connect(
        host=db["host"], port=int(db["port"]), user=db["user"], password=db["password"],
        charset="utf8mb4", client_flag=CLIENT.MULTI_STATEMENTS, autocommit=True,
    )
    try:
        with root.cursor() as cur:
            # ۱) دیتابیس را بساز (اگر مجوز نبود ولی دیتابیس هست، ادامه بده)
            try:
                cur.execute(
                    "CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_persian_ci"
                    % db["database"]
                )
            except Exception:
                pass
            cur.execute("USE `%s`" % db["database"])
            # ۲) جدولِ ردیابِ مهاجرت‌ها
            cur.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "name VARCHAR(191) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB"
            )
            cur.execute("SELECT name FROM schema_migrations")
            applied = {r[0] for r in cur.fetchall()}

        # ۳) فایل‌های مهاجرت به‌ترتیبِ نام
        try:
            files = sorted(f for f in os.listdir(MIG_DIR) if f.lower().endswith(".sql"))
        except FileNotFoundError:
            files = []

        ran = 0
        for f in files:
            if f in applied:
                continue
            with open(os.path.join(MIG_DIR, f), "r", encoding="utf-8") as fh:
                sql = fh.read().strip()
            with root.cursor() as cur:
                if sql:
                    cur.execute(sql)               # MULTI_STATEMENTS فعال است
                    while cur.nextset():           # مصرفِ همهٔ نتیجه‌ها
                        pass
                cur.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (f,))
            ran += 1
            print("  ✓ مهاجرت اعمال شد: " + f)
        return ran
    finally:
        root.close()


if __name__ == "__main__":
    db = {
        "host": os.environ.get("DB_HOST", "127.0.0.1"),
        "port": os.environ.get("DB_PORT", 3306),
        "user": os.environ.get("DB_USER", "aromin"),
        "password": os.environ.get("DB_PASS", "change-me"),
        "database": os.environ.get("DB_NAME", "aromin_sales"),
    }
    try:
        n = run_migrations(db)
        print(("دیتابیس به‌روز شد — %d مهاجرت اعمال شد." % n) if n else "دیتابیس از قبل به‌روز بود.")
    except Exception as e:
        print("خطا در مهاجرت:", str(e))
        raise SystemExit(1)
