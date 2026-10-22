"""3.9.63: tokens set from Settings (write-once then locked, encrypted, audited), Bale group picker, relay URL, test message,
homepage trigger seed, chat preview dry-run and per-stage timing. SQLite fake; synthetic values only; no network."""
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
from fastapi.testclient import TestClient  # noqa: E402

KEY = "k" * 48
FAKE_BALE = "1234567:" + "A" * 35            # synthetic, matches the bot-token shape only
FAKE_BALE2 = "7654321:" + "B" * 35
MGR = {"user": "boss", "name": "مدیر", "role": "manager", "tenant": "team"}
USERS = {"boss": {"role": "manager", "pass_hash": server._hash_password("correct-horse")}}


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.dir.name, "t.db")
        load_schema(Path(server.HERE) / "migrations/012_app_secrets.sql", self.db)
        cx = Connection(self.db)
        cx.connection.execute("CREATE TABLE sa_state (tenant VARCHAR(64), k VARCHAR(60), v TEXT, PRIMARY KEY (tenant, k))")
        cx.connection.commit(); cx.close()
        self.ident = dict(MGR)
        self.p = [patch.object(server, "db_conn", lambda: Connection(self.db)), patch.dict(server._secret_ready, {"ok": True}),
                  patch.dict(server._lead_ready, {"ok": True}), patch.object(server, "kb_identity", side_effect=lambda r, t: self.ident),
                  patch.object(server, "_kb_directory", return_value=(USERS, [])), patch.dict(os.environ, {"AROMIN_SECRETS_KEY": KEY}),
                  patch.object(server, "LEADS_BALE_TOKEN", ""), patch.object(server, "LEADS_TG_TOKEN", ""), patch.object(server, "UPDATE_TOKEN", "")]
        for x in self.p:
            x.start()
        server._secret_cache.clear(); server._w_hits.clear()
        self.c = TestClient(server.app)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        server._secret_cache.clear()
        self.dir.cleanup()

    def rows(self, sql):
        cx = Connection(self.db)
        try:
            return [dict(r) for r in cx.connection.execute(sql).fetchall()]
        finally:
            cx.close()

    def post(self, path, **body):
        return self.c.post("/api/settings/messengers" + path, json=dict({"tenant": "team"}, **body))


class Crypto(Base):
    def test_roundtrip_tamper_and_missing_key(self):
        blob = server.secret_encrypt(FAKE_BALE)
        self.assertNotIn(FAKE_BALE, blob)
        self.assertEqual(server.secret_decrypt(blob), FAKE_BALE)
        self.assertNotEqual(server.secret_encrypt(FAKE_BALE), blob)               # random nonce
        bad = blob[:-6] + ("A" if blob[-6] != "A" else "B") + blob[-5:]
        self.assertIsNone(server.secret_decrypt(bad))                             # MAC check
        with patch.dict(os.environ, {"AROMIN_SECRETS_KEY": "z" * 48}):
            self.assertIsNone(server.secret_decrypt(blob))                        # another key cannot read it
        with patch.dict(os.environ, {"AROMIN_SECRETS_KEY": ""}):
            with self.assertRaises(server.SecretError):
                server.secret_encrypt(FAKE_BALE)


