"""سرویس REST «آرومین — تخلیه دستگاه حضور و غیاب» (FastAPI)."""
import csv
import io
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from . import config, db, sync
from .scheduler import scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

PUNCH_LABELS = {0: "ورود", 1: "خروج", 2: "خروج موقت", 3: "بازگشت", 4: "ورود اضافه‌کار", 5: "خروج اضافه‌کار"}


@asynccontextmanager
async def lifespan(app):
    db.init_db()
    scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(title="Aromin ZK Sync", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])


def auth(x_api_key: Optional[str] = Header(None), key: Optional[str] = Query(None)):
    if config.API_KEY and (x_api_key or key) != config.API_KEY:
        raise HTTPException(401, "کلید API نامعتبر است")


def actor(x_user: Optional[str] = Header(None)):
    return (x_user or "dashboard")[:64]


def norm_ts(v: str) -> str:
    v = (v or "").strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    raise ValueError("فرمت زمان باید YYYY-MM-DD HH:MM[:SS] باشد")


# ------------------------------------------------------------------ مدل‌ها
class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ip: str = Field(min_length=3, max_length=255)
    port: int = Field(4370, ge=1, le=65535)
    comm_password: int = Field(0, ge=0, le=999999)
    timeout_sec: int = Field(10, ge=2, le=120)
    location: str = ""
    auto_sync: bool = True
    interval_min: int = Field(5, ge=1, le=1440)
    disable_during_read: bool = False
    active: bool = True


class DeviceTest(BaseModel):
    ip: str
    port: int = 4370
    comm_password: int = 0
    timeout_sec: int = 10


class AttendanceIn(BaseModel):
    user_id: str = Field(min_length=1, max_length=32)
    ts: str
    punch: int = Field(0, ge=0, le=255)
    note: str = ""
    device_id: Optional[int] = None

    @field_validator("ts")
    @classmethod
    def _ts(cls, v):
        return norm_ts(v)


class AttendanceEdit(BaseModel):
    user_id: Optional[str] = Field(None, min_length=1, max_length=32)
    ts: Optional[str] = None
    punch: Optional[int] = Field(None, ge=0, le=255)
    note: Optional[str] = None

    @field_validator("ts")
    @classmethod
    def _ts(cls, v):
        return norm_ts(v) if v is not None else v


class PersonIn(BaseModel):
    name: Optional[str] = None
    department: Optional[str] = None
    active: Optional[bool] = None


# ------------------------------------------------------------------ عمومی
@app.get("/api/health")
def health():
    return {"ok": True, "time": db.now_str(), "driver": config.DRIVER}


@app.get("/api/stats", dependencies=[Depends(auth)])
def stats():
    today = datetime.now().strftime("%Y-%m-%d")
    return {
        "total_records": db.row("SELECT COUNT(*) n FROM attendance WHERE is_deleted=0")["n"],
        "today_records": db.row("SELECT COUNT(*) n FROM attendance WHERE is_deleted=0 AND ts LIKE ?", (today + "%",))["n"],
        "today_people": db.row("SELECT COUNT(DISTINCT user_id) n FROM attendance WHERE is_deleted=0 AND ts LIKE ?", (today + "%",))["n"],
        "edited": db.row("SELECT COUNT(*) n FROM attendance WHERE is_edited=1 AND is_deleted=0")["n"],
        "devices": db.row("SELECT COUNT(*) n FROM devices WHERE archived=0")["n"],
        "devices_error": db.row("SELECT COUNT(*) n FROM devices WHERE archived=0 AND active=1 AND last_status='error'")["n"],
        "standard_work_min": config.STANDARD_WORK_MIN,
        "punch_labels": PUNCH_LABELS,
    }


# ------------------------------------------------------------------ دستگاه‌ها
def _device_out(d):
    d = dict(d)
    nr = scheduler.next_run(d)
    d["next_run_at"] = nr.strftime("%Y-%m-%d %H:%M:%S") if nr else None
    d["running"] = sync.is_running(d["id"])
    d["record_total"] = db.row("SELECT COUNT(*) n FROM attendance WHERE device_id=?", (d["id"],))["n"]
    for k in ("auto_sync", "disable_during_read", "active", "archived"):
        d[k] = bool(d[k])
    return d


