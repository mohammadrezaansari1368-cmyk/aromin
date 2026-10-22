"""3.9.66: recipients by mobile (resolved via the «/start <code>» person links) and release upload from the dashboard (SHA-256 + version).
SQLite fake + temp dirs; synthetic phones and fake token; no network."""
import base64
import hashlib
import io
import os
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import server  # noqa: E402
from db_fake import Connection  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

PEOPLE = [{"id": "p1", "name": "سارا", "role": "sales", "mobile": "0912 111 2233"}, {"id": "p2", "name": "علی", "role": "manager", "mobile": "09125556677"}]
FAKE_UPDATE = "u" * 40


class Phones(unittest.TestCase):
    def test_normalise_and_validate(self):
        self.assertEqual(server.agent_phone("۰۹۱۲۱۱۱۲۲۳۳"), "09121112233")
        self.assertEqual(server.agent_phone("+98 912 111 2233"), "09121112233")
        self.assertEqual(server.agent_phone("00989121112233"), "09121112233")
        self.assertEqual(server.agent_phone("9121112233"), "")                     # bare digits stay a chat id
        self.assertEqual(server.agent_phone("-100123456"), "")
        self.assertEqual(server._agent_ids("۰۹۱۲۱۱۱۲۲۳۳، -100123, @team_x, 09121112233"), ["09121112233", "-100123", "@team_x"])
        errs = []
        server._agent_bad_ids("09121112233, +989121112233, abc", "گیرنده‌های بله", errs)
        self.assertEqual(len(errs), 1)
        self.assertIn("abc", errs[0])
        self.assertIn("موبایل", errs[0])


class Resolve(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.dir.name, "t.db")
        cx = Connection(self.db)
        cx.connection.execute("CREATE TABLE sa_chat_links (tenant TEXT, person_id TEXT, code TEXT, created_at TIMESTAMP, telegram_chat_id INTEGER,"
                              " telegram_linked_at TIMESTAMP, bale_chat_id INTEGER, bale_linked_at TIMESTAMP, PRIMARY KEY (tenant, person_id))")
        cx.connection.commit(); cx.close()
        self.p = [patch.object(server, "db_conn", lambda: Connection(self.db)), patch.object(server, "lead_alert_tables", return_value=True),
                  patch.object(server, "_sa_people", return_value=PEOPLE)]
        for x in self.p:
            x.start()

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        self.dir.cleanup()

    def link(self, pid, chat):
        code = server.lead_link_code("team", pid)
        with patch.object(server, "lead_send"):
            server.lead_link_start("bale", chat, code)
        return code

    def test_linked_team_member_and_free_phone_resolve(self):
        self.assertEqual(server.agent_resolve_chat("team", "bale", "-100123"), ("-100123", None))   # chat ids unchanged
        chat, why = server.agent_resolve_chat("team", "bale", "09121112233")
        self.assertIsNone(chat)
        self.assertIn("0912…233", why)
        self.link("p1", 4242)                                                       # Sara taps her link once
        self.assertEqual(server.agent_resolve_chat("team", "bale", "09121112233"), ("4242", None))
        self.assertIsNone(server.agent_resolve_chat("team", "tg", "09121112233")[0])   # per channel
        self.link("phone:09350000001", 777)                                          # not a team member → keyed by phone
        self.assertEqual(server.agent_resolve_chat("team", "bale", "09350000001")[0], "777")

    def test_handoff_delivery_uses_the_resolver_and_never_sends_unlinked(self):
        cfg = server.agent_norm({"enabled": True, "routing": {"bale": True, "recipients": {"bale": ["09121112233"]}}})
        n = {"tenant": "team", "kind": "handoff_bale", "recipient": "09121112233", "body": "لید"}
        with patch.object(server, "agent_cfg", return_value=cfg), patch.object(server, "lead_send") as send:
            ok, why, final = server.agent_deliver(n)
            self.assertEqual((ok, final), (False, True))
            self.assertIn("وصل نشده", why)
            send.assert_not_called()
            self.link("p1", 4242)
            send.reset_mock()
            self.assertEqual(server.agent_deliver(n)[0], True)
            self.assertEqual(send.call_args.args[:2], ("bale", 4242))

    def test_link_status_endpoint_is_admin_only(self):
        cfg = server.agent_norm({"routing": {"recipients": {"bale": ["09121112233", "-100123"], "telegram": ["09350000001"]}}})
        ident = {"user": "boss", "name": "م", "role": "manager", "tenant": "team"}
        with patch.object(server, "agent_cfg", return_value=cfg), patch.object(server, "kb_identity", side_effect=lambda r, t: ident), \
                patch.object(server, "_bale_bot_username", return_value="arominbot"):
            c = TestClient(server.app)
            self.link("p1", 4242)
            out = c.get("/api/agent/recipient-links?tenant=team").json()["recipients"]
            self.assertEqual([(x["phone"], x["name"], x["baleLinked"]) for x in out], [("09121112233", "سارا", True), ("09350000001", "", False)])
            self.assertTrue(out[1]["baleLink"].startswith("https://ble.ir/arominbot?start="))
            ident.update(role="sales")
            self.assertEqual(c.get("/api/agent/recipient-links?tenant=team").status_code, 403)


