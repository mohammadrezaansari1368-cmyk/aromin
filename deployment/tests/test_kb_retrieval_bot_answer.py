"""Offline tests: chunked top-k KB retrieval (replaces the 6,000-char cap) and POST /api/bot/answer (server-to-server)."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from fastapi.testclient import TestClient

FILLER = "متنِ پرکنندهٔ بی‌ربط دربارهٔ موضوعاتِ عمومی. " * 400          # ~18k chars, pushes the real answer past 6,000
DOCS = [("filler.md", "# مقدمه\n" + FILLER),
        ("sepidz-products.md", "# محصولات\n\n## منوی دیجیتال سپیدز\nمنوی دیجیتال با QR کد سفارش سریع و به‌روزرسانی آنی قیمت‌ها را ممکن می‌کند.\n\n## نرم‌افزار سیما\nحسابداری تحت وب."),
        ("alavi-05-objections-price.md", "## ۵.۱ اعتراض قیمت\nوقتی مشتری می‌گوید گران است، اول ارزش را روشن کنید و سؤال کلیدی بپرسید.")]
KEY = "k" * 40


class KbRetrieval(unittest.TestCase):
    def test_chunks_carry_file_and_heading(self):
        ch = server.kb_chunks(DOCS)
        self.assertTrue(all(len(c["text"]) <= server.KB_CHUNK + 50 for c in ch))
        self.assertTrue(any(c["file"] == "sepidz-products.md" and c["title"] == "منوی دیجیتال سپیدز" for c in ch))

    def test_topk_finds_content_beyond_old_6000_cap(self):
        joined = "\n\n".join("# از فایل: " + f + "\n" + t for f, t in DOCS)
        self.assertNotIn("QR", joined[:server.KB_PROMPT_MAX])              # the old cap would have dropped it
        hits = server.kb_retrieve(server.kb_chunks(DOCS), "منوی دیجیتال سپیدز چیست؟")
        self.assertTrue(hits and "QR" in hits[0] and "sepidz-products.md › منوی دیجیتال سپیدز" in hits[0])
        self.assertLessEqual(sum(map(len, hits)), server.KB_RETRIEVE_MAX)
        self.assertIn("ارزش", server.kb_retrieve(server.kb_chunks(DOCS), "مشتری میگه گران است")[0])

    def test_context_falls_back_to_previous_behaviour(self):
        with patch.object(server, "_kb_docs", return_value=DOCS), patch.object(server, "kb_text_for", return_value="OLD") as old:
            self.assertIn("QR", server.kb_context("team", True, "منوی دیجیتال"))
            self.assertEqual(server.kb_context("team", True, ""), "OLD")
            self.assertEqual(server.kb_context("team", True, "zzzz qqqq"), "OLD")
            self.assertEqual(old.call_count, 2)

    def test_assistant_system_uses_query(self):
        with patch.object(server, "kb_context", return_value="KBX") as kc:
            sysmsg = server.assistant_system("team", scope="public", query="منوی دیجیتال")
        self.assertIn("KBX", sysmsg)
        self.assertEqual(kc.call_args.kwargs.get("query"), "منوی دیجیتال")


class BotAnswer(unittest.TestCase):
    def setUp(self):
        server._w_hits.clear(); server._bot_hist.clear()
        self.c = TestClient(server.app)
        self.site = {"siteId": "8a436154fc045cf1bd45", "tenant": "team", "name": "AROMIN"}

    def post(self, body, key=KEY):
        return self.c.post("/api/bot/answer", json=body, headers={"X-Bot-Key": key} if key else {})

    def test_unconfigured_and_bad_key(self):
        with patch.object(server, "BOT_ANSWER_KEY", ""):
            self.assertEqual(self.post({"conversationId": "tg1", "text": "سلام"}).status_code, 503)
        with patch.object(server, "BOT_ANSWER_KEY", KEY):
            self.assertEqual(self.post({"conversationId": "tg1", "text": "سلام"}, key="wrong").status_code, 401)
            self.assertEqual(self.post({"conversationId": "tg1", "text": "سلام"}, key=None).status_code, 401)
            self.assertEqual(self.post({"conversationId": "bad id!", "text": "x"}).status_code, 400)

    def test_answer_reuses_sales_agent_and_lead_creation_with_history_and_rate_limit(self):
        seen = []
        def fake_sa(site, history, page, conv, vis):
            seen.append(list(history))
            return {"ok": True, "text": "پاسخ", "lead": {"ok": True, "id": 9, "phone": "0912"}, "searches": []}
        with patch.object(server, "BOT_ANSWER_KEY", KEY), patch.object(server, "BOT_RATE_CONV", 3), \
             patch.object(server, "_w_load", return_value={"sites": {self.site["siteId"]: self.site}}), \
             patch.object(server, "sa_enabled", return_value=True), patch.object(server, "sa_reply", side_effect=fake_sa):
            r = self.post({"conversationId": "tg77", "text": "قیمت صندوق؟"})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json(), {"ok": True, "text": "پاسخ", "lead": True})          # no internal lead data leaks
            self.post({"conversationId": "tg77", "text": "شماره‌ام 0912"})
            self.assertEqual([m["role"] for m in seen[-1]], ["user", "assistant", "user"])
            self.post({"conversationId": "tg77", "text": "سوم"})
            self.assertEqual(self.post({"conversationId": "tg77", "text": "چهارم"}).status_code, 429)
            self.assertEqual(self.post({"conversationId": "tg78", "text": "دیگری"}).status_code, 200)


if __name__ == "__main__":
    unittest.main()