class Lifecycle(Base):
    def test_set_lock_replace_clear_audit_never_returns_secret(self):
        g = self.c.get("/api/settings/messengers?tenant=team")
        self.assertEqual(g.status_code, 200)
        self.assertFalse(g.json()["secrets"]["bale_leads"]["set"])
        r = self.post("/secret", name="bale_leads", value=FAKE_BALE)
        self.assertEqual(r.status_code, 200)
        meta = r.json()["secret"]
        self.assertEqual((meta["set"], meta["source"], meta["last4"], meta["setBy"]), (True, "settings", FAKE_BALE[-4:], "مدیر"))
        body = self.c.get("/api/settings/messengers?tenant=team").text
        self.assertNotIn(FAKE_BALE, body)
        self.assertNotIn(FAKE_BALE, json.dumps(self.rows("SELECT * FROM app_secrets"), default=str))   # encrypted at rest
        self.assertEqual(server.secret_get("bale_leads"), FAKE_BALE)
        # locked: replacing without / with a wrong password is refused, nothing changes
        self.assertEqual(self.post("/secret", name="bale_leads", value=FAKE_BALE2).status_code, 403)
        self.assertEqual(self.post("/secret", name="bale_leads", value=FAKE_BALE2, password="wrong").status_code, 403)
        self.assertEqual(server.secret_get("bale_leads"), FAKE_BALE)
        r = self.post("/secret", name="bale_leads", value=FAKE_BALE2, password="correct-horse")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(server.secret_get("bale_leads"), FAKE_BALE2)                # picked up without restart
        self.assertEqual(self.post("/secret/clear", name="bale_leads").status_code, 403)
        self.assertTrue(self.post("/secret/clear", name="bale_leads", password="correct-horse").json()["cleared"])
        audit = [(a["action"], a["last4"], a["actor"]) for a in self.rows("SELECT action, last4, actor FROM secret_audit ORDER BY id")]
        self.assertEqual(audit, [("set", FAKE_BALE[-4:], "مدیر"), ("replace", FAKE_BALE2[-4:], "مدیر"), ("clear", FAKE_BALE2[-4:], "مدیر")])
        self.assertNotIn(FAKE_BALE2[:-4], json.dumps(self.rows("SELECT * FROM secret_audit"), default=str))

    def test_env_fallback_format_missing_key_and_roles(self):
        with patch.object(server, "LEADS_BALE_TOKEN", FAKE_BALE):
            self.assertEqual(server.secret_get("bale_leads"), FAKE_BALE)
            meta = self.c.get("/api/settings/messengers?tenant=team").json()["secrets"]["bale_leads"]
            self.assertEqual((meta["source"], meta["last4"]), ("env", FAKE_BALE[-4:]))
        self.assertEqual(self.post("/secret", name="bale_leads", value="not a token").status_code, 400)
        self.assertEqual(self.post("/secret", name="nope", value=FAKE_BALE).status_code, 400)
        with patch.dict(os.environ, {"AROMIN_SECRETS_KEY": ""}):
            r = self.post("/secret", name="bale_leads", value=FAKE_BALE)
            self.assertEqual(r.status_code, 503)
            self.assertIn("کلید رمزنگاری", r.json()["error"])
            self.assertFalse(self.c.get("/api/settings/messengers?tenant=team").json()["keyConfigured"])
        self.ident = {"user": "s", "role": "sales", "tenant": "team"}
        for call in (lambda: self.c.get("/api/settings/messengers?tenant=team"), lambda: self.post("/secret", name="bale_leads", value=FAKE_BALE)):
            self.assertEqual(call().status_code, 403)
        self.ident = None
        self.assertEqual(self.c.get("/api/settings/messengers?tenant=team").status_code, 401)

    def test_update_token_generate_once_and_used_by_update_endpoints(self):
        r = self.post("/secret/generate", name="update_token")
        self.assertEqual(r.status_code, 200)
        value = r.json()["value"]
        self.assertEqual(len(value), 64)
        self.assertEqual(r.headers.get("cache-control"), "no-store")
        self.assertNotIn(value, self.c.get("/api/settings/messengers?tenant=team").text)
        self.assertEqual(self.post("/secret/generate", name="update_token").status_code, 403)   # rotation needs re-auth
        self.assertEqual(server.secret_get("update_token"), value)
        self.assertTrue(self.c.get("/api/app-update/ping").json()["enabled"])
        self.assertEqual(self.post("/secret/generate", name="bale_leads", password="correct-horse").status_code, 400)

    def test_delivery_and_redaction_use_settings_token(self):
        self.post("/secret", name="bale_leads", value=FAKE_BALE)
        seen = {}
        with patch.object(server, "_lead_bot_call", side_effect=lambda base, tok, m, f, **k: seen.update(tok=tok, base=base) or {"message_id": 5}):
            server.lead_bale_call("sendMessage", {"chat_id": 1, "text": "x"})
        self.assertEqual(seen["tok"], FAKE_BALE)
        self.assertNotIn(FAKE_BALE, server.lead_redact("error at /bot%s/sendMessage" % FAKE_BALE))


