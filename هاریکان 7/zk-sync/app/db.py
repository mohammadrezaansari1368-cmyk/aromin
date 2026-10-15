"""لایه پایگاه داده (SQLite با حالت WAL).

نکته کلیدی ضد-تکرار:
  هر رکورد دستگاه با کلید یکتای (device_id, raw_user_id, raw_ts, raw_punch) ذخیره می‌شود.
  فیلدهای raw_* هرگز ویرایش نمی‌شوند؛ ویرایش کاربر روی ستون‌های user_id / ts / punch انجام می‌شود.
  بنابراین اگر رکوردی ویرایش یا حذف (نرم) شود، در تخلیه بعدی دوباره وارد نمی‌شود.
"""
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime

from . import config

_local = threading.local()
_write_lock = threading.RLock()

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS devices (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    ip                  TEXT NOT NULL,
    port                INTEGER NOT NULL DEFAULT 4370,
    comm_password       INTEGER NOT NULL DEFAULT 0,
    timeout_sec         INTEGER NOT NULL DEFAULT 10,
    location            TEXT DEFAULT '',
    auto_sync           INTEGER NOT NULL DEFAULT 1,
    interval_min        INTEGER NOT NULL DEFAULT 5,
    disable_during_read INTEGER NOT NULL DEFAULT 0,
    active              INTEGER NOT NULL DEFAULT 1,
    archived            INTEGER NOT NULL DEFAULT 0,  -- حذف از فهرست؛ رکوردها و کلید ضدتکرار حفظ می‌شوند
    serial_number      TEXT DEFAULT '',
    device_name         TEXT DEFAULT '',
    firmware            TEXT DEFAULT '',
    last_record_count   INTEGER,
    last_sync_at        TEXT,
    last_success_at     TEXT,
    last_status         TEXT,
    last_error          TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    -- مقادیر خام دستگاه (غیرقابل ویرایش؛ مبنای جلوگیری از تخلیه تکراری)
    raw_user_id  TEXT,
    raw_ts       TEXT,
    raw_punch    INTEGER,
    raw_status   INTEGER,
    raw_uid      INTEGER,
    -- مقادیر قابل ویرایش
    user_id      TEXT NOT NULL,
    ts           TEXT NOT NULL,
    punch        INTEGER NOT NULL DEFAULT 0,
    note         TEXT DEFAULT '',
    source       TEXT NOT NULL DEFAULT 'device',   -- device | manual
    is_edited    INTEGER NOT NULL DEFAULT 0,
    is_deleted   INTEGER NOT NULL DEFAULT 0,
    sync_run_id  INTEGER,
    imported_at  TEXT NOT NULL,
    edited_at    TEXT,
    edited_by    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_att_raw
    ON attendance(device_id, raw_user_id, raw_ts, raw_punch);
CREATE INDEX IF NOT EXISTS ix_att_ts   ON attendance(ts);
CREATE INDEX IF NOT EXISTS ix_att_user ON attendance(user_id, ts);

CREATE TABLE IF NOT EXISTS people (
    user_id     TEXT PRIMARY KEY,
    name        TEXT DEFAULT '',
    department  TEXT DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    name_locked INTEGER NOT NULL DEFAULT 0,  -- اگر کاربر نام را دستی تغییر داد، از دستگاه بازنویسی نشود
    updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    trigger      TEXT NOT NULL,            -- auto | manual
    started_at   TEXT NOT NULL,
    finished_at  TEXT,
    status       TEXT NOT NULL DEFAULT 'running',  -- running | ok | skipped | error
    device_count INTEGER,
    fetched      INTEGER DEFAULT 0,
    inserted     INTEGER DEFAULT 0,
    duplicates   INTEGER DEFAULT 0,
    duration_ms  INTEGER,
    message      TEXT
);
CREATE INDEX IF NOT EXISTS ix_runs_dev ON sync_runs(device_id, started_at);

CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    attendance_id INTEGER,
    action        TEXT NOT NULL,     -- edit | delete | restore | revert | manual_add
    before_json   TEXT,
    after_json    TEXT,
    actor         TEXT,
    at            TEXT NOT NULL
);
"""


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect():
    conn = getattr(_local, "conn", None)
    if conn is None:
        d = os.path.dirname(config.DB_PATH)
        if d:
            os.makedirs(d, exist_ok=True)
        conn = sqlite3.connect(config.DB_PATH, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        _local.conn = conn
    return conn


MIGRATIONS = """
-- شماره تغییر (rev): هر درج یا ویرایش یک شماره صعودی می‌گیرد تا سامانه اصلی
-- بتواند فقط تغییرات تازه را بخواند (GET /api/changes?after_rev=N)
CREATE INDEX IF NOT EXISTS ix_att_rev ON attendance(rev);
CREATE TRIGGER IF NOT EXISTS trg_att_rev_ins AFTER INSERT ON attendance
BEGIN
    UPDATE attendance SET rev = (SELECT COALESCE(MAX(rev), 0) + 1 FROM attendance) WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_att_rev_upd AFTER UPDATE OF user_id, ts, punch, note, is_deleted, device_id ON attendance
BEGIN
    UPDATE attendance SET rev = (SELECT COALESCE(MAX(rev), 0) + 1 FROM attendance) WHERE id = NEW.id;
END;
"""


def init_db():
    conn = connect()
    with _write_lock:
        conn.executescript(SCHEMA)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(attendance)")}
        if "rev" not in cols:
            conn.execute("ALTER TABLE attendance ADD COLUMN rev INTEGER NOT NULL DEFAULT 0")
            conn.execute("UPDATE attendance SET rev = id")
        conn.executescript(MIGRATIONS)
        conn.commit()


@contextmanager
def tx():
    """تراکنش نوشتن — قفل سراسری برای جلوگیری از تداخل نوشتن‌های هم‌زمان."""
    conn = connect()
    with _write_lock:
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def rows(sql, params=()):
    return [dict(r) for r in connect().execute(sql, params).fetchall()]


def row(sql, params=()):
    r = connect().execute(sql, params).fetchone()
    return dict(r) if r else None


def audit(conn, attendance_id, action, before, after, actor):
    conn.execute(
        "INSERT INTO audit_log(attendance_id, action, before_json, after_json, actor, at) VALUES (?,?,?,?,?,?)",
        (attendance_id, action,
         json.dumps(before, ensure_ascii=False) if before is not None else None,
         json.dumps(after, ensure_ascii=False) if after is not None else None,
         actor, now_str()),
    )