def tgz(version='3.9.66'):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for name, body in (("aromin-deploy/install.sh", b"#!/bin/bash\n"), ("aromin-deploy/legacy.html", ('var APP_VERSION = "%s"; آرومین' % version).encode())):
            ti = tarfile.TarInfo(name); ti.size = len(body); tf.addfile(ti, io.BytesIO(body))
    return buf.getvalue()


class Release(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.p = [patch.object(server, "RELEASE_DIR", self.dir.name), patch.object(server, "secret_get", side_effect=lambda n: FAKE_UPDATE if n == "update_token" else "")]
        for x in self.p:
            x.start()
        self.c = TestClient(server.app)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()
        self.dir.cleanup()

    def send(self, data, sha, rid="rel0001"):
        half = len(data) // 2
        parts = [data[:half], data[half:]]
        out = None
        for i, part in enumerate(parts):
            out = self.c.post("/api/release/chunk", headers={"x-update-token": FAKE_UPDATE},
                              json={"id": rid, "i": i, "n": 2, "data": base64.b64encode(part).decode(), "sha256": sha})
        return out

    def incoming(self):
        d = os.path.join(self.dir.name, "incoming")
        return os.listdir(d) if os.path.isdir(d) else []

    def test_sha_mismatch_rejected_and_nothing_queued(self):
        r = self.send(tgz(), "0" * 64)
        self.assertEqual((r.status_code, r.json()["error"]), (400, "sha_mismatch"))
        self.assertEqual(self.incoming(), [])

    def test_good_package_reports_version_and_is_queued(self):
        data = tgz()
        r = self.send(data, hashlib.sha256(data).hexdigest()).json()
        self.assertEqual((r["complete"], r["version"], r["sha256"]), (True, "3.9.66", hashlib.sha256(data).hexdigest()))
        self.assertEqual(self.incoming(), ["aromin-rel0001.tgz"])
        self.assertEqual(self.c.post("/api/release/chunk", headers={"x-update-token": "wrong"}, json={"id": "x" * 8, "i": 0, "n": 1, "data": ""}).status_code, 401)

    def test_package_without_version_rejected(self):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tf:
            ti = tarfile.TarInfo("aromin-deploy/install.sh"); ti.size = 1; tf.addfile(ti, io.BytesIO(b"x"))
        data = buf.getvalue()
        r = self.send(data, hashlib.sha256(data).hexdigest(), "rel0002")
        self.assertEqual(r.json()["error"], "bad_package")
        self.assertEqual(self.incoming(), [])


class VersionChecks(unittest.TestCase):
    def test_spaced_app_version_is_accepted(self):
        html = 'x' * 2000 + 'var APP_VERSION = "3.9.66"; آرومین'
        self.assertEqual(server.app_version_of(html), "3.9.66")
        sh = (Path(server.HERE) / "aromin-autoupdate.sh").read_text(encoding="utf-8")
        self.assertIn("""grep -qE 'APP_VERSION *= *"[0-9.]+"'""", sh)
        self.assertNotIn("grep -q 'APP_VERSION='", sh)
        legacy = (Path(server.HERE) / "legacy.html").read_text(encoding="utf-8-sig")
        self.assertIsNotNone(server.app_version_of(legacy))                     # the shipped file passes the server check


if __name__ == "__main__":
    unittest.main()