class Messengers(Base):
    def test_bale_poller_remembers_groups_without_text(self):
        self.post("/secret", name="bale_leads", value=FAKE_BALE)
        ups = [{"update_id": 10, "message": {"text": "پیامِ محرمانهٔ گروه", "chat": {"id": -100123, "type": "group", "title": "گروه تست"}}},
               {"update_id": 11, "message": {"text": "سلام", "chat": {"id": 55, "type": "private"}}}]
        with patch.object(server, "lead_bale_call", return_value=ups), patch.object(server, "lead_alert_tables", return_value=True):
            server.bale_lead_poll()
        chats = server.bale_chats_seen()
        self.assertEqual([(c["id"], c["type"], c["title"]) for c in chats], [(-100123, "group", "گروه تست")])
        self.assertNotIn("محرمانه", json.dumps(self.rows("SELECT * FROM sa_state"), default=str))
        self.assertEqual(self.rows("SELECT v FROM sa_state WHERE k='bale_offset'")[0]["v"], "12")   # still the single consumer
        self.assertEqual(self.c.get("/api/settings/messengers?tenant=team").json()["baleChats"][0]["id"], -100123)

    def test_relay_url_check_and_test_message(self):
        self.assertEqual(self.post("/telegram-base", url="http://insecure.example").status_code, 400)
        self.assertEqual(self.post("/telegram-base", url="https://relay.example.com/tg").json()["telegramApiBase"], "https://relay.example.com/tg")
        self.assertEqual(server.tg_api_base(), "https://relay.example.com/tg")
        with patch.object(server, "_messenger_reach", return_value=(False, "در دسترس نیست (URLError)")) as reach:
            out = self.post("/check", channel="telegram").json()
        reach.assert_called_once_with("https://relay.example.com/tg")                # no getMe / token for Telegram
        self.assertFalse(out["ok"])
        self.post("/telegram-base", url="")
        self.assertEqual(server.tg_api_base(), server.TG_API_BASE)
        self.post("/secret", name="bale_leads", value=FAKE_BALE)
        with patch.object(server, "agent_cfg", return_value={"routing": {"recipients": {"bale": ["-100123"], "telegram": []}}}), \
                patch.object(server, "lead_send", return_value={"message_id": 77}) as send:
            r = self.post("/test", channel="bale").json()
        self.assertEqual(r["results"], [{"to": "-100123", "ok": True, "messageId": 77}])
        self.assertTrue(send.call_args.args[2].startswith("🔥 لید آزمایشی آرومین"))
        with patch.object(server, "agent_cfg", return_value={"routing": {"recipients": {"telegram": []}}}):
            self.assertFalse(self.post("/test", channel="telegram").json()["ok"])


class Seed(unittest.TestCase):
    def test_home_seed_once_never_overwrites(self):
        owner = {"enabled": False, "triggers": [{"id": "t30", "when": {"minSeconds": 30}}, {"id": "p", "when": {"path": "/product/"}}]}
        self.assertTrue(server.agent_seed(owner))
        self.assertEqual([t["id"] for t in owner["triggers"]], ["t30", "p", "home-first-tap", "home-8s"])
        self.assertEqual(owner["triggers"][2]["when"], {"pathExact": "/", "firstInteraction": True})
        self.assertFalse(owner["enabled"])                                       # the switch is untouched
        owner["triggers"] = owner["triggers"][:2]                                 # owner deletes them later
        self.assertFalse(server.agent_seed(owner))                                # never re-added
        has = {"triggers": [{"id": "mine", "when": {"pathExact": "/"}}]}
        server.agent_seed(has)
        self.assertEqual([t["id"] for t in has["triggers"]], ["mine"])           # owner already targets the homepage
        cfg = server.agent_norm(dict(owner))
        self.assertEqual(server.agent_validate(cfg), [])


