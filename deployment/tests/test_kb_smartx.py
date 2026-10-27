"""Offline: SmartX KB doc (tools/kb_docs/smartx-kb.md) is well-formed, secret-free and retrievable."""
import os, re, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import server  # noqa: E402

KB = os.path.join(HERE, "..", "..", "tools", "kb_docs")
DOC = os.path.join(KB, "smartx-kb.md")


class SmartxKB(unittest.TestCase):
    def setUp(self):
        self.text = open(DOC, encoding="utf-8").read()
        self.docs = [("smartx-kb.md", self.text)]

    def test_has_ten_sections(self):
        self.assertGreaterEqual(len(re.findall(r"^## ", self.text, re.M)), 10)

    def test_skill_copy_matches_doc(self):
        skill = open(os.path.join(KB, "smartx-sources", "SKILL.md"), encoding="utf-8").read()
        self.assertTrue(skill.startswith("---\nname: smartx-guide\n"))
        self.assertTrue(skill.endswith(self.text))

    def test_no_secrets_or_personal_numbers(self):
        blob = self.text
        for dp, _, fs in os.walk(os.path.join(KB, "smartx-sources")):
            for f in fs:
                blob += open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read()
        self.assertIsNone(re.search(r"eyJ[A-Za-z0-9_-]{10,}|ghp_|gho_|AKIA[0-9A-Z]{8,}|BEGIN [A-Z ]*PRIVATE|Bearer [A-Za-z0-9._-]{20,}", blob))
        self.assertIsNone(re.search(r"(?<!\d)09\d{9}(?!\d)", blob))

    def test_retrieval_finds_topics(self):
        ch = server.kb_chunks(self.docs)
        for q, w in [("قیمت اشتراک باشگاه مشتریان اسمارت", "باشگاه"), ("ارزیابی هوشمند نظرسنجی", "ارزیابی")]:
            hits = server.kb_retrieve(ch, q)
            self.assertTrue(hits and w in " ".join(hits), q)


if __name__ == "__main__":
    unittest.main()
