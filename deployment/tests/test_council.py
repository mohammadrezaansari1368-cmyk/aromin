"""3.9.71: «اتاق شورا» — seats only sit with knowledge (bundled brain or uploaded «دانشنامه»), the coach agent chairs, entries stay internal."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

DOCS = [("علوی-۱.md", "دکتر علوی: پیشنهاد را با ارزش شروع کن، نه با تخفیف. قیمت را با نتیجه توجیه کن.", "k1", ("council",), "alavi"),
        ("عمومی.md", "راهنمای فروش آرومین", "k2", ("sales_playbook",), "")]


def fake_ai(system, user, **kw):
    if "رئیسِ جلسهٔ" in system:
        return {"ok": True, "text": json.dumps({"label": "مشروط", "call": "اول آزمایش کن.", "carried": ["علوی: ارزش"], "dissent": "بافت: نقدینگی",
                                                "next": ["آزمایش ۲ هفته‌ای"]}, ensure_ascii=False)}
    return {"ok": True, "text": 'نظرم: {"stance":"موافق","score":8,"line":"با ارزش بفروش.","why":["الف","ب","ج","د"]}'}


class Council(unittest.TestCase):
    def setUp(self):
        self.ident = {"user": "boss", "role": "manager", "tenant": "team"}
        self.addCleanup(patch.stopall)
        patch.object(server, "kb_identity", side_effect=lambda r, t: self.ident).start()
        patch.object(server, "_kb_docs", side_effect=lambda t, public=False, scope=None: [d for d in DOCS if scope is None or set(scope) & set(d[3])]).start()
        patch.object(server, "dashboard_live", return_value={"today": "1405/07/30", "calls": None, "sources": {}}).start()
        self.ai = patch.object(server, "ai_chat", side_effect=fake_ai).start()
        patch.object(server, "agent_event").start()
        self.c = TestClient(server.app)

    def test_seats_ready_only_with_knowledge_and_managers_only(self):
        r = self.c.get("/api/council/seats?tenant=team").json()
        ready = {s["key"]: s["ready"] for s in r["seats"]}
        self.assertTrue(ready["alavi"] and ready["bezos"])
        self.assertFalse(ready["sadeghin"] or ready["raftari"])
        self.assertNotIn("parsi", ready); self.assertNotIn("soleimani", ready)
        self.assertNotIn("hormozi", ready)
        self.assertEqual(next(s for s in r["seats"] if s["key"] == "alavi")["entries"][0]["id"], "k1")
        self.ident = {"user": "s", "role": "sales", "tenant": "team"}
        self.assertEqual(self.c.get("/api/council/seats?tenant=team").status_code, 403)

    def test_ask_skips_empty_seats_and_coach_chairs(self):
        r = self.c.post("/api/council/ask?tenant=team", json={"question": "قیمت اشتراک را ۲۰٪ بالا ببریم؟", "seats": ["alavi", "sadeghin", "buffett"]}).json()
        self.assertEqual((r["seats"], r["skipped"]), (["alavi", "buffett"], ["sadeghin"]))
        self.assertEqual([c["score"] for c in r["cards"]], [8, 8])
        self.assertEqual(len(r["cards"][0]["why"]), 3)
        self.assertEqual(r["verdict"]["label"], "مشروط")
        chair_sys = self.ai.call_args_list[-1].args[0]
        self.assertIn(server.AGENT_REGISTRY_DEFAULTS["coach"]["prompt"], chair_sys)        # the coach agent chairs
        seat_sys = next(c.args[0] for c in self.ai.call_args_list if "مثلِ Dr. Yahya Alavi" in c.args[0])
        self.assertIn("پیشنهاد را با ارزش شروع کن", seat_sys)                                   # its own «دانشنامه» only
        self.assertEqual(self.c.post("/api/council/ask?tenant=team", json={"question": "قیمت را بالا ببریم؟", "seats": ["alavi", "raftari"]}).status_code, 400)

    def test_knowledge_entry_is_internal_council_and_tagged(self):
        put = patch.object(server, "_kb_put").start()
        patch.object(server, "_kb_invalidate").start()
        r = self.c.post("/api/council/knowledge?tenant=team", json={"seat": "raftari", "text": "رستوران‌دار به بازگشتِ سرمایه در ۶ ماه نگاه می‌کند."})
        self.assertEqual(r.status_code, 200)
        item = put.call_args.args[1]
        self.assertEqual((item["seat"], item["collections"], item["internal"]), ("raftari", ["council"], True))
        self.assertEqual(self.c.post("/api/council/knowledge?tenant=team", json={"seat": "hormozi", "text": "x"}).status_code, 400)

    def test_coach_scope_reads_council(self):
        spec = server.agent_spec("team", {"agent": "coach", "reason": "t"}, [], None, log=False)
        self.assertIn("council", spec["scope"])
        self.assertNotIn("council", server.agent_spec("team", {"agent": "support", "reason": "t"}, [], None, log=False)["scope"])


if __name__ == "__main__":
    unittest.main()