class PreviewAndTiming(unittest.TestCase):
    def test_timing_log_has_stages_and_no_text(self):
        site = {"siteId": "a" * 20, "tenant": "team", "name": "آرومین"}
        with patch.object(server, "sa_products_ctx", return_value=("", None)), patch.object(server, "assistant_system", return_value="S"), \
                patch.object(server, "assistant_grounding", return_value=""), patch.object(server, "agent_enabled", return_value=False), \
                patch.object(server, "sa_prompt", return_value=""), patch.object(server, "ai_chat", return_value={"ok": True, "text": "پاسخ"}), \
                patch("builtins.print") as pr:
            out = server._sa_reply_turn(site, [{"role": "user", "content": "متنِ خصوصیِ مشتری 0912"}], {}, "c" * 20, "v" * 20)
        self.assertTrue(out["ok"])
        self.assertEqual(set(server.SA_TIMING_LAST) >= {"catalog", "knowledge", "grounding", "llm", "search", "total", "result"}, True)
        line = " ".join(str(a) for c in pr.call_args_list for a in c.args)
        self.assertIn("[SA] timing", line)
        self.assertNotIn("خصوصی", line)
        self.assertNotIn("0912", line)


class PreviewChat(unittest.TestCase):
    def test_preview_writes_no_event_no_training_and_runs_dry(self):
        site = {"siteId": "a" * 20, "tenant": "team", "name": "x"}
        body = {"conversationId": "c" * 20, "visitorId": "v" * 20, "messages": [{"role": "user", "content": "سلام"}], "preview": True, "consent": True}
        with patch.object(server, "_w_site_for", return_value=(site, "https://shop.test", None)), \
                patch.object(server, "_w_public_cfg", return_value={"enabled": True}), patch.object(server, "agent_enabled", return_value=True), \
                patch.object(server, "sa_enabled", return_value=True), patch.object(server, "_w_allow", return_value=True), \
                patch.object(server, "sa_reply", return_value={"ok": True, "text": "hi"}) as reply, \
                patch.object(server, "agent_event") as ev, patch.object(server, "agent_training_save") as tr, \
                patch.object(server, "sa_create_lead") as lead:
            c = TestClient(server.app)
            r = c.post("/api/widget/public/%s/chat" % site["siteId"], json=body)
            self.assertEqual(r.status_code, 200)
            self.assertIs(reply.call_args.args[-1], True)                       # dry_run: a proposed lead is not created
            ev.assert_not_called(); tr.assert_not_called(); lead.assert_not_called()
            body["preview"] = False
            c.post("/api/widget/public/%s/chat" % site["siteId"], json=body)
            self.assertIs(reply.call_args.args[-1], False)
            self.assertEqual(ev.call_args.args[2], "conversation_started")


class Migration012(unittest.TestCase):
    def test_up_down_idempotent_and_utf8mb4(self):
        import sqlite3
        mig = Path(server.HERE) / "migrations"
        up = (mig / "012_app_secrets.sql").read_text(encoding="utf-8")
        self.assertEqual(up.count("COLLATE=utf8mb4_unicode_ci"), 2)
        self.assertNotRegex(up, r"(?i)\b(ALTER|DROP)\b")                       # new tables only
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "m.db")
            def tables():
                cx = sqlite3.connect(db)
                try:
                    return sorted(r[0] for r in cx.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"))
                finally:
                    cx.close()
            for _ in range(2):
                load_schema(mig / "012_app_secrets.sql", db)
                self.assertEqual(tables(), ["app_secrets", "secret_audit"])
            for _ in range(2):
                load_schema(mig / "012_app_secrets.down.sql.txt", db)
                self.assertEqual(tables(), [])
            load_schema(mig / "012_app_secrets.sql", db)
            self.assertEqual(tables(), ["app_secrets", "secret_audit"])


if __name__ == "__main__":
    unittest.main()
