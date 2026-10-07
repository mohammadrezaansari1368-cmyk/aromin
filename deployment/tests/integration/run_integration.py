"""همان tests/test_local_integration، فقط نشانیِ سرور 127.0.0.1:3010 (پورتِ 3000 در اختیارِ سرویسِ VPNِ سیستم است)."""
import sys, unittest, urllib.request
_orig = urllib.request.Request.__init__
def _init(self, url, *a, **k):
    _orig(self, url.replace("http://127.0.0.1:3000", "http://127.0.0.1:3010"), *a, **k)
urllib.request.Request.__init__ = _init
sys.path.insert(0, sys.argv[1]); sys.path.insert(0, sys.argv[1] + "/tests")
unittest.main(module="test_local_integration", argv=["x", "-v"])
