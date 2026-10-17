"""Offline tests for lead alerts (Telegram + Bale), /start linking, and the stricter Nabzekar reply check.
Never contacts Telegram, Bale, Nabzekar or a database."""
import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class FakeCursor:
    def __init__(self, tx):
        self.tx, self.rowcount, self.lastrowid = tx, 1, 0

    def fetchone(self):
        return self.tx.next_one()


class FakeTx:
    """Records every SQL statement; answers SELECT ... FOR UPDATE from a queue."""
    log = []

    def __init__(self):
        self.cur = FakeCursor(self)
        self.cur.lastrowid = 77

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def x(self, sql, args=None):
        FakeTx.log.append((sql, args))
        return self.cur

    def one(self, sql, args=None):
        FakeTx.log.append((sql, args))
        return {"v": ""} if "sa_state" in sql else None

    def next_one(self):
        return None


class NabzekarReplies(unittest.TestCase):
    def test_success_only_when_explicit(self):
        for ok in ("123456789", "12, 34", '{"status": 1}', '{"success": true}', '[987654]', '{"data": {"id": 55}}', '{"status": "ok"}'):
            self.assertFalse(server._nabzekar_failed(ok), ok)

    def test_unknown_empty_zero_negative_html_fail(self):
        for bad in ("", "0", "-3", "OK?", "<html>error</html>", "credit low", '{"status": 0}', '{"foo": "bar"}', "[]", "12,0", '{"success": false}', "{bad"):
            self.assertTrue(server._nabzekar_failed(bad), bad)

    def test_override_regex(self):
        with patch.object(server, "NABZEKAR_OK_REGEX", r"SENT:\d+"):
            self.assertFalse(server._nabzekar_failed("SENT:42"))
            self.assertTrue(server._nabzekar_failed("SENT:x"))

    def test_sms_error_shows_raw_reply(self):
        with patch.object(server, "SALES_SMS_FROM", "3000"), patch.object(server, "sms_call", return_value={"ok": True, "result": "weird"}), \
                patch.object(server, "_w_allow", return_value=True):
            ok, err = server._sa_send_sms("09121234567", "x")
        self.assertFalse(ok)
        self.assertIn("weird", err)


class AlertText(unittest.TestCase):
    def test_contains_every_field_and_dashboard(self):
        info = {"name": "علی", "phone": "09121234567", "city": "تهران", "businessType": "رستوران", "productInterest": "صندوق",
                "sourceUrl": "https://arominco.com/p/1", "summary": "نیاز فوری", "assignedTo": "سارا"}
        t = server.lead_alert_text(info, 9)
        for v in list(info.values()) + ["#9", server.LEADS_DASH_URL]:
            self.assertIn(v, t)

    def test_unassigned(self):
        self.assertIn("تخصیص نیافته", server.lead_alert_text({"name": "a", "phone": "b"}))


class Enqueue(unittest.TestCase):
    def setUp(self):
        FakeTx.log = []

    def create(self, reps, mgr):
        cfg = {"source": "s", "tplRep": "r", "tplManager": "m", "tplManagerNoRep": "n", "tplCustomer": "c", "vars": {}}
        with patch.object(server, "_SaTx", FakeTx), patch.object(server, "sa_cfg", return_value=cfg), patch.object(server, "sa_reps", return_value=reps), \
                patch.object(server, "sa_manager", return_value=mgr), patch.object(server, "lead_alert_tables", return_value=True), patch.object(server, "_sa_kick"):
            out = server.sa_create_lead("team", {"name": "علی", "phone": "09121234567", "city": "تهران"})
        kinds = [a[2] for s, a in FakeTx.log if s.startswith("INSERT INTO sa_notifications")]
        return out, kinds, FakeTx.log

    def test_rep_and_manager_get_bale_then_telegram(self):
        out, kinds, log = self.create([{"id": "r1", "name": "سارا", "phone": "09120000001"}], {"id": "m1", "name": "مدیر", "phone": "09120000002"})
        self.assertTrue(out["ok"])
        self.assertEqual(kinds, ["rep", "manager", "customer", "rep_bale", "rep_tg", "manager_bale", "manager_tg"])
        rows = [a for s, a in log if "person_id" in s]
        self.assertEqual([r[4] for r in rows], ["r1", "r1", "m1", "m1"])
        self.assertEqual(len({r[-1] for r in rows}), 4)                       # idem جدا برای هر کانال
        self.assertIn("سارا", rows[0][5])

    def test_no_rep_only_manager(self):
        _, kinds, _ = self.create([], {"id": "m1", "name": "مدیر", "phone": ""})
        self.assertEqual([k for k in kinds if "_" in k], ["manager_bale", "manager_tg"])

    def test_alert_tables_unavailable_keeps_sms_only(self):
        cfg = {"source": "s", "tplRep": "r", "tplManager": "m", "tplManagerNoRep": "n", "tplCustomer": "c", "vars": {}}
        with patch.object(server, "_SaTx", FakeTx), patch.object(server, "sa_cfg", return_value=cfg), patch.object(server, "sa_reps", return_value=[]), \
                patch.object(server, "sa_manager", return_value={"id": "m1", "name": "x", "phone": ""}), patch.object(server, "lead_alert_tables", return_value=False), patch.object(server, "_sa_kick"):
            server.sa_create_lead("team", {"name": "a b", "phone": "09121234567"})
        self.assertFalse(any("person_id" in s for s, _ in FakeTx.log))


