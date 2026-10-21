"""Offline: Sepidz web tutorial KB doc (tools/kb_docs/sepidz-web-tutorials.md) has 22 topics and is retrievable."""
import os, re, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import server  # noqa: E402

DOC = os.path.join(HERE, "..", "..", "tools", "kb_docs", "sepidz-web-tutorials.md")


class SepidzTutorialsKB(unittest.TestCase):
    def setUp(self):
        self.text = open(DOC, encoding="utf-8").read()
        self.docs = [("sepidz-web-tutorials.md", self.text)]

    def test_has_22_topics(self):
        self.assertEqual(len(re.findall(r"^## \d+\.", self.text, re.M)), 22)

    def test_retrieval_finds_topics(self):
        ch = server.kb_chunks(self.docs)
        for q, w in [("کیوسک سپیدز", "کیوسک"), ("چطور رسپی و قیمت تمام شده تعریف کنم", "رسپی"), ("انبارگردانی", "انبارگردانی")]:
            hits = server.kb_retrieve(ch, q)
            self.assertTrue(hits and w in hits[0], q)


if __name__ == "__main__":
    unittest.main()
