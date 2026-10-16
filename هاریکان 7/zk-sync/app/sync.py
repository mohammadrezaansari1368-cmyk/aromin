"""منطق تخلیه (دریافت) رکوردها از دستگاه — بدون حذف از دستگاه و بدون ثبت تکراری."""
import logging
import threading
import time

from . import db, zkdriver

log = logging.getLogger("azk.sync")

_device_locks = {}
_locks_guard = threading.Lock()


def _lock_for(device_id):
    with _locks_guard:
        return _device_locks.setdefault(device_id, threading.Lock())


def is_running(device_id):
    lk = _device_locks.get(device_id)
    return bool(lk and lk.locked())


def test_connection(ip, port, password, timeout):
    t0 = time.time()
    with zkdriver.open_device(ip, port, password, timeout) as dev:
        info = zkdriver.read_info(dev)
    info["latency_ms"] = int((time.time() - t0) * 1000)
    return info


def run_sync(device_id, trigger="manual", force=False):
    """یک بار تخلیه برای یک دستگاه. خروجی: دیکشنری خلاصه اجرا."""
    lock = _lock_for(device_id)
    if not lock.acquire(blocking=False):
        return {"status": "busy", "message": "تخلیه این دستگاه در حال اجراست"}
    try:
        return _run(device_id, trigger, force)
    finally:
        lock.release()


def _run(device_id, trigger, force):
    dev_row = db.row("SELECT * FROM devices WHERE id=?", (device_id,))
    if not dev_row:
        return {"status": "error", "message": "دستگاه پیدا نشد"}

    started = db.now_str()
    t0 = time.time()
    with db.tx() as c:
        run_id = c.execute(
            "INSERT INTO sync_runs(device_id, trigger, started_at) VALUES (?,?,?)",
            (device_id, trigger, started)).lastrowid

    result = {"run_id": run_id, "device_id": device_id, "fetched": 0,
              "inserted": 0, "duplicates": 0, "device_count": None}
    try:
        with zkdriver.open_device(dev_row["ip"], dev_row["port"], dev_row["comm_password"],
                                  dev_row["timeout_sec"],
                                  bool(dev_row["disable_during_read"])) as dev:
            info = zkdriver.read_info(dev)
            count = info.get("record_count")
            result["device_count"] = count

            unchanged = (not force and count is not None
                         and dev_row["last_record_count"] is not None
                         and count == dev_row["last_record_count"]
                         and dev_row["last_status"] in ("ok", "skipped"))
            if unchanged:
                result.update(status="skipped", message="رکورد جدیدی روی دستگاه نیست")
                punches, users = [], None
            else:
                punches = zkdriver.read_attendance(dev)
                try:
                    users = zkdriver.read_users(dev)
                except Exception as e:  # نبودن کاربران مانع تخلیه نشود
                    log.warning("read users failed on %s: %s", dev_row["ip"], e)
                    users = None

        if not unchanged:
            result["fetched"] = len(punches)
            inserted = _store(device_id, run_id, punches)
            result["inserted"] = inserted
            result["duplicates"] = len(punches) - inserted
            if users:
                _store_users(users)
            result.update(status="ok",
                          message=f"{inserted} رکورد جدید از {len(punches)} رکورد دستگاه")

        _finish(device_id, run_id, t0, result, info)
        return result

    except Exception as e:
        log.exception("sync failed for device %s", device_id)
        result.update(status="error", message=str(e) or e.__class__.__name__)
        _finish(device_id, run_id, t0, result, None)
        return result


def _store(device_id, run_id, punches):
    """درج با INSERT OR IGNORE روی کلید یکتای خام ← رکوردهای قبلی هرگز دوباره ثبت نمی‌شوند."""
    if not punches:
        return 0
    now = db.now_str()
    data = []
    for p in punches:
        ts = p.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        data.append((device_id, p.user_id, ts, p.punch, p.status, p.uid,
                     p.user_id, ts, p.punch, run_id, now))
    with db.tx() as c:
        cur = c.executemany(
            """INSERT OR IGNORE INTO attendance
               (device_id, raw_user_id, raw_ts, raw_punch, raw_status, raw_uid,
                user_id, ts, punch, sync_run_id, imported_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""", data)
        # rowcount فقط درج‌های واقعی را می‌شمارد (نه به‌روزرسانی‌های trigger شماره تغییر)
        return max(cur.rowcount, 0)


def _store_users(users):
    now = db.now_str()
    with db.tx() as c:
        for u in users:
            c.execute(
                """INSERT INTO people(user_id, name, updated_at) VALUES (?,?,?)
                   ON CONFLICT(user_id) DO UPDATE SET
                     name = CASE WHEN people.name_locked=1 OR excluded.name='' THEN people.name ELSE excluded.name END,
                     updated_at = excluded.updated_at""",
                (u.user_id, u.name, now))


def _finish(device_id, run_id, t0, result, info):
    now = db.now_str()
    ok = result["status"] in ("ok", "skipped")
    with db.tx() as c:
        c.execute(
            """UPDATE sync_runs SET finished_at=?, status=?, device_count=?, fetched=?,
               inserted=?, duplicates=?, duration_ms=?, message=? WHERE id=?""",
            (now, result["status"], result.get("device_count"), result["fetched"],
             result["inserted"], result["duplicates"], int((time.time() - t0) * 1000),
             result.get("message"), run_id))
        if ok:
            c.execute(
                """UPDATE devices SET last_sync_at=?, last_success_at=?, last_status=?, last_error=NULL,
                   last_record_count=COALESCE(?, last_record_count),
                   serial_number=COALESCE(NULLIF(?, ''), serial_number),
                   device_name=COALESCE(NULLIF(?, ''), device_name),
                   firmware=COALESCE(NULLIF(?, ''), firmware)
                   WHERE id=?""",
                (now, now, result["status"], result.get("device_count"),
                 (info or {}).get("serial_number", ""), (info or {}).get("device_name", ""),
                 (info or {}).get("firmware", ""), device_id))
        else:
            c.execute("UPDATE devices SET last_sync_at=?, last_status='error', last_error=? WHERE id=?",
                      (now, result.get("message"), device_id))
