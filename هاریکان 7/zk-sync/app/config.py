"""تنظیمات سرویس — از متغیرهای محیطی (فایل /etc/aromin-zk/aromin-zk.env) خوانده می‌شود."""
import os


def _env(name, default=None):
    v = os.environ.get(name)
    return v if v not in (None, "") else default


DB_PATH = _env("AZK_DB_PATH", "/var/lib/aromin-zk/attendance.db")
API_KEY = _env("AZK_API_KEY", "")            # خالی = بدون احراز هویت (فقط برای تست)
HOST = _env("AZK_HOST", "127.0.0.1")
PORT = int(_env("AZK_PORT", "8470"))
CORS_ORIGINS = [o.strip() for o in _env("AZK_CORS_ORIGINS", "*").split(",") if o.strip()]
SCHEDULER_TICK_SEC = int(_env("AZK_SCHEDULER_TICK", "20"))
MAX_PARALLEL_SYNCS = int(_env("AZK_MAX_PARALLEL", "4"))
STANDARD_WORK_MIN = int(_env("AZK_STANDARD_WORK_MIN", "450"))   # ۷ ساعت و ۳۰ دقیقه
DRIVER = _env("AZK_DRIVER", "pyzk")          # pyzk | fake (برای تست بدون دستگاه)
