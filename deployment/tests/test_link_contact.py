"""Code-free bot linking, with no database or network access."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class LinkContact(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        self.db = patch.object(server, "q", side_effect=self.query).start()
        patch.object(server, "lead_alert_tables", return_value=True).start()
        patch.object(server, "secret_get", return_value="test-token").start()
        patch.object(server, "tg_tables").start()
        patch.object(server, "_tg_exec").start()
        self.help = patch.object(server, "_tg_try").start()
        self.people = {"one": [{"id": "p1", "name": "رضا", "role": "other", "mobile": "09121234567"}], "two": []}
        patch.object(server, "_sa_people", side_effect=lambda tenant: self.people[tenant]).start()
        self.ensure = patch.object(server, "lead_link_code", return_value="0123456789abcdef").start()
        self.bale = patch.object(server, "lead_bale_call", side_effect=self.bale_call).start()
        self.tg = patch.object(server, "lead_tg_call").start()
        self.updates = []
        self.sent = []
        self.writes = []

    def query(self, sql, args=None):
        if sql == "SELECT tenant FROM tenant_state":
            return [{"tenant": t} for t in self.people]
        if sql.startswith("SELECT v FROM sa_state"):
            return []
        if sql.startswith("UPDATE sa_chat_links"):
            self.writes.append((sql, args))
            return []
        if sql.startswith("INSERT INTO sa_state"):
            return []
        raise AssertionError(sql)

    def bale_call(self, method, fields):
        if method == "getUpdates":
            return self.updates
        self.assertEqual(method, "sendMessage")
        self.sent.append(fields)

    def message(self, **fields):
        return dict({"chat": {"id": 42, "type": "private"}, "from": {"id": 42}}, **fields)

    def poll(self, msg):
        self.updates = [{"update_id": 1, "message": msg}]
        return server.bale_lead_poll()

    def own_contact(self):
        return self.message(contact={"user_id": 42, "phone_number": "+989121234567"})

    def test_bale_start_keyboard(self):
        for text in ("/start", "/start@bot"):
            self.sent.clear()
            self.assertEqual(self.poll(self.message(text=text)), 1)
            self.assertEqual(len(self.sent), 1)
            self.assertTrue(self.sent[0]["reply_markup"]["keyboard"][0][0]["request_contact"])

    def test_own_contact_writes_bale_id(self):
        self.poll(self.own_contact())
        self.ensure.assert_called_once_with("one", "p1")
        sql, args = self.writes[0]
        self.assertIn("SET bale_chat_id=%s, bale_linked_at=%s", sql)
        self.assertEqual((args[0], args[2:]), (42, ("one", "p1")))
        self.assertIn("رضا، به ربات وصل شدید", self.sent[0]["text"])
        self.assertEqual(self.sent[0]["reply_markup"], {"remove_keyboard": True})

    def test_other_contact_rejected(self):
        self.poll(self.message(contact={"user_id": 9, "phone_number": "09121234567"}))
        self.assertEqual(self.writes, [])
        self.ensure.assert_not_called()
        self.assertEqual(self.sent[0]["text"], "فقط شمارهٔ خودتان را با همین دکمه بفرستید.")

    def test_unknown_phone(self):
        self.people["one"] = []
        self.poll(self.own_contact())
        self.assertEqual(self.writes, [])
        self.assertIn("ثبت نشده", self.sent[0]["text"])

    def test_all_tenants_active_any_role_only(self):
        self.people["two"] = [dict(self.people["one"][0], id="p2"),
                              dict(self.people["one"][0], id="inactive", inactive=True)]
        self.poll(self.own_contact())
        self.assertEqual([a[1][2:] for a in self.writes], [("one", "p1"), ("two", "p2")])
        self.assertEqual(len(self.sent), 2)

    def test_telegram_non_admin_start(self):
        with patch.object(server, "TG_ADMIN_ID", 99):
            result = server.tg_handle_update({"update_id": 1, "message": self.message(text="/start")})
        self.assertEqual(result, "link-prompt")
        self.assertTrue(self.tg.call_args.args[1]["reply_markup"]["keyboard"][0][0]["request_contact"])
        self.help.assert_not_called()

    def test_telegram_admin_gets_button_then_help(self):
        order = []
        self.tg.side_effect = lambda *a: order.append("button")
        self.help.side_effect = lambda *a, **kw: order.append("help")
        with patch.object(server, "TG_ADMIN_ID", 42):
            self.assertEqual(server.tg_handle_update({"update_id": 1, "message": self.message(text="/start")}), "help")
        self.assertEqual(order, ["button", "help"])

    def test_telegram_contact_writes_telegram_id(self):
        server.tg_handle_update({"update_id": 1, "message": self.own_contact()})
        self.assertIn("SET telegram_chat_id=%s, telegram_linked_at=%s", self.writes[0][0])

    def test_group_detection_preserved(self):
        msg = self.message(text="/start")
        msg["chat"] = {"id": -42, "type": "group", "title": "test"}
        with patch.object(server, "bale_chats_remember") as remember:
            self.assertEqual(self.poll(msg), 0)
        self.assertEqual(remember.call_args.args[0][0]["id"], -42)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.writes, [])

    def test_code_start_preserved(self):
        with patch.object(server, "lead_link_start", return_value="linked") as start:
            self.poll(self.message(text="/start 0123456789abcdef"))
            start.assert_called_once_with("bale", 42, "0123456789abcdef")
        self.assertEqual(self.sent, [])


if __name__ == "__main__":
    unittest.main()
