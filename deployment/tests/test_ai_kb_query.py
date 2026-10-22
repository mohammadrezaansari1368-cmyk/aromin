"""3.9.65: the dashboard assistant (/api/ai) retrieves by the question instead of attaching the first KB_PROMPT_MAX chars of the oldest files."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

BIG = ("# راهنمای قدیمی\n" + "این بخش دربارهٔ تاریخچهٔ شرکت و جلسات قدیمی است و هیچ ربطی به پرسش ندارد. " * 200).strip()
LATER = "# منوی دیجیتال\nمنوی دیجیتال سپیدز با کد QR روی میز کار می‌کند و سفارش مستقیم به آشپزخانه می‌رود و نیازی به گارسون نیست."
DOCS = [("old-big.md", BIG, "id-old", ("general",)), ("later.md", LATER, "id-later", ("general",))]


class DashboardKbQuery(unittest.TestCase):
    def setUp(self):
        self.sent = []
        self.p = [patch.object(server, "kb_identity", return_value={"user": "u", "role": "manager", "tenant": "team"}),
                  patch.object(server, "_TENANT_RE"), patch.object(server, "_s3_ready", return_value=True),
                  patch.dict(server._kb_docs_cache, {"team": (1e18, DOCS)}),
                  patch.object(server, "kb_text_for", side_effect=lambda t, public=False: (BIG + "\n\n" + LATER)[:server.KB_PROMPT_MAX]),
                  patch.object(server, "agent_enabled", return_value=False),
                  patch.object(server, "ai_chat", side_effect=lambda system, user, **k: self.sent.append(system) or {"ok": True, "text": "x"})]
        for x in self.p:
            x.start()
        server._TENANT_RE.match.return_value = True
        self.c = TestClient(server.app)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()

    def test_precondition_old_file_fills_the_whole_budget(self):
        self.assertGreater(len(BIG), server.KB_PROMPT_MAX)
        self.assertNotIn("QR", server.kb_text_for("team"))                       # the pre-3.9.65 attachment never reached later.md

    def test_question_retrieves_the_later_file(self):
        self.c.post("/api/ai", json={"tenant": "team", "mode": "copilot", "question": "منوی دیجیتال با QR چطور کار می‌کند؟"})
        self.assertIn("کد QR", self.sent[-1])
        self.assertIn("later.md", self.sent[-1])

    def test_last_user_message_then_context_are_fallbacks(self):
        self.c.post("/api/ai", json={"tenant": "team", "mode": "agent", "messages": [{"role": "user", "content": "منوی دیجیتال QR"},
                                                                                       {"role": "user", "content": "[tool_result x] {}"}]})
        self.assertIn("کد QR", self.sent[-1])                                     # a tool-result round still uses the user's question
        self.c.post("/api/ai", json={"tenant": "team", "mode": "analysis", "context": "فروش منوی دیجیتال QR در ماه گذشته"})
        self.assertIn("کد QR", self.sent[-1])
        self.c.post("/api/ai", json={"tenant": "team", "mode": "analysis", "context": ""})
        self.assertNotIn("کد QR", self.sent[-1])                                  # no query at all → previous behaviour (kb_text_for)


if __name__ == "__main__":
    unittest.main()