class Delivery(unittest.TestCase):
    """sa_process_notifications با q و _SaTxِ جعلی: هر ردیف مستقل، بله حتی با شکستِ تلگرام."""

    def run_rows(self, rows, sender):
        updates = []

        def fq(sql, args=()):
            if sql.startswith("SELECT id FROM sa_notifications"):
                return [{"id": r["id"]} for r in rows]
            if sql.startswith("SELECT * FROM sa_notifications"):
                return [next(r for r in rows if r["id"] == args[0])]
            if sql.startswith("UPDATE sa_notifications"):
                updates.append((sql, args))
            return []
        with patch.object(server, "q", side_effect=fq), patch.object(server, "_SaTx", FakeTx), \
                patch.object(server, "lead_chat_id", side_effect=lambda t, p, ch: {"tg": 111, "bale": 222}[ch]), \
                patch.object(server, "lead_send", side_effect=sender) as send:
            server.sa_process_notifications()
        return updates, send.call_args_list

    def row(self, i, kind, attempts=0):
        return {"id": i, "tenant": "team", "lead_id": 5, "kind": kind, "recipient": "سارا", "person_id": "r1", "phone": None, "body": "b", "attempts": attempts}

    def test_telegram_unreachable_bale_still_sent(self):
        def sender(ch, chat, text):
            if ch == "tg":
                raise server.LeadAlertError("اتصال برقرار نشد (timeout)")
        ups, calls = self.run_rows([self.row(1, "rep_tg"), self.row(2, "rep_bale")], sender)
        self.assertEqual([c.args[0] for c in calls], ["tg", "bale"])
        st = {a[-1]: a[0] for s, a in ups}
        self.assertEqual(st[1], "pending")                                    # تلاشِ دوباره
        self.assertTrue(any(s.startswith("UPDATE sa_notifications SET status='sent'") and a[-1] == 2 for s, a in ups))

    def test_unexpected_exception_does_not_block_others(self):
        def sender(ch, chat, text):
            if ch == "tg":
                raise RuntimeError("boom")
        ups, calls = self.run_rows([self.row(1, "manager_tg"), self.row(2, "manager_bale")], sender)
        self.assertEqual(len(calls), 2)
        self.assertTrue(any("status='sent'" in s and a[-1] == 2 for s, a in ups))

    def test_third_try_marks_failed(self):
        def sender(ch, chat, text):
            raise server.LeadAlertError("HTTP 502")
        ups, _ = self.run_rows([self.row(1, "rep_bale", attempts=2)], sender)
        self.assertEqual(ups[0][1][0], "failed")
        self.assertEqual(ups[0][1][1], 3)

    def test_permanent_error_fails_immediately(self):
        def sender(ch, chat, text):
            raise server.LeadAlertError("HTTP 403 blocked", final=True)
        ups, _ = self.run_rows([self.row(1, "rep_bale")], sender)
        self.assertEqual(ups[0][1][0], "failed")

    def test_not_linked_is_final_with_clear_error(self):
        with patch.object(server, "lead_chat_id", return_value=None):
            ok, err, final = server.lead_alert_deliver(self.row(1, "rep_bale"))
        self.assertEqual((ok, final), (False, True))
        self.assertIn("/start", err)


