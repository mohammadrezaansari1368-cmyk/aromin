"""Manager fallback uses the notification queue; no database or network needed."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class LeadFallback(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        self.info = {"name": "کافه نارنج", "phone": "09121234567", "businessType": "کافه",
                     "sourceUrl": "https://example.test/menu", "assignedTo": "رضا"}
        self.rows = []
        for ch in server.LEAD_CHANNELS:
            self.rows.append(dict(id=len(self.rows) + 1, tenant="team", lead_id=9,
                                  kind="rep_" + ch, recipient="رضا", person_id="rep",
                                  body=server.lead_alert_text(self.info, 9), status="pending", attempts=0))
        patch.object(server, "q", side_effect=self.query).start()
        tx = patch.object(server, "_SaTx").start().return_value.__enter__.return_value
        tx.x.side_effect = self.execute
        patch.object(server, "sa_manager", return_value={"id": "mgr", "name": "مدیر"}).start()
        self.chats = {("mgr", "bale"): "manager-bale"}
        patch.object(server, "lead_chat_id", side_effect=lambda tenant, pid, ch: self.chats.get((pid, ch))).start()
        self.bale = patch.object(server, "lead_bale_call").start()
        self.tg = patch.object(server, "lead_tg_call").start()
        self.sms = patch.object(server, "_sa_send_sms", return_value=(True, "")).start()

    def query(self, sql, args=None):
        if sql.startswith("SELECT id FROM sa_notifications"):
            return [{"id": r["id"]} for r in self.rows if r["status"] == "pending"][:args[1]]
        if sql.startswith("SELECT * FROM sa_notifications"):
            return [dict(r) for r in self.rows if r["id"] == args[0]]
        if sql.startswith("SELECT kind, status"):
            return [dict(r) for r in self.rows if r["tenant"] == args[0] and r["lead_id"] == args[1]
                    and r["kind"] in ("rep_bale", "rep_tg")]
        if sql.startswith("UPDATE sa_notifications"):
            row = next(r for r in self.rows if r["id"] == args[-1])
            if "status='sent'" in sql:
                row.update(status="sent", attempts=args[0], last_error=None)
            else:
                row.update(status=args[0], attempts=args[1], last_error=args[2])
            return []
        raise AssertionError(sql)

    def execute(self, sql, args):
        if sql.startswith("UPDATE sa_notifications SET status='sending'"):
            row = next(r for r in self.rows if r["id"] == args[0])
            claimed = row["status"] == "pending"
            if claimed:
                row["status"] = "sending"
            return SimpleNamespace(rowcount=int(claimed))
        if sql.startswith("INSERT IGNORE INTO sa_notifications"):
            if not any(r.get("idem") == args[-1] for r in self.rows):
                self.rows.append(dict(id=len(self.rows) + 1, tenant=args[0], lead_id=args[1],
                                      kind=args[2], recipient=args[3], person_id=args[4], body=args[5],
                                      status="pending", attempts=0, idem=args[-1]))
            return SimpleNamespace(rowcount=1)
        raise AssertionError(sql)

    def fallbacks(self):
        return [r for r in self.rows if r["kind"].startswith("fallback_")]

    def test_both_rep_channels_fail_once_with_full_lead(self):
        server.sa_process_notifications()
        server.lead_alert_fallback("team", 9)
        server.lead_alert_fallback("team", 9)
        self.assertEqual([r["kind"] for r in self.fallbacks()], ["fallback_bale"])
        server.sa_process_notifications()
        server.sa_process_notifications()
        self.bale.assert_called_once()
        text = self.bale.call_args.args[1]["text"]
        for value in self.info.values():
            self.assertIn(value, text)
        self.assertIn("کارشناسِ رضا هنوز به ربات وصل نیست — لطفاً خودتان پیگیری کنید یا لینکِ اتصال را برایش بفرستید", text)
        self.assertEqual(self.fallbacks()[0]["status"], "sent")
        self.tg.assert_not_called()
        self.sms.assert_not_called()

    def test_linked_manager_gets_bale_then_telegram(self):
        self.chats[("mgr", "tg")] = "manager-tg"
        calls = []
        self.bale.side_effect = lambda *a: calls.append("bale")
        self.tg.side_effect = lambda *a: calls.append("tg")
        server.sa_process_notifications()
        server.sa_process_notifications()
        server.lead_alert_fallback("team", 9)
        server.sa_process_notifications()
        self.assertEqual(calls, ["bale", "tg"])
        self.assertEqual(len(self.fallbacks()), 2)

    def test_either_rep_channel_succeeds_suppresses_fallback(self):
        for ch in server.LEAD_CHANNELS:
            with self.subTest(channel=ch):
                self.chats = {("rep", ch): "rep-chat", ("mgr", "bale"): "manager-bale"}
                for row in self.rows:
                    row.update(status="pending", attempts=0)
                server.sa_process_notifications()
                self.assertEqual(self.fallbacks(), [])

    def test_waits_for_retries_before_fallback(self):
        self.chats[("rep", "bale")] = "rep-chat"
        self.bale.side_effect = server.LeadAlertError("timeout")
        server.sa_process_notifications()
        self.assertEqual(self.fallbacks(), [])
        server.sa_process_notifications()
        self.assertEqual(self.fallbacks(), [])
        server.sa_process_notifications()
        self.assertEqual(len(self.fallbacks()), 1)
        self.bale.side_effect = None
        server.sa_process_notifications()
        self.assertEqual(self.fallbacks()[0]["status"], "sent")


if __name__ == "__main__":
    unittest.main()
