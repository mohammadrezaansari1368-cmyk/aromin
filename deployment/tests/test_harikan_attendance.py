"""3.9.68: attendance only from Harikan — MCP day export → attendance rows (same engine as the device file), one-time reversible
archive of file-imported attendance, Harikan status and the live dashboard numbers. SQLite fake, synthetic codes."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import server  # noqa: E402
from db_fake import Connection, load_schema  # noqa: E402

PEOPLE = [{"id": 1, "name": "سارا احمدی", "role": "sales"}, {"id": 2, "name": "علی رضایی", "role": "sales"}]
DAY = {"kind": "day", "key": "1405/07/29", "present": ["10001", "10002"], "absent": ["10003"], "leave": [], "mission": ["10004"],
       "attendance": [{"code": "10001", "in": "08:05", "out": "17:10"}, {"code": "10002", "in": "09:20", "out": None}]}


class Base(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = tmp.name
        self.db = str(Path(tmp.name) / "t.sqlite")
        for m in ("006_identity_attendance.sql", "009_batch_rows.sql", "010_harikan_exports.sql"):
            load_schema(Path(server.HERE) / "migrations" / m, self.db)
        self.full = {"people": PEOPLE}
        self.addCleanup(patch.stopall)
        patch.object(server, "_tenant_full", side_effect=lambda t="team": self.full).start()
        patch.object(server, "db_conn", side_effect=lambda: Connection(self.db)).start()
        patch.object(server, "kb_identity", side_effect=lambda r, t: {"user": "mgr", "role": "manager"}).start()
        patch.object(server, "ATT_ARCHIVE_MARK", os.path.join(tmp.name, "mark")).start()

    def rows(self, sql, args=()):
        cx = Connection(self.db)
        try:
            return [tuple(r) for r in cx.connection.execute(sql, args).fetchall()]
        finally:
            cx.close()


class HarikanDay(Base):
    def save(self, ex):
        return server._mcp_save_export("t1", {"export": ex})

    def test_day_export_becomes_attendance_rows_idempotently(self):
        r = self.save(DAY)
        self.assertEqual((r["status"], r["attendance"]["ok"]), ("inserted", True))
        got = {c: (json.loads(p), m, n) for c, p, m, n in self.rows("SELECT card_no, punches, present_min, note FROM attendance_days WHERE tenant='t1'")}
        self.assertEqual(got["10001"], ([485, 1030], 545, None))
        self.assertEqual(got["10002"], ([560], None, None))                 # no exit yet → no invented presence
        self.assertEqual(got["10003"][2], "غیبت")
        self.assertEqual(got["10004"][2], "ماموریت")
        self.assertEqual(self.rows("SELECT source, file_name FROM attendance_batches"), [("harikan", "harikan-day-1405-07-29.json")])
        self.assertEqual(self.save(DAY)["status"], "unchanged")              # same export again → nothing new
        self.assertEqual(len(self.rows("SELECT id FROM attendance_batches")), 1)
        later = dict(DAY, attendance=[{"code": "10001", "in": "08:05", "out": "17:10"}, {"code": "10002", "in": "09:20", "out": "18:00"}])
        self.assertEqual(self.save(later)["status"], "updated")
        self.assertEqual(self.rows("SELECT present_min FROM attendance_days WHERE card_no='10002'"), [(520,)])
        # codes are card aliases → reviewed once like the device cards, then mapped to people
        self.assertEqual(sorted(r[0] for r in self.rows("SELECT alias_key FROM identity_aliases WHERE kind='card'")), ["10001", "10002", "10003", "10004"])
        st = server.harikan_status("t1")
        self.assertEqual((st["lastDay"]["key"], st["days"]), ("1405/07/29", 4))
        self.assertEqual(st["unmatched"], ["10001", "10002", "10003", "10004"])

    def test_ingest_failure_never_breaks_the_mcp_save(self):
        with patch.object(server, "_att_ingest", side_effect=RuntimeError("boom")):
            r = self.save(DAY)
        self.assertEqual((r["ok"], r["attendance"]), (True, {"ok": False}))
        self.assertEqual(len(self.rows("SELECT tenant FROM harikan_exports")), 1)

    def test_month_export_stored_not_ingested(self):
        r = self.save({"kind": "month", "key": "1405/07", "people": [{"code": "10001", "missionKm": 12.5}, {"code": "10004", "missionKm": 30}]})
        self.assertNotIn("attendance", r)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM attendance_days"), [(0,)])


class Archive(Base):
    def test_file_attendance_moves_to_archive_once_and_harikan_stays(self):
        sheets = {"شیت ۱": [{"تاریخ": "1405/07/01", "شماره کارت": "555", "نام": "سارا", "ورود 1": "08:00", "خروج 1": "16:00"}]}
        server.attendance_upload(None, {"tenant": "t1", "fileName": "device.xlsx", "sha256": "b" * 64, "source": "import-center", "sheets": sheets})
        server._mcp_save_export("t1", {"export": DAY})
        server.attendance_settings_put(None, {"tenant": "t1", "settings": {"workStart": "08:00"}}) if hasattr(server, "attendance_settings_put") else None
        before = self.rows("SELECT COUNT(*) FROM attendance_days")[0][0]
        moved = server.attendance_archive_files()
        self.assertEqual(moved["days"], 1)
        self.assertEqual(self.rows("SELECT COUNT(*) FROM attendance_days")[0][0], before)         # nothing deleted
        self.assertEqual(self.rows("SELECT card_no FROM attendance_days WHERE tenant='t1~archive'"), [("555",)])
        self.assertEqual(sorted(r[0] for r in self.rows("SELECT card_no FROM attendance_days WHERE tenant='t1'")), ["10001", "10002", "10003", "10004"])
        self.assertEqual(self.rows("SELECT source FROM attendance_batches WHERE tenant='t1'"), [("harikan",)])
        self.assertIsNone(server.attendance_archive_files())                                       # once
        self.assertEqual(server.harikan_status("t1")["archive"]["moved"]["days"], 1)


class Live(Base):
    def test_live_numbers_and_empty_sources(self):
        out = server.dashboard_live("t1", today="1405/07/30")
        self.assertEqual((out["calls"], out["tickets"], out["attendance"]), (None, None, None))     # no data → None («داده‌ای نیست»)
        server._mcp_save_export("t1", {"export": DAY})
        server._mcp_save_export("t1", {"export": {"kind": "month", "key": "1405/07", "people": [{"code": "1", "missionKm": 12.5}, {"code": "2", "missionKm": 30}]}})
        load_schema(Path(server.HERE) / "migrations" / "007_calls.sql", self.db)
        load_schema(Path(server.HERE) / "migrations" / "008_tickets.sql", self.db)
        cx = Connection(self.db)
        for d, t, st in (("1405/07/30", 9 * 3600, "answered"), ("1405/07/30", 9 * 3600 + 60, "answered"), ("1405/07/30", 11 * 3600, "answered"),
                         ("1405/07/30", 12 * 3600, "missed"), ("1405/07/29", 10 * 3600, "answered")):
            cx.connection.execute("INSERT INTO call_logs (tenant, channel_code, date_j, time_s, direction, channel_status, call_status, raw_json, row_sha256, core_sha256, batch_id, updated_at) "
                                  "VALUES ('t1', ?, ?, ?, 'in', 'success', ?, '{}', 'x', 'x', 1, '2026-10-22')", (str(t) + d, d, t, st))
        for no, status, sla in (("1", "باز", 1), ("2", "بسته شد", 0), ("3", "در حال پیگیری", None)):
            cx.connection.execute("INSERT INTO ticket_logs (tenant, ticket_no, date_j, status, sla_ok, raw_json, row_sha256, batch_id, updated_at) "
                                  "VALUES ('t1', ?, '1405/07/30', ?, ?, '{}', 'x', 1, '2026-10-22')", (no, status, sla))
        cx.connection.commit(); cx.close()
        with patch.object(server, "lead_alert_tables", return_value=False):
            out = server.dashboard_live("t1", today="1405/07/30")
        self.assertEqual((out["calls"]["today"], out["calls"]["perHour"]), (3, 1.5))               # 3 answered over 2 hours
        self.assertEqual(out["calls"]["byDay"][-2:], [1, 3])
        self.assertEqual(out["calls"]["answeredPct"], 80.0)
        self.assertEqual((out["tickets"]["open"], out["tickets"]["slaPct"]), (2, 50.0))
        self.assertEqual((out["attendance"]["present"], out["attendance"]["absent"], out["attendance"]["pct"]), (2, 1, 66.7))
        self.assertEqual(out["attendance"]["missionKm"], 42.5)

    def test_live_endpoint_is_managers_and_finance_only(self):
        with patch.object(server, "kb_identity", return_value={"user": "s", "role": "sales"}):
            self.assertEqual(server.dashboard_live_read(None, tenant="t1").status_code, 403)
        with patch.object(server, "kb_identity", return_value=None):
            self.assertEqual(server.dashboard_live_read(None, tenant="t1").status_code, 401)


if __name__ == "__main__":
    unittest.main()