class BotCalls(unittest.TestCase):
    def test_token_never_in_error(self):
        tok = "123:SECRETTOKEN"
        err = urllib.error.HTTPError("https://tapi.bale.ai/bot" + tok + "/sendMessage", 401, "Unauthorized " + tok, {}, io.BytesIO(b'{"description":"bad ' + tok.encode() + b'"}'))
        with patch.object(server, "LEADS_BALE_TOKEN", tok), patch.object(server.urllib.request, "urlopen", side_effect=err):
            with self.assertRaises(server.LeadAlertError) as cm:
                server.lead_bale_call("sendMessage", {"chat_id": 1, "text": "x"})
        self.assertNotIn("SECRETTOKEN", str(cm.exception))
        self.assertTrue(cm.exception.final)

    def test_network_error_is_retryable(self):
        with patch.object(server, "LEADS_BALE_TOKEN", "t"), patch.object(server.urllib.request, "urlopen", side_effect=urllib.error.URLError(TimeoutError())):
            with self.assertRaises(server.LeadAlertError) as cm:
                server.lead_bale_call("sendMessage", {})
        self.assertFalse(cm.exception.final)

    def test_bale_uses_bale_api(self):
        class R(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False
        with patch.object(server, "LEADS_BALE_TOKEN", "tk"), patch.object(server.urllib.request, "urlopen", return_value=R(b'{"ok":true,"result":{}}')) as u:
            server.lead_send("bale", 5, "hi")
        self.assertTrue(u.call_args.args[0].full_url.startswith("https://tapi.bale.ai/bottk/sendMessage"))

    def test_telegram_falls_back_to_main_bot(self):
        with patch.object(server, "LEADS_TG_TOKEN", ""), patch.object(server, "tg_api", return_value={}) as api:
            server.lead_send("tg", 5, "hi")
        api.assert_called_once()
        with patch.object(server, "LEADS_TG_TOKEN", ""), patch.object(server, "tg_api", side_effect=server.TgError("permanent", "403")):
            with self.assertRaises(server.LeadAlertError) as cm:
                server.lead_send("tg", 5, "hi")
        self.assertTrue(cm.exception.final)

    def test_dedicated_telegram_token_goes_direct(self):
        with patch.object(server, "LEADS_TG_TOKEN", "lt"), patch.object(server, "_lead_bot_call", return_value={}) as c, patch.object(server, "tg_api") as api:
            server.lead_send("tg", 5, "hi")
        self.assertEqual(c.call_args.args[1], "lt")
        api.assert_not_called()


class StartLinks(unittest.TestCase):
    def update(self, text, sender=99):
        return {"update_id": 1, "message": {"text": text, "from": {"id": sender}, "chat": {"id": sender, "type": "private"}}}

    def handle(self, upd):
        with patch.object(server, "tg_tables"), patch.object(server, "_tg_exec", return_value=(1, None)), patch.object(server, "TG_ADMIN_ID", 42), \
                patch.object(server, "lead_link_start", return_value="linked") as link, patch.object(server, "_tg_try") as api:
            return server.tg_handle_update(upd), link.call_args_list, api.call_args_list

    def test_non_admin_start_code_links(self):
        res, link, _ = self.handle(self.update("/start 0123456789abcdef"))
        self.assertEqual(res, "linked")
        self.assertEqual(link[0].args, ("tg", 99, "0123456789abcdef"))

    def test_non_admin_other_commands_ignored(self):
        for t in ("/start", "/post", "/start ../../etc", "hello"):
            res, link, api = self.handle(self.update(t))
            self.assertEqual(res, "ignored", t)
            self.assertFalse(link or api)

    def test_group_chat_not_linked(self):
        upd = {"update_id": 1, "message": {"text": "/start 0123456789abcdef", "from": {"id": 99}, "chat": {"id": -5, "type": "group"}}}
        res, link, _ = self.handle(upd)
        self.assertEqual(res, "ignored")
        self.assertFalse(link)

    def test_admin_plain_start_still_help(self):
        res, link, _ = self.handle(self.update("/start", sender=42))
        self.assertEqual(res, "help")
        self.assertFalse(link)

    def test_claim_records_chat_id(self):
        calls = []

        def fq(sql, args=()):
            calls.append((sql, args))
            if sql.startswith("SELECT tenant, person_id"):
                return [{"tenant": "team", "person_id": "r1"}]
            return []
        with patch.object(server, "lead_alert_tables", return_value=True), patch.object(server, "q", side_effect=fq), \
                patch.object(server, "_lead_people", return_value=[{"id": "r1", "name": "سارا", "role": "sales"}]):
            self.assertEqual(server.lead_link_claim("bale", 222, "0123456789abcdef"), "سارا")
        upd = [c for c in calls if c[0].startswith("UPDATE sa_chat_links")][0]
        self.assertIn("bale_chat_id=%s", upd[0])
        self.assertEqual(upd[1][0], 222)

    def test_unknown_code_replies_invalid(self):
        with patch.object(server, "lead_link_claim", return_value=None), patch.object(server, "lead_send") as send:
            self.assertEqual(server.lead_link_start("tg", 5, "0123456789abcdef"), "link-unknown")
        self.assertIn("معتبر نیست", send.call_args.args[2])

    def test_reply_failure_still_links(self):
        with patch.object(server, "lead_link_claim", return_value="سارا"), patch.object(server, "lead_send", side_effect=server.LeadAlertError("x")):
            self.assertEqual(server.lead_link_start("tg", 5, "0123456789abcdef"), "linked")


class BalePoll(unittest.TestCase):
    def test_start_updates_processed_and_offset_saved(self):
        writes = []

        def fq(sql, args=()):
            if sql.startswith("SELECT v FROM sa_state"):
                return [{"v": "10"}]
            writes.append((sql, args))
            return []
        ups = [{"update_id": 10, "message": {"text": "/start 0123456789abcdef", "chat": {"id": 222, "type": "private"}}},
               {"update_id": 11, "message": {"text": "سلام", "chat": {"id": 223, "type": "private"}}}]
        with patch.object(server, "LEADS_BALE_TOKEN", "t"), patch.object(server, "lead_alert_tables", return_value=True), patch.object(server, "q", side_effect=fq), \
                patch.object(server, "lead_bale_call", return_value=ups) as call, patch.object(server, "lead_link_start") as link:
            self.assertEqual(server.bale_lead_poll(), 1)
        self.assertEqual(call.call_args.args[1]["offset"], 10)
        link.assert_called_once_with("bale", 222, "0123456789abcdef")
        self.assertEqual(writes[-1][1][0], "12")

    def test_no_token_no_call(self):
        with patch.object(server, "LEADS_BALE_TOKEN", ""), patch.object(server, "lead_bale_call") as call:
            self.assertEqual(server.bale_lead_poll(), 0)
        call.assert_not_called()

    def test_getupdates_failure_is_logged_not_raised(self):
        with patch.object(server, "LEADS_BALE_TOKEN", "t"), patch.object(server, "lead_alert_tables", return_value=True), \
                patch.object(server, "q", return_value=[]), patch.object(server, "lead_bale_call", side_effect=server.LeadAlertError("HTTP 409 webhook set")):
            self.assertEqual(server.bale_lead_poll(), 0)


class AlertTest(unittest.TestCase):
    def test_bale_attempted_even_if_telegram_fails(self):
        def sender(ch, chat, text):
            if ch == "tg":
                raise server.LeadAlertError("blocked")
        with patch.object(server, "lead_alert_tables", return_value=True), patch.object(server, "sa_manager", return_value={"id": "m1", "name": "مدیر", "phone": ""}), \
                patch.object(server, "lead_chat_id", return_value=1), patch.object(server, "lead_send", side_effect=sender) as send:
            r = server.lead_alert_test("team")
        self.assertEqual({c.args[0] for c in send.call_args_list}, {"tg", "bale"})
        self.assertTrue(r["bale"]["ok"])
        self.assertFalse(r["telegram"]["ok"])
        self.assertFalse(r["ok"])


if __name__ == "__main__":
    unittest.main()