@app.get("/api/devices", dependencies=[Depends(auth)])
def list_devices():
    return [_device_out(d) for d in db.rows("SELECT * FROM devices WHERE archived=0 ORDER BY id")]


@app.post("/api/devices", dependencies=[Depends(auth)])
def create_device(body: DeviceIn):
    now = db.now_str()
    vals = body.model_dump()
    with db.tx() as c:
        # اگر همین دستگاه قبلاً بایگانی شده، همان را برگردان تا کلید ضدتکرار حفظ شود
        old = c.execute("SELECT id FROM devices WHERE ip=? AND port=? AND archived=1",
                        (body.ip, body.port)).fetchone()
        if old:
            c.execute("""UPDATE devices SET name=?, comm_password=?, timeout_sec=?, location=?, auto_sync=?,
                         interval_min=?, disable_during_read=?, active=?, archived=0, updated_at=? WHERE id=?""",
                      (vals["name"], vals["comm_password"], vals["timeout_sec"], vals["location"],
                       int(vals["auto_sync"]), vals["interval_min"], int(vals["disable_during_read"]),
                       int(vals["active"]), now, old["id"]))
            did = old["id"]
        else:
            if c.execute("SELECT 1 FROM devices WHERE ip=? AND port=? AND archived=0",
                         (body.ip, body.port)).fetchone():
                raise HTTPException(409, "دستگاهی با همین IP و پورت قبلاً ثبت شده است")
            did = c.execute(
                """INSERT INTO devices(name, ip, port, comm_password, timeout_sec, location, auto_sync,
                   interval_min, disable_during_read, active, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (vals["name"], vals["ip"], vals["port"], vals["comm_password"], vals["timeout_sec"],
                 vals["location"], int(vals["auto_sync"]), vals["interval_min"],
                 int(vals["disable_during_read"]), int(vals["active"]), now, now)).lastrowid
    return _device_out(db.row("SELECT * FROM devices WHERE id=?", (did,)))


@app.put("/api/devices/{device_id}", dependencies=[Depends(auth)])
def update_device(device_id: int, body: DeviceIn):
    if not db.row("SELECT id FROM devices WHERE id=? AND archived=0", (device_id,)):
        raise HTTPException(404, "دستگاه پیدا نشد")
    v = body.model_dump()
    with db.tx() as c:
        if c.execute("SELECT 1 FROM devices WHERE ip=? AND port=? AND id<>? AND archived=0",
                     (body.ip, body.port, device_id)).fetchone():
            raise HTTPException(409, "دستگاه دیگری با همین IP و پورت وجود دارد")
        c.execute("""UPDATE devices SET name=?, ip=?, port=?, comm_password=?, timeout_sec=?, location=?,
                     auto_sync=?, interval_min=?, disable_during_read=?, active=?, updated_at=? WHERE id=?""",
                  (v["name"], v["ip"], v["port"], v["comm_password"], v["timeout_sec"], v["location"],
                   int(v["auto_sync"]), v["interval_min"], int(v["disable_during_read"]),
                   int(v["active"]), db.now_str(), device_id))
    scheduler._last_attempt.pop(device_id, None)   # بازه جدید از همین حالا حساب شود
    return _device_out(db.row("SELECT * FROM devices WHERE id=?", (device_id,)))


@app.delete("/api/devices/{device_id}", dependencies=[Depends(auth)])
def delete_device(device_id: int):
    """دستگاه از فهرست حذف (بایگانی) می‌شود؛ رکوردهای تخلیه‌شده و سابقه باقی می‌مانند."""
    with db.tx() as c:
        c.execute("UPDATE devices SET archived=1, active=0, updated_at=? WHERE id=?", (db.now_str(), device_id))
    return {"ok": True}


@app.post("/api/devices/test", dependencies=[Depends(auth)])
def test_new_device(body: DeviceTest):
    try:
        return {"ok": True, **sync.test_connection(body.ip, body.port, body.comm_password, body.timeout_sec)}
    except Exception as e:
        return {"ok": False, "error": str(e) or e.__class__.__name__}


@app.post("/api/devices/{device_id}/test", dependencies=[Depends(auth)])
def test_device(device_id: int):
    d = db.row("SELECT * FROM devices WHERE id=?", (device_id,))
    if not d:
        raise HTTPException(404, "دستگاه پیدا نشد")
    return test_new_device(DeviceTest(ip=d["ip"], port=d["port"], comm_password=d["comm_password"],
                                      timeout_sec=d["timeout_sec"]))


@app.post("/api/devices/{device_id}/sync", dependencies=[Depends(auth)])
def sync_device(device_id: int, force: bool = True):
    return sync.run_sync(device_id, trigger="manual", force=force)


@app.post("/api/sync-all", dependencies=[Depends(auth)])
def sync_all():
    out = []
    for d in db.rows("SELECT id FROM devices WHERE active=1 AND archived=0"):
        out.append(sync.run_sync(d["id"], trigger="manual", force=True))
    return out


@app.get("/api/sync-runs", dependencies=[Depends(auth)])
def sync_runs(device_id: Optional[int] = None, limit: int = Query(50, le=500)):
    sql = """SELECT r.*, d.name device_name FROM sync_runs r LEFT JOIN devices d ON d.id=r.device_id"""
    p = []
    if device_id:
        sql += " WHERE r.device_id=?"
        p.append(device_id)
    sql += " ORDER BY r.id DESC LIMIT ?"
    p.append(limit)
    return db.rows(sql, p)


# ------------------------------------------------------------------ رکوردها
def _att_filters(date_from, date_to, user_id, device_id, source, status, q):
    w, p = [], []
    if date_from:
        w.append("a.ts >= ?"); p.append(date_from[:10] + " 00:00:00")
    if date_to:
        w.append("a.ts <= ?"); p.append(date_to[:10] + " 23:59:59")
    if user_id:
        w.append("a.user_id = ?"); p.append(user_id)
    if device_id:
        w.append("a.device_id = ?"); p.append(device_id)
    if source:
        w.append("a.source = ?"); p.append(source)
    if status == "deleted":
        w.append("a.is_deleted = 1")
    elif status == "edited":
        w.append("a.is_edited = 1 AND a.is_deleted = 0")
    elif status != "all":
        w.append("a.is_deleted = 0")
    if q:
        w.append("(a.user_id LIKE ? OR pe.name LIKE ? OR a.note LIKE ?)"); p += [f"%{q}%"] * 3
    return (" WHERE " + " AND ".join(w)) if w else "", p


ATT_SELECT = """SELECT a.*, pe.name person_name, pe.department, d.name device_name
                FROM attendance a
                LEFT JOIN people pe ON pe.user_id = a.user_id
                LEFT JOIN devices d ON d.id = a.device_id"""


@app.get("/api/attendance", dependencies=[Depends(auth)])
def list_attendance(date_from: Optional[str] = None, date_to: Optional[str] = None,
                    user_id: Optional[str] = None, device_id: Optional[int] = None,
                    source: Optional[str] = None, status: str = "active", q: Optional[str] = None,
                    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=1000),
                    order: str = "desc"):
    where, p = _att_filters(date_from, date_to, user_id, device_id, source, status, q)
    total = db.row(f"SELECT COUNT(*) n FROM attendance a LEFT JOIN people pe ON pe.user_id=a.user_id {where}", p)["n"]
    direction = "ASC" if order == "asc" else "DESC"
    items = db.rows(f"{ATT_SELECT} {where} ORDER BY a.ts {direction}, a.id {direction} LIMIT ? OFFSET ?",
                    p + [page_size, (page - 1) * page_size])
    for it in items:
        it["punch_label"] = PUNCH_LABELS.get(it["punch"], str(it["punch"]))
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@app.get("/api/attendance/export.csv", dependencies=[Depends(auth)])
def export_attendance(date_from: Optional[str] = None, date_to: Optional[str] = None,
                      user_id: Optional[str] = None, device_id: Optional[int] = None,
                      source: Optional[str] = None, status: str = "active", q: Optional[str] = None):
    where, p = _att_filters(date_from, date_to, user_id, device_id, source, status, q)
    data = db.rows(f"{ATT_SELECT} {where} ORDER BY a.ts", p)
    header = ["شناسه", "کد پرسنلی", "نام", "تاریخ و ساعت", "نوع", "دستگاه", "منبع", "ویرایش‌شده",
              "حذف‌شده", "زمان اصلی دستگاه", "توضیح"]
    rows_ = [[r["id"], r["user_id"], r["person_name"] or "", r["ts"], PUNCH_LABELS.get(r["punch"], r["punch"]),
              r["device_name"] or "", "دستگاه" if r["source"] == "device" else "دستی",
              "بله" if r["is_edited"] else "", "بله" if r["is_deleted"] else "", r["raw_ts"] or "",
              r["note"] or ""] for r in data]
    return _csv("attendance.csv", header, rows_)


@app.post("/api/attendance", dependencies=[Depends(auth)])
def add_manual(body: AttendanceIn, who: str = Depends(actor)):
    now = db.now_str()
    with db.tx() as c:
        aid = c.execute(
            """INSERT INTO attendance(device_id, user_id, ts, punch, note, source, imported_at, edited_at, edited_by)
               VALUES (?,?,?,?,?,'manual',?,?,?)""",
            (body.device_id, body.user_id, body.ts, body.punch, body.note, now, now, who)).lastrowid
        c.execute("INSERT OR IGNORE INTO people(user_id, updated_at) VALUES (?,?)", (body.user_id, now))
        db.audit(c, aid, "manual_add", None, body.model_dump(), who)
    return db.row(f"{ATT_SELECT} WHERE a.id=?", (aid,))


def _get_att(c, aid):
    r = c.execute("SELECT * FROM attendance WHERE id=?", (aid,)).fetchone()
    if not r:
        raise HTTPException(404, "رکورد پیدا نشد")
    return dict(r)


@app.put("/api/attendance/{aid}", dependencies=[Depends(auth)])
def edit_attendance(aid: int, body: AttendanceEdit, who: str = Depends(actor)):
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(400, "تغییری ارسال نشده")
    with db.tx() as c:
        before = _get_att(c, aid)
        sets = ", ".join(f"{k}=?" for k in changes)
        c.execute(f"UPDATE attendance SET {sets}, is_edited=1, edited_at=?, edited_by=? WHERE id=?",
                  list(changes.values()) + [db.now_str(), who, aid])
        db.audit(c, aid, "edit", {k: before[k] for k in changes}, changes, who)
    return db.row(f"{ATT_SELECT} WHERE a.id=?", (aid,))


@app.delete("/api/attendance/{aid}", dependencies=[Depends(auth)])
def delete_attendance(aid: int, who: str = Depends(actor)):
    """حذف نرم: رکورد پنهان می‌شود اما کلید خامش می‌ماند تا در تخلیه بعدی برنگردد."""
    with db.tx() as c:
        _get_att(c, aid)
        c.execute("UPDATE attendance SET is_deleted=1, edited_at=?, edited_by=? WHERE id=?", (db.now_str(), who, aid))
        db.audit(c, aid, "delete", None, None, who)
    return {"ok": True}


@app.post("/api/attendance/{aid}/restore", dependencies=[Depends(auth)])
def restore_attendance(aid: int, who: str = Depends(actor)):
    with db.tx() as c:
        _get_att(c, aid)
        c.execute("UPDATE attendance SET is_deleted=0, edited_at=?, edited_by=? WHERE id=?", (db.now_str(), who, aid))
        db.audit(c, aid, "restore", None, None, who)
    return db.row(f"{ATT_SELECT} WHERE a.id=?", (aid,))


@app.post("/api/attendance/{aid}/revert", dependencies=[Depends(auth)])
def revert_attendance(aid: int, who: str = Depends(actor)):
    """بازگرداندن به مقدار اصلی ثبت‌شده در دستگاه."""
    with db.tx() as c:
        b = _get_att(c, aid)
        if b["source"] != "device":
            raise HTTPException(400, "رکورد دستی مقدار اصلی دستگاه ندارد")
        c.execute("""UPDATE attendance SET user_id=raw_user_id, ts=raw_ts, punch=raw_punch, is_edited=0,
                     edited_at=?, edited_by=? WHERE id=?""", (db.now_str(), who, aid))
        db.audit(c, aid, "revert", {"user_id": b["user_id"], "ts": b["ts"], "punch": b["punch"]}, None, who)
    return db.row(f"{ATT_SELECT} WHERE a.id=?", (aid,))


@app.get("/api/attendance/{aid}/history", dependencies=[Depends(auth)])
def attendance_history(aid: int):
    return db.rows("SELECT * FROM audit_log WHERE attendance_id=? ORDER BY id DESC", (aid,))


@app.get("/api/changes", dependencies=[Depends(auth)])
def changes(after_rev: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=5000)):
    """خوراک تغییرات برای سامانه اصلی حضور و غیاب: همه رکوردهای درج/ویرایش/حذف‌شده بعد از after_rev."""
    items = db.rows("""SELECT a.id, a.rev, a.device_id, a.user_id, a.ts, a.punch, a.source, a.is_deleted,
                              a.is_edited, d.name device_name
                       FROM attendance a LEFT JOIN devices d ON d.id = a.device_id
                       WHERE a.rev > ? ORDER BY a.rev LIMIT ?""", (after_rev, limit))
    last = items[-1]["rev"] if items else after_rev
    max_rev = db.row("SELECT COALESCE(MAX(rev), 0) n FROM attendance")["n"]
    return {"items": items, "last_rev": last, "max_rev": max_rev, "more": len(items) == limit}


# ------------------------------------------------------------------ پرسنل
@app.get("/api/people", dependencies=[Depends(auth)])
def list_people():
    # کاربران ثبت‌شده روی دستگاه + هر کدی که فقط در ترددها آمده است
    return db.rows("""SELECT u.user_id, COALESCE(pe.name, '') name, COALESCE(pe.department, '') department,
                             COALESCE(pe.active, 1) active, COALESCE(pe.name_locked, 0) name_locked, pe.updated_at,
                             (SELECT MAX(ts) FROM attendance a WHERE a.user_id=u.user_id AND a.is_deleted=0) last_ts
                      FROM (SELECT user_id FROM people UNION SELECT DISTINCT user_id FROM attendance WHERE is_deleted=0) u
                      LEFT JOIN people pe ON pe.user_id = u.user_id
                      ORDER BY CAST(u.user_id AS INTEGER), u.user_id""")


@app.put("/api/people/{user_id}", dependencies=[Depends(auth)])
def update_person(user_id: str, body: PersonIn):
    v = body.model_dump()
    with db.tx() as c:
        c.execute("INSERT OR IGNORE INTO people(user_id, updated_at) VALUES (?,?)", (user_id, db.now_str()))
        if v["name"] is not None:
            c.execute("UPDATE people SET name=?, name_locked=1 WHERE user_id=?", (v["name"], user_id))
        if v["department"] is not None:
            c.execute("UPDATE people SET department=? WHERE user_id=?", (v["department"], user_id))
        if v["active"] is not None:
            c.execute("UPDATE people SET active=? WHERE user_id=?", (int(v["active"]), user_id))
    return db.row("SELECT * FROM people WHERE user_id=?", (user_id,))


# ------------------------------------------------------------------ گزارش‌ها
def _daily(date_from, date_to, user_id=None, device_id=None):
    where, p = _att_filters(date_from, date_to, user_id, device_id, None, "active", None)
    data = db.rows(f"SELECT a.user_id, a.ts, a.punch, pe.name person_name FROM attendance a "
                   f"LEFT JOIN people pe ON pe.user_id=a.user_id {where} ORDER BY a.user_id, a.ts", p)
    groups = {}
    for r in data:
        groups.setdefault((r["user_id"], r["ts"][:10]), {"name": r["person_name"], "items": []})["items"].append(r)
    out = []
    std = config.STANDARD_WORK_MIN
    for (uid, day), g in sorted(groups.items(), key=lambda x: (x[0][1], x[0][0])):
        times = [datetime.strptime(i["ts"], "%Y-%m-%d %H:%M:%S") for i in g["items"]]
        # حذف ثبت‌های تکراری با فاصله کمتر از ۱ دقیقه (انگشت دوباره زدن)
        clean = []
        for t in times:
            if not clean or (t - clean[-1]).total_seconds() >= 60:
                clean.append(t)
        worked = 0
        for i in range(0, len(clean) - 1, 2):
            worked += int((clean[i + 1] - clean[i]).total_seconds() // 60)
        out.append({
            "user_id": uid, "name": g["name"] or "", "date": day,
            "first_in": clean[0].strftime("%H:%M"),
            "last_out": clean[-1].strftime("%H:%M") if len(clean) > 1 else None,
            "punches": len(g["items"]),
            "times": [t.strftime("%H:%M") for t in clean],
            "worked_min": worked,
            "standard_min": std,
            "diff_min": worked - std,
            "incomplete": len(clean) % 2 == 1,
        })
    return out


@app.get("/api/reports/daily", dependencies=[Depends(auth)])
def report_daily(date_from: str, date_to: str, user_id: Optional[str] = None, device_id: Optional[int] = None):
    return _daily(date_from, date_to, user_id, device_id)


@app.get("/api/reports/summary", dependencies=[Depends(auth)])
def report_summary(date_from: str, date_to: str, device_id: Optional[int] = None):
    agg = {}
    for d in _daily(date_from, date_to, None, device_id):
        a = agg.setdefault(d["user_id"], {"user_id": d["user_id"], "name": d["name"], "days": 0, "worked_min": 0,
                                          "shortfall_min": 0, "overtime_min": 0, "incomplete_days": 0})
        a["days"] += 1
        a["worked_min"] += d["worked_min"]
        if d["incomplete"]:
            a["incomplete_days"] += 1
        elif d["diff_min"] < 0:
            a["shortfall_min"] += -d["diff_min"]
        else:
            a["overtime_min"] += d["diff_min"]
    res = sorted(agg.values(), key=lambda x: x["user_id"])
    for a in res:
        a["avg_min"] = a["worked_min"] // a["days"] if a["days"] else 0
    return res


def _hm(m):
    sign = "-" if m < 0 else ""
    m = abs(int(m))
    return f"{sign}{m // 60}:{m % 60:02d}"


@app.get("/api/reports/daily.csv", dependencies=[Depends(auth)])
def report_daily_csv(date_from: str, date_to: str, user_id: Optional[str] = None, device_id: Optional[int] = None):
    data = _daily(date_from, date_to, user_id, device_id)
    header = ["تاریخ", "کد پرسنلی", "نام", "اولین ورود", "آخرین خروج", "تعداد ثبت", "همه ساعت‌ها",
              "کارکرد", "موظفی", "اختلاف", "وضعیت"]
    rows_ = [[d["date"], d["user_id"], d["name"], d["first_in"], d["last_out"] or "", d["punches"],
              " ".join(d["times"]), _hm(d["worked_min"]), _hm(d["standard_min"]),
              "" if d["incomplete"] else _hm(d["diff_min"]), "ناقص" if d["incomplete"] else "کامل"]
             for d in data]
    return _csv("daily-report.csv", header, rows_)


@app.get("/api/reports/summary.csv", dependencies=[Depends(auth)])
def report_summary_csv(date_from: str, date_to: str, device_id: Optional[int] = None):
    data = report_summary(date_from, date_to, device_id)
    header = ["کد پرسنلی", "نام", "روزهای حضور", "کارکرد کل", "میانگین روزانه", "کسرکار", "اضافه‌کار", "روزهای ناقص"]
    rows_ = [[a["user_id"], a["name"], a["days"], _hm(a["worked_min"]), _hm(a["avg_min"]),
              _hm(a["shortfall_min"]), _hm(a["overtime_min"]), a["incomplete_days"]] for a in data]
    return _csv("summary-report.csv", header, rows_)


def _csv(name, header, rows_):
    buf = io.StringIO()
    buf.write("﻿")  # BOM تا اکسل فارسی را درست نشان دهد
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows_)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ------------------------------------------------------------------ صفحه وب (اختیاری)
import os as _os  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

_web = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "web")
if _os.path.isdir(_web):
    app.mount("/", StaticFiles(directory=_web, html=True), name="web")
