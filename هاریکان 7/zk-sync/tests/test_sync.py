import os
import sys
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["AZK_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "t.db")
os.environ["AZK_DRIVER"] = "fake"
os.environ["AZK_API_KEY"] = "secret"
os.environ["AZK_SCHEDULER_TICK"] = "3600"

from fastapi.testclient import TestClient  # noqa: E402
from app import fake_driver, main, zkdriver  # noqa: E402
from app.scheduler import scheduler  # noqa: E402

H = {"X-API-Key": "secret", "X-User": "tester"}


def run():
    with TestClient(main.app) as c:
        assert c.get("/api/devices").status_code == 401

        dev = fake_driver.demo_seed("192.168.1.201", days=3)
        n0 = len(dev.records_list)

        # تست اتصال قبل از ذخیره
        r = c.post("/api/devices/test", json={"ip": "192.168.1.201"}, headers=H).json()
        assert r["ok"] and r["record_count"] == n0, r
        r = c.post("/api/devices/test", json={"ip": "10.255.0.1"}, headers=H).json()
        assert not r["ok"]

        d = c.post("/api/devices", json={"name": "ورودی دفتر", "ip": "192.168.1.201", "interval_min": 5},
                   headers=H).json()
        did = d["id"]
        assert d["port"] == 4370
        assert c.post("/api/devices", json={"name": "x", "ip": "192.168.1.201"}, headers=H).status_code == 409

        # تخلیه اول
        s1 = c.post(f"/api/devices/{did}/sync", headers=H).json()
        assert s1["status"] == "ok" and s1["inserted"] == n0, s1
        assert not dev.cleared and len(dev.records_list) == n0, "رکوردهای دستگاه نباید حذف شوند"

        # تخلیه دوم: هیچ رکورد تکراری
        s2 = c.post(f"/api/devices/{did}/sync", headers=H).json()
        assert s2["inserted"] == 0 and s2["duplicates"] == n0, s2

        # تخلیه خودکار بدون تغییر ← skip
        from app import sync
        s3 = sync.run_sync(did, trigger="auto", force=False)
        assert s3["status"] == "skipped", s3

        # رکورد جدید روی دستگاه
        dev.add("1", datetime.now().replace(microsecond=0), 0)
        s4 = sync.run_sync(did, trigger="auto")
        assert s4["status"] == "ok" and s4["inserted"] == 1, s4

        lst = c.get("/api/attendance", params={"page_size": 1000}, headers=H).json()
        assert lst["total"] == n0 + 1
        assert lst["items"][0]["person_name"] == "Noora"

        # ویرایش + تخلیه مجدد ← رکورد اصلی دوباره وارد نشود
        aid = lst["items"][-1]["id"]
        e = c.put(f"/api/attendance/{aid}", json={"ts": "2026-01-01 09:00", "note": "اصلاح"}, headers=H).json()
        assert e["ts"] == "2026-01-01 09:00:00" and e["is_edited"] == 1
        # حذف نرم
        aid2 = lst["items"][-2]["id"]
        assert c.delete(f"/api/attendance/{aid2}", headers=H).json()["ok"]
        s5 = c.post(f"/api/devices/{did}/sync", headers=H).json()
        assert s5["inserted"] == 0, s5
        assert c.get("/api/attendance", headers=H).json()["total"] == n0
        assert c.get("/api/attendance", params={"status": "deleted"}, headers=H).json()["total"] == 1
        # بازگردانی و برگشت به مقدار اصلی
        c.post(f"/api/attendance/{aid2}/restore", headers=H)
        rv = c.post(f"/api/attendance/{aid}/revert", headers=H).json()
        assert rv["ts"] == rv["raw_ts"] and rv["is_edited"] == 0
        hist = c.get(f"/api/attendance/{aid}/history", headers=H).json()
        assert [h["action"] for h in hist] == ["revert", "edit"]

        # خوراک تغییرات: همه رکوردها یک rev یکتا دارند و ویرایش rev جدید می‌گیرد
        ch = c.get("/api/changes", params={"after_rev": 0, "limit": 5000}, headers=H).json()
        assert len(ch["items"]) == n0 + 1 and not ch["more"]
        revs = [i["rev"] for i in ch["items"]]
        assert revs == sorted(revs) and len(set(revs)) == len(revs)
        last = ch["last_rev"]
        assert c.get("/api/changes", params={"after_rev": last}, headers=H).json()["items"] == []
        c.put(f"/api/attendance/{aid}", json={"note": "یادداشت"}, headers=H)
        ch2 = c.get("/api/changes", params={"after_rev": last}, headers=H).json()
        assert [i["id"] for i in ch2["items"]] == [aid] and ch2["last_rev"] > last
        page = c.get("/api/changes", params={"after_rev": 0, "limit": 2}, headers=H).json()
        assert len(page["items"]) == 2 and page["more"]

        # ثبت دستی
        m = c.post("/api/attendance", json={"user_id": "2", "ts": "2026-10-09T09:05", "punch": 0,
                                            "note": "فراموشی"}, headers=H).json()
        assert m["source"] == "manual"

        # نام دستی قفل می‌شود و با تخلیه بازنویسی نمی‌شود
        c.put("/api/people/1", json={"name": "نورا مقدس"}, headers=H)
        c.post(f"/api/devices/{did}/sync", headers=H)
        assert any(p["name"] == "نورا مقدس" for p in c.get("/api/people", headers=H).json())

        # گزارش‌ها
        today = datetime.now().date()
        fr, to = str(today - timedelta(days=10)), str(today)
        daily = c.get("/api/reports/daily", params={"date_from": fr, "date_to": to}, headers=H).json()
        assert daily and all("worked_min" in x for x in daily)
        full = [x for x in daily if not x["incomplete"]]
        assert full[0]["worked_min"] > 400
        summ = c.get("/api/reports/summary", params={"date_from": fr, "date_to": to}, headers=H).json()
        assert len(summ) == 3
        csv1 = c.get("/api/reports/daily.csv", params={"date_from": fr, "date_to": to, "key": "secret"})
        assert csv1.status_code == 200 and csv1.text.startswith("﻿")
        assert c.get("/api/attendance/export.csv", params={"key": "secret"}).status_code == 200

        # ویرایش دستگاه + زمان‌بند
        u = c.put(f"/api/devices/{did}", json={"name": "ورودی", "ip": "192.168.1.201", "interval_min": 109},
                  headers=H).json()
        assert u["interval_min"] == 109 and u["next_run_at"]
        runs = c.get("/api/sync-runs", headers=H).json()
        assert {r["status"] for r in runs} >= {"ok", "skipped"}

        # خطای اتصال ثبت می‌شود
        d2 = c.post("/api/devices", json={"name": "خراب", "ip": "10.255.0.9"}, headers=H).json()
        e2 = c.post(f"/api/devices/{d2['id']}/sync", headers=H).json()
        assert e2["status"] == "error"
        assert c.get("/api/stats", headers=H).json()["devices_error"] == 1

        # بایگانی و ثبت مجدد همان دستگاه ← همان شناسه، بدون تکرار
        c.delete(f"/api/devices/{did}", headers=H)
        again = c.post("/api/devices", json={"name": "دوباره", "ip": "192.168.1.201"}, headers=H).json()
        assert again["id"] == did
        s6 = c.post(f"/api/devices/{did}/sync", headers=H).json()
        assert s6["inserted"] == 0

        # زمان‌بند: دستگاه موعددار اجرا می‌شود
        scheduler._last_attempt.clear()
        scheduler.tick()

        # پراکسی فقط‌خواندنی جلوی پاک کردن را می‌گیرد
        with zkdriver.open_device("192.168.1.201") as dv:
            try:
                dv.clear_attendance()
                raise AssertionError("should be forbidden")
            except zkdriver.ForbiddenDeviceOperation:
                pass
        assert not dev.cleared
    print("ALL TESTS PASSED")


if __name__ == "__main__":
    run()
