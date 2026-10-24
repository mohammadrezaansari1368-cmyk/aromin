"""3.9.67: agent skills from GitHub (SKILL.md). Network mocked; fake password; no secrets."""
import base64
import io
import json
import sys
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

SHA = "a" * 40
SKILL = "---\nname: pricing-objections\ndescription: پاسخ به اعتراضِ قیمت\n---\n# اعتراضِ قیمت\nاول ارزش را بگو، بعد قیمت را.\n"
USERS = {"boss": {"role": "manager", "pass_hash": server._hash_password("correct-horse")}}


def fake_get(url, accept="*/*", limit=server.SKILL_FETCH_MAX):
    if "/commits/" in url:
        return SHA.encode()
    if "/contents/" in url:
        return json.dumps([{"name": "SKILL.md", "path": "skills/p/SKILL.md"}, {"name": "run.py", "path": "skills/p/scripts/run.py"},
                           {"name": "ref.md", "path": "skills/p/ref.md"}]).encode()
    assert url == "https://raw.githubusercontent.com/o/r/%s/skills/p/SKILL.md" % SHA, url      # pinned to the commit, never a branch
    return SKILL.encode()


class Parse(unittest.TestCase):
    def test_frontmatter_and_guards(self):
        sk = server.skill_parse(SKILL, {"url": "x"})
        self.assertEqual((sk["name"], sk["description"]), ("pricing-objections", "پاسخ به اعتراضِ قیمت"))
        self.assertTrue(sk["body"].startswith("# اعتراضِ قیمت"))
        self.assertEqual(server.skill_parse("# فقط عنوان\nمتن", {"upload": "a"})["name"], "فقط عنوان")
        for bad in ("", "---\nname: x\n---\n", SKILL + "\nkey: sk-" + "A" * 30, SKILL + "x" * (server.SKILL_BODY_MAX + 1)):
            with self.assertRaises(server.SkillError):
                server.skill_parse(bad, {"upload": "a"})

    def test_fetch_pins_sha_and_lists_scripts_as_not_run(self):
        with patch.object(server, "_skill_get", side_effect=fake_get):
            sk = server.skill_fetch("https://github.com/o/r/tree/main/skills/p")
        self.assertEqual(sk["source"]["sha"], SHA)
        self.assertIn(SHA, sk["source"]["url"])
        self.assertEqual(sk["notRun"], ["skills/p/scripts/run.py"])
        self.assertIn("skills/p/ref.md", sk["ignored"])

    def test_only_github_https_and_no_foreign_redirects(self):
        for u in ("http://github.com/o/r", "https://gitlab.com/o/r", "https://evil.example/o/r"):
            with self.assertRaises(server.SkillError):
                server.skill_resolve(u)
        with self.assertRaises(server.SkillError):
            server._skill_get("https://example.com/x")
        h = server._SkillRedirects()
        with self.assertRaises(server.SkillError):
            h.redirect_request(None, None, 302, "", {}, "https://evil.example/SKILL.md")

    def test_zip_upload_reads_only_skill_md(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("p/SKILL.md", SKILL); z.writestr("p/scripts/hack.sh", "rm -rf /"); z.writestr("p/notes.md", "x")
        sk = server.skill_from_upload("p.zip", base64.b64encode(buf.getvalue()).decode())
        self.assertEqual(sk["name"], "pricing-objections")
        self.assertEqual(sk["notRun"], ["p/scripts/hack.sh"])
        self.assertNotIn("rm -rf", json.dumps(sk))
        with self.assertRaises(server.SkillError):
            server.skill_from_upload("x.exe", base64.b64encode(b"MZ").decode())


class Endpoints(unittest.TestCase):
    def setUp(self):
        self.store = {}
        self.ident = {"user": "boss", "name": "مدیر", "role": "manager", "tenant": "team"}
        self.ev = []

        def cfg(tenant, fresh=False):
            return server.agent_norm(json.loads(self.store["data"])) if "data" in self.store else server.agent_norm(None)

        def save(tenant, reg, by):
            c = cfg(tenant); c["agents"] = reg; self.store["data"] = json.dumps(c, ensure_ascii=False); return cfg(tenant)
        self.p = [patch.object(server, "kb_identity", side_effect=lambda r, t: self.ident), patch.object(server, "_kb_directory", return_value=(USERS, [])),
                  patch.object(server, "agent_cfg", side_effect=cfg), patch.object(server, "agent_save_installed", side_effect=save),
                  patch.object(server, "_skill_get", side_effect=fake_get), patch.object(server, "agent_event", side_effect=lambda *a, **k: self.ev.append(a))]
        for x in self.p:
            x.start()
        server._w_hits.clear()
        self.c = TestClient(server.app)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()

    def post(self, path, **b):
        return self.c.post("/api/agent/skills/" + path, json=dict({"tenant": "team", "url": "https://github.com/o/r/tree/main/skills/p"}, **b))

    def test_preview_saves_nothing_install_needs_password_and_ships_disabled(self):
        r = self.post("preview")
        self.assertEqual(r.json()["skill"]["name"], "pricing-objections")
        self.assertNotIn("data", self.store)
        self.assertEqual(self.post("install", agents=["sales"]).status_code, 403)
        self.assertEqual(self.post("install", agents=["sales"], password="wrong").status_code, 403)
        r = self.post("install", agents=["sales", "online_expert"], password="correct-horse").json()
        self.assertEqual(r["agents"], ["sales", "online_expert"])
        reg = server.agent_cfg("team")["agents"]
        sk = reg["sales"]["installed"][0]
        self.assertFalse(sk["enabled"])
        self.assertEqual(sk["source"]["sha"], SHA)
        self.assertEqual([e[2] for e in self.ev], ["skill_install", "skill_install"])
        self.assertNotIn("اول ارزش", json.dumps(self.ev, ensure_ascii=False))                  # skill text never in telemetry
        self.ident["role"] = "sales"
        self.assertEqual(self.post("preview").status_code, 403)

    def test_enable_via_card_only_toggles_and_runtime_block_keeps_actions(self):
        self.post("install", agents=["sales"], password="correct-horse")
        cur = server.agent_cfg("team")
        sid = cur["agents"]["sales"]["installed"][0]["id"]
        # the card sends back the list: it may only switch it on, never inject text or new skills
        sent = {"agents": {"sales": {"enabled": True, "installed": [{"id": sid, "enabled": True, "body": "تزریق"},
                                                                   {"id": "b" * 12, "enabled": True, "body": "مهارتِ جعلی", "name": "x"}]}}}
        self.assertEqual(server.agent_validate(sent), [])
        new = server.agent_norm(sent, cur)
        inst = new["agents"]["sales"]["installed"]
        self.assertEqual([(x["id"], x["enabled"]) for x in inst], [(sid, True)])
        self.assertNotIn("تزریق", json.dumps(inst, ensure_ascii=False))
        with patch.object(server, "agent_cfg", return_value=dict(new, enabled=True)), patch.object(server, "sa_prompt", return_value=""):
            spec = server.agent_spec("team", {"agent": "sales", "reason": "rule", "from": None, "handoff": False}, [])
        self.assertIn("[مهارتِ نصب‌شده — دستورالعمل، نه داده] «pricing-objections»", spec["persona"])
        self.assertLess(spec["persona"].index("مهارتِ نصب‌شده"), spec["persona"].index("فقط این کارها مجاز است"))
        self.assertEqual(spec["actions"], server.AGENT_REGISTRY_DEFAULTS["sales"]["actions"])      # never widened
        self.assertEqual(spec["scope"], server.AGENT_REGISTRY_DEFAULTS["sales"]["ragScope"])

    def test_update_shows_diff_and_remove(self):
        self.post("install", agents=["sales"], password="correct-horse")
        sid = server.agent_cfg("team")["agents"]["sales"]["installed"][0]["id"]
        changed = SKILL.replace("اول ارزش را بگو", "اول نیاز را بپرس")
        with patch.object(server, "_skill_get", side_effect=lambda u, a="*/*", l=0: changed.encode() if "raw." in u else fake_get(u, a)):
            d = self.post("preview", agent="sales", replaceId=sid).json()["diff"]
            self.assertIn("+اول نیاز را بپرس", d); self.assertIn("-اول ارزش را بگو", d)
            self.post("install", agents=["sales"], password="correct-horse", replaceId=sid)
        inst = server.agent_cfg("team")["agents"]["sales"]["installed"]
        self.assertEqual(len(inst), 1); self.assertIn("اول نیاز", inst[0]["body"])
        self.assertTrue(self.c.post("/api/agent/skills/remove", json={"tenant": "team", "agent": "sales", "id": sid}).json()["removed"])
        self.assertEqual(server.agent_cfg("team")["agents"]["sales"]["installed"], [])
        self.assertEqual(self.ev[-1][2], "skill_remove")


if __name__ == "__main__":
    unittest.main()
