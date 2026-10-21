"""AROMIN Agent (P0) offline tests: settings validation, scoring, handoff text, PII redaction, fine-tune export and the
critical path (proactive config -> conversation -> lead persisted with score -> Telegram/Bale handoff with retry/failure ->
disabling the agent stops delivery). SQLite stand-in; never contacts Telegram, Bale, an AI provider or MariaDB."""
import json
import os
import re
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import server
from db_fake import Connection


def sqlite_schema(path):
    stmts = list(server.SA_DDL) + [server.LEAD_DDL[0]] + list(server.AGENT_DDL)
    cx = sqlite3.connect(path)
    for s in stmts:
        s = s.replace("BIGINT AUTO_INCREMENT PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
        s = re.sub(r"UNIQUE KEY \w+", "UNIQUE", s)
        s = re.sub(r",\s*KEY \w+ \([^)]*\)", "", s)
        s = s.replace("ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", "").replace("DATETIME", "TIMESTAMP")
        cx.execute(s)
    for s in [server.LEAD_DDL[1]] + server.AGENT_LEAD_ALTER:
        cx.execute(s.replace(" IF NOT EXISTS", ""))
    cx.commit()
    cx.close()


class Settings(unittest.TestCase):
    def test_norm_rejects_bad_values_and_keeps_name_phone_required(self):
        c = server.agent_norm({"enabled": 1, "greetings": {"morning": "سلام کاسب عزیز"}, "caps": {"perDay": 999, "cooldownMin": "x"},
                               "triggers": [{"id": "ok-1", "when": {"path": "/p", "minScroll": 300, "visitor": "first", "bad": 1}, "emotion": "nope"},
                                            {"id": "bad id!"}],
                               "lead": {"required": ["city"], "minScore": 500},
                               "routing": {"recipients": {"telegram": "123456, abc, @team_leads", "bale": [42, "9999"]}}})
        self.assertTrue(c["enabled"])
        self.assertNotIn("کاسب ", c["greetings"]["morning"].replace("صاحب کسب‌وکار", ""))
        self.assertEqual(c["caps"]["perDay"], 20)
        self.assertEqual(c["caps"]["cooldownMin"], 30)
        self.assertEqual(len(c["triggers"]), 1)
        self.assertEqual(c["triggers"][0]["when"], {"path": "/p", "minScroll": 100, "visitor": "first"})
        self.assertEqual(c["triggers"][0]["emotion"], "curious")
        self.assertEqual(c["lead"]["required"][:2], ["phone", "name"] if c["lead"]["required"][0] == "phone" else ["name", "phone"])
        self.assertEqual(c["lead"]["minScore"], 100)
        self.assertEqual(c["routing"]["recipients"]["telegram"], ["123456", "@team_leads"])
        self.assertEqual(c["routing"]["recipients"]["bale"], ["9999"])

    def test_public_cfg_hides_routing(self):
        with patch.object(server, "agent_cfg", return_value=server.agent_norm({"enabled": True, "routing": {"recipients": {"telegram": ["123456"]}}})):
            pub = server.agent_public("t")
        self.assertNotIn("routing", pub)
        self.assertNotIn("123456", json.dumps(pub))
        self.assertIn("greetings", pub)
        with patch.object(server, "agent_cfg", return_value=server.agent_norm({"enabled": False})):
            self.assertIsNone(server.agent_public("t"))


class Scoring(unittest.TestCase):
    def test_score_and_intent(self):
        self.assertEqual(server.agent_score({"name": "علی", "phone": "09121234567"}), (35, "info"))
        s, i = server.agent_score({"name": "علی", "phone": "09121234567", "productInterest": "صندوق", "city": "قم"}, texts=["قیمت صندوق چنده؟"])
        self.assertEqual((s, i), (75, "buy"))
        self.assertEqual(server.agent_score({"phone": "bad", "intent": "compare"}), (10, "compare"))

    def test_handoff_text_summary_only(self):
        t = server.agent_handoff_text({"name": "علی", "phone": "09121234567", "businessType": "رستوران", "summary": "صندوق"}, 5, 70, "buy")
        self.assertTrue(t.startswith("🔥 لید جدید آرومین #5"))
        for v in ("علی", "09121234567", "رستوران", "70/100", "lead=5"):
            self.assertIn(v, t)

    def test_routing_rules(self):
        cfg = server.agent_norm({"routing": {"bale": False, "recipients": {"telegram": ["111"]}, "rules": [{"match": "صندوق", "telegram": ["222"]}]}})
        self.assertEqual(server.agent_recipients(cfg, {"productInterest": "صندوق فروشگاهی"}), {"tg": ["111", "222"]})
        self.assertEqual(server.agent_recipients(cfg, {"productInterest": "نرم‌افزار"}), {"tg": ["111"]})


class Privacy(unittest.TestCase):
    def test_redact(self):
        t = server.agent_redact("من علی هستم ۰۹۱۲۱۲۳۴۵۶۷ a@b.com کارت 6037-9911-2222 https://x.ir/?q=1", names=["علی"])
        for bad in ("09121234567", "a@b.com", "6037", "x.ir", "علی"):
            self.assertNotIn(bad, t)
        self.assertIn("[PHONE]", t)

    def test_event_props_whitelist(self):
        seen = []
        with patch.object(server, "agent_tables", return_value=True), patch.object(server, "q", side_effect=lambda s, a=None: seen.append(a) or []):
            self.assertTrue(server.agent_event("t", "s", "trigger_fired", {"trigger": "t1", "path": "https://x.ir/p?phone=0912", "phone": "0912", "state": "<x>"}))
            self.assertFalse(server.agent_event("t", "s", "not_an_event"))
        props = json.loads(seen[0][3])
        self.assertEqual(props, {"trigger": "t1", "path": "/p"})


class CriticalPath(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.dir.name, "t.db")
        sqlite_schema(self.db)
        sa = os.path.join(self.dir.name, "sa.json")
        Path(sa).write_text(json.dumps({"team": {"enabled": False}}), encoding="utf-8")
        self.site = {"siteId": "a" * 20, "tenant": "team", "name": "آرومین", "domain": "arominco.com", "enabled": True, "settings": {}}
        self.patches = [patch.object(server, "db_conn", lambda: Connection(self.db)), patch.object(server, "SA_FILE", sa),
                        patch.dict(server._agent_ready, {"ok": True}), patch.dict(server._lead_ready, {"ok": True}),
                        patch.object(server, "_sa_people", return_value=[]), patch.object(server, "_sa_kick", lambda: None),
                        patch.object(server, "_w_site_for", lambda r, s: (self.site, "", None)),
                        patch.object(server, "_w_load", lambda: {"sites": {self.site["siteId"]: self.site}}),
                        patch.object(server, "assistant_system", return_value="SYS"), patch.object(server, "assistant_grounding", return_value=""),
                        patch.object(server, "sa_products_ctx", return_value=("", None)), patch.object(server, "sa_start_worker", lambda: None)]
        for p in self.patches:
            p.start()
        server._agent_cache.clear()
        server._w_hits.clear()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        server._agent_cache.clear()
        self.dir.cleanup()

    def rows(self, sql, args=()):
        return server.q(sql, args)

    def chat(self, client, text, conv="c" * 20, consent=True, history=()):
        msgs = list(history) + [{"role": "user", "content": text}]
        return client.post("/api/widget/public/%s/chat" % self.site["siteId"], content=json.dumps(
            {"conversationId": conv, "visitorId": "v" * 20, "consent": consent, "messages": msgs,
             "page": {"url": "https://arominco.com/product/pos-1?utm_source=ig", "title": "صندوق فروشگاهی"}}),
            headers={"Content-Type": "text/plain"})

    def test_full_path(self):
        from fastapi.testclient import TestClient
        client = TestClient(server.app)
        server.agent_save("team", {"enabled": True, "routing": {"recipients": {"telegram": ["123456"], "bale": ["777777"]}}}, "test")
        # 1) widget config exposes proactive trigger + greeting templates (no recipients)
        cfg = client.get("/api/widget/public/%s/config" % self.site["siteId"]).json()
        self.assertTrue(cfg["agent"]["proactive"])
        self.assertTrue(cfg["agent"]["triggers"])
        self.assertIn("صبح بخیر", cfg["agent"]["greetings"]["morning"])
        self.assertNotIn("777777", json.dumps(cfg))
        ev = client.post("/api/widget/public/%s/event" % self.site["siteId"], content=json.dumps({"event": "trigger_fired", "props": {"trigger": "time-30"}}))
        self.assertTrue(ev.json()["ok"])
        # 2) conversation: assistant still answers; then lead block -> persisted with score
        replies = iter([{"ok": True, "text": "سلام! صندوق فروشگاهی ما برای رستوران مناسب است. اسمتان؟"},
                        {"ok": True, "text": "ممنون، کارشناس تماس می‌گیرد.\n```lead {\"name\": \"علی رضایی\", \"phone\": \"09121234567\", "
                                             "\"businessType\": \"رستوران\", \"city\": \"تهران\", \"need\": \"صندوق\", \"intent\": \"buy\", \"consent\": true, "
                                             "\"summary\": \"خرید صندوق\"}```"}])
        with patch.object(server, "ai_chat", side_effect=lambda *a, **k: next(replies)):
            r1 = self.chat(client, "قیمت صندوق برای رستوران؟")
            self.assertEqual(r1.status_code, 200)
            self.assertIn("صندوق", r1.json()["text"])
            r2 = self.chat(client, "علی رضایی هستم 09121234567", history=[{"role": "user", "content": "قیمت صندوق برای رستوران؟"},
                                                                            {"role": "assistant", "content": r1.json()["text"]}])
        self.assertEqual(r2.status_code, 200)
        self.assertNotIn("```", r2.json()["text"])
        self.assertTrue(r2.json()["lead"]["ok"])
        lead = self.rows("SELECT * FROM sa_leads")[0]
        self.assertEqual((lead["name"], lead["phone"], lead["intent"], lead["consent"]), ("علی رضایی", "09121234567", "buy", 1))
        self.assertGreaterEqual(lead["lead_score"], 70)
        self.assertEqual(lead["source_url"], "https://arominco.com/product/pos-1?utm_source=ig")
        # consented training sample is PII-redacted
        tr = self.rows("SELECT messages FROM agent_training")[0]["messages"]
        self.assertNotIn("09121234567", tr)
        jl = server.agent_ft_export("team")
        self.assertIn('"role": "system"', jl)
        self.assertNotIn("09121234567", jl)
        # 3) handoff queued on Telegram + Bale (summary only, no transcript)
        notes = self.rows("SELECT * FROM sa_notifications WHERE kind LIKE 'handoff_%' ORDER BY kind")
        self.assertEqual([n["kind"] for n in notes], ["handoff_bale", "handoff_tg"])
        self.assertTrue(all(n["body"].startswith("🔥 لید جدید آرومین") for n in notes))
        self.assertNotIn("قیمت صندوق برای رستوران؟", notes[0]["body"])
        # 4) delivery: Telegram fails once (retry), Bale ok; second pass Telegram ok
        calls = []

        def send(ch, chat, text):
            calls.append((ch, chat))
            if ch == "tg" and len([c for c in calls if c[0] == "tg"]) == 1:
                raise server.LeadAlertError("اتصال برقرار نشد (timeout)")
        with patch.object(server, "lead_send", side_effect=send):
            server.sa_process_notifications()
            st = {n["kind"]: (n["status"], n["attempts"]) for n in self.rows("SELECT kind, status, attempts FROM sa_notifications")}
            self.assertEqual(st, {"handoff_bale": ("sent", 1), "handoff_tg": ("pending", 1)})
            server.q("UPDATE sa_notifications SET next_at=%s", (server._sa_now(),))
            server.sa_process_notifications()
        st = {n["kind"]: n["status"] for n in self.rows("SELECT kind, status FROM sa_notifications")}
        self.assertEqual(st, {"handoff_bale": "sent", "handoff_tg": "sent"})
        self.assertIn(("bale", 777777), calls)
        self.assertIn(("tg", 123456), calls)
        # permanent failure -> failed after max tries, lead kept
        server.q("UPDATE sa_notifications SET status='pending', attempts=0, next_at=%s WHERE kind='handoff_tg'", (server._sa_now(),))
        with patch.object(server, "lead_send", side_effect=server.LeadAlertError("HTTP 403 Forbidden", final=True)):
            server.sa_process_notifications()
        self.assertEqual(self.rows("SELECT status FROM sa_notifications WHERE kind='handoff_tg'")[0]["status"], "failed")
        self.assertEqual(len(self.rows("SELECT id FROM sa_leads")), 1)
        # 5) disabling the agent stops delivery of pending handoffs
        server.q("UPDATE sa_notifications SET status='pending', attempts=0, next_at=%s", (server._sa_now(),))
        server.agent_save("team", {"enabled": False}, "test")
        with patch.object(server, "lead_send") as ls:
            server.sa_process_notifications()
        ls.assert_not_called()
        self.assertEqual({n["status"] for n in self.rows("SELECT status FROM sa_notifications")}, {"cancelled"})
        self.assertNotIn("agent", client.get("/api/widget/public/%s/config" % self.site["siteId"]).json())
        ev = {r["event"] for r in self.rows("SELECT event FROM agent_events")}
        self.assertTrue({"trigger_fired", "conversation_started", "lead_captured", "lead_qualified", "handoff_queued",
                         "delivery_success", "delivery_failed"} <= ev)
        props = " ".join(r["props"] or "" for r in self.rows("SELECT props FROM agent_events"))
        self.assertNotIn("0912", props)

    def test_no_recipient_is_visible_and_lead_kept(self):
        server.agent_save("team", {"enabled": True, "routing": {"bale": False}}, "test")
        r = server.sa_create_lead("team", {"name": "سارا", "phone": "09351234567", "productInterest": "نرم‌افزار"})
        self.assertTrue(r["ok"])
        with patch.object(server, "lead_send") as ls:
            server.sa_process_notifications()
        ls.assert_not_called()
        n = self.rows("SELECT status, last_error FROM sa_notifications WHERE kind='handoff_tg'")[0]
        self.assertEqual(n["status"], "failed")
        self.assertIn("گیرنده", n["last_error"])
        self.assertEqual(self.rows("SELECT lead_score FROM sa_leads")[0]["lead_score"], 50)

    def test_dedupe_same_phone(self):
        server.agent_save("team", {"enabled": True, "routing": {"recipients": {"telegram": ["123456"], "bale": ["777777"]}}}, "test")
        a = server.sa_create_lead("team", {"name": "سارا", "phone": "09351234567"})
        b = server.sa_create_lead("team", {"name": "سارا", "phone": "09351234567", "city": "شیراز"})
        self.assertFalse(a["duplicate"])
        self.assertTrue(b["duplicate"])
        self.assertEqual(len(self.rows("SELECT id FROM sa_leads")), 1)
        self.assertEqual(len(self.rows("SELECT id FROM sa_notifications WHERE kind LIKE 'handoff_%'")), 2)


if __name__ == "__main__":
    unittest.main()
