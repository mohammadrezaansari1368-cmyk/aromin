"""3.9.80: website popup lead form → /api/widget/public/{site}/lead → sa_create_lead (business name + mobile first)."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class WidgetLead(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(server, "_w_site_for", return_value=({"siteId": "s1", "tenant": "team"}, "https://arominco.com", None)).start()
        patch.object(server, "_w_public_cfg", return_value={"enabled": True}).start()
        patch.object(server, "agent_event").start()
        self.lead = patch.object(server, "sa_create_lead", return_value={"ok": True, "id": 9}).start()
        server._w_hits.clear()
        self.c = TestClient(server.app)

    def post(self, body):
        return self.c.post("/api/widget/public/s1/lead", json=body)

    def test_valid_lead_goes_to_sales(self):
        r = self.post({"business": "کافه نارنج", "phone": "۰۹۱۲ ۱۲۳ ۴۵۶۷", "page": {"url": "https://arominco.com/"}})
        self.assertEqual(r.json(), {"ok": True, "duplicate": False})
        d = self.lead.call_args.args[1]
        self.assertEqual((d["name"], d["phone"], d["source"]), ("کافه نارنج", "09121234567", "website"))

    def test_needs_business_and_valid_phone_and_is_rate_limited(self):
        self.assertEqual(self.post({"business": "", "phone": "09121234567"}).status_code, 400)
        self.assertEqual(self.post({"business": "x", "phone": "123"}).status_code, 400)
        for _ in range(5):
            self.post({"business": "x", "phone": "09121234567"})
        self.assertEqual(self.post({"business": "x", "phone": "09121234567"}).status_code, 429)


if __name__ == "__main__":
    unittest.main()
