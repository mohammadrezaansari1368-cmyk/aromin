"""3.9.73: Instagram via Composio — connect (password), refresh pipeline (above-average reels, inbox routed to agents, qualified lead → sales rep),
live events, manager-approved replies only. Composio, model and lead creation are fakes."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

MEDIA = [{"id": "m1", "media_product_type": "REELS", "caption": "۳ اشتباهِ صندوق‌داری؟\n#کافه", "timestamp": "2026-10-20T16:32:09+0000", "like_count": 40, "comments_count": 2, "view_count": 900, "permalink": "https://i/1"},
         {"id": "m2", "media_product_type": "REELS", "caption": "معرفی", "timestamp": "2026-10-19T16:52:54+0000", "like_count": 2, "comments_count": 0, "view_count": 100},
         {"id": "m3", "media_product_type": "REELS", "caption": "سلام", "timestamp": "2026-10-18T16:37:15+0000", "like_count": 1, "comments_count": 0, "view_count": 80}]
COMMENTS = [{"id": "c1", "text": "قیمت صندوق چنده؟", "username": "cafe_a"}, {"id": "c2", "text": "عالی بود 👏", "username": "b"},
            {"id": "c3", "text": "سلام شمارم 09121234567 برای مشاوره رستورانم", "username": "rest_c"}, {"id": "c4", "text": "ممنون", "username": "aromin.online"}]


def fake_composio(method, path, body=None, key=None, timeout=40):
    if path.startswith("/connected_accounts"):
        return {"items": [{"id": "ca_test", "status": "ACTIVE"}]}
    slug, args = path.rsplit("/", 1)[1], (body or {}).get("arguments") or {}
    calls.append((slug, args))
    data = {"INSTAGRAM_GET_USER_INFO": {"username": "aromin.online", "followers_count": 296, "media_count": 65},
            "INSTAGRAM_GET_IG_USER_MEDIA": {"data": MEDIA, "paging": {"cursors": {}}},
            "INSTAGRAM_GET_IG_MEDIA_COMMENTS": {"data": COMMENTS},
            "INSTAGRAM_LIST_ALL_CONVERSATIONS": {"data": []}}.get(slug, {})
    return {"successful": True, "data": data}


def fake_ai(system, user, **kw):
    items = json.loads(user.split("\n", 1)[1]) if user.startswith("[داده") else {}
    if "هفت ایده" in system:
        return {"ok": True, "text": json.dumps([{"day": "شنبه", "idea": "اشتباهات", "hook": "۳ اشتباهی که پولت را می‌برد", "format": "ریل"}], ensure_ascii=False)}
    if "reasons" in system:
        return {"ok": True, "text": json.dumps({"reasons": {"m1": "هوکِ سؤالی با عدد"}, "patterns": ["هوکِ عددی"]}, ensure_ascii=False)}
    rows = [{"id": x["id"], "reply": "پاسخ به " + x["from"]} for x in items]
    if "امتیازِ ۰ تا ۱۰۰" in system:
        rows = [dict(r, name="رستورانِ سی", phone="09121234567", need="مشاوره", score=80) for r in rows]
    return {"ok": True, "text": json.dumps(rows, ensure_ascii=False)}


calls = []


class Instagram(unittest.TestCase):
    def setUp(self):
        calls.clear()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.ident = {"user": "boss", "name": "مدیر", "role": "manager", "tenant": "team"}
        self.addCleanup(patch.stopall)
        patch.object(server, "_ig_path", side_effect=lambda t: os.path.join(tmp.name, "ig_%s.json" % t)).start()
        patch.object(server, "kb_identity", side_effect=lambda r, t: self.ident).start()
        patch.object(server, "_reauth_ok", side_effect=lambda i, t, p: p == "pw").start()
        patch.object(server, "_composio_req", side_effect=fake_composio).start()
        patch.object(server, "ai_chat", side_effect=fake_ai).start()
        patch.object(server, "kb_context", return_value="").start()
        patch.object(server, "agent_event").start()
        self.lead = patch.object(server, "sa_create_lead", return_value={"ok": True, "id": 7, "assignedTo": "نورا"}).start()
        server._ig_live.clear()
        self.c = TestClient(server.app)

    def test_connect_needs_password_and_saves_account(self):
        self.assertEqual(self.c.post("/api/instagram/connect?tenant=team", json={"password": "x"}).status_code, 403)
        r = self.c.post("/api/instagram/connect?tenant=team", json={"password": "pw"}).json()
        self.assertEqual(r["username"], "aromin.online")
        st = self.c.get("/api/instagram/status?tenant=team").json()
        self.assertTrue(st["connected"] and st["enabled"])
        self.ident = {"user": "s", "role": "sales", "tenant": "team"}
        self.assertEqual(self.c.get("/api/instagram/status?tenant=team").status_code, 403)

    def test_refresh_builds_panel_routes_agents_and_hands_off_lead(self):
        server.ig_save("team", {"account": "ca_test", "enabled": True})
        self.assertTrue(server.ig_refresh("team"))
        p = self.c.get("/api/instagram/panel?tenant=team").json()["panel"]
        self.assertEqual([a["id"] for a in p["analysis"]], ["m1"])
        self.assertEqual(p["analysis"][0]["reason"], "هوکِ سؤالی با عدد")
        by = {x["from"]: x for x in p["inbox"]}
        self.assertNotIn("aromin.online", by)                                   # own replies are not inbox
        self.assertEqual((by["cafe_a"]["agent"], by["b"]["agent"], by["rest_c"]["agent"]), ("sales", "quick_reply", "lead_gen"))
        self.assertTrue(by["rest_c"]["lead"]["handoff"])
        self.assertEqual(self.lead.call_args.args[1]["source"], "instagram")
        self.assertEqual(p["plan"][0]["hook"], "۳ اشتباهی که پولت را می‌برد")
        self.assertIn("🎯 1 لید", p["summary"])
        ev = self.c.get("/api/instagram/live?tenant=team&since=0").json()["events"]
        self.assertEqual(ev[-1]["kind"], "done")
        server.ig_refresh("team")
        self.assertEqual(self.lead.call_count, 1)                               # the same lead is not handed off twice
        self.assertFalse(any(s in ("INSTAGRAM_POST_IG_COMMENT_REPLIES", "INSTAGRAM_SEND_TEXT_MESSAGE") for s, _ in calls))   # nothing auto-sent

    def test_reply_only_on_manager_click_and_once(self):
        server.ig_save("team", {"account": "ca_test"})
        server.ig_refresh("team")
        r = self.c.post("/api/instagram/reply?tenant=team", json={"id": "c:c1", "text": "سلام، در دایرکت قیمت را می‌فرستیم."})
        self.assertEqual(r.json(), {"ok": True})
        self.assertEqual(calls[-1], ("INSTAGRAM_POST_IG_COMMENT_REPLIES", {"ig_comment_id": "c1", "message": "سلام، در دایرکت قیمت را می‌فرستیم."}))
        self.assertTrue(self.c.post("/api/instagram/reply?tenant=team", json={"id": "c:c1", "text": "دوباره"}).json()["duplicate"])
        self.assertEqual(self.c.post("/api/instagram/reply?tenant=team", json={"id": "c:zz", "text": "x"}).status_code, 400)

    def test_quick_reply_agent_and_composio_secret(self):
        self.assertIn("quick_reply", server.AGENT_KEYS)
        self.assertEqual(server.AGENT_ONLY_SURFACES["quick_reply"], ("dashboard",))
        self.assertEqual(server.SECRET_NAMES["composio_api"]["kind"], "apikey")


if __name__ == "__main__":
    unittest.main()
