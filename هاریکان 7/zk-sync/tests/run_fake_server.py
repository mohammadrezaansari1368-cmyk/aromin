"""اجرای سرویس با دستگاه شبیه‌سازی‌شده (برای تست سامانه اصلی):
   AZK_DRIVER=fake python3 tests/run_fake_server.py 8471
دستگاه 192.168.1.201 با ترددهای چند روز گذشته کاربران 1001 و 1002 ساخته می‌شود.
POST /api/_fake/punch  {"ip": "...", "user_id": "1001", "ts": "YYYY-MM-DD HH:MM:SS"}  ← ثبت روی دستگاه
"""
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("AZK_DRIVER", "fake")

import uvicorn  # noqa: E402
from fastapi import Body  # noqa: E402
from app import fake_driver, main  # noqa: E402

conn = fake_driver.FakeConn.for_address("192.168.1.201", 4370, 0)
conn.records_list.clear()
today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
for d in range(3, 0, -1):
    day = today - timedelta(days=d)
    for uid, (h1, m1, h2, m2) in {"1001": (8, 5, 15, 40), "1002": (8, 30, 16, 10)}.items():
        conn.add(uid, day.replace(hour=h1, minute=m1), 0)
        conn.add(uid, day.replace(hour=h1, minute=m1, second=20), 0)   # انگشت دوباره
        conn.add(uid, day.replace(hour=h2, minute=m2), 1)
conn.users_list = []


@main.app.post("/api/_fake/punch")
def fake_punch(ip: str = Body(...), user_id: str = Body(...), ts: str = Body(...)):
    fake_driver.FakeConn.for_address(ip, 4370, 0).add(user_id, datetime.strptime(ts, "%Y-%m-%d %H:%M:%S"), 0)
    return {"ok": True}


# مسیر بالا باید قبل از mount صفحه وب بررسی شود
main.app.router.routes.insert(0, main.app.router.routes.pop())

if __name__ == "__main__":
    uvicorn.run(main.app, host="127.0.0.1", port=int(sys.argv[1] if len(sys.argv) > 1 else 8471), log_level="warning")
