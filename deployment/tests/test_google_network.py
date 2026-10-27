import os
import sys
import threading
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

class GoogleNetwork(unittest.TestCase):
    def test_timeout_and_relay(self):
        for value, expected in [('1', 3), ('99', 20), ('bad', 12)]:
            with self.subTest(value=value), patch.dict(os.environ, GOOGLE_AI_TIMEOUT=value, GOOGLE_AI_BASE_URL='https://relay.example/v1beta/'), patch.object(server.urllib.request, 'urlopen') as call:
                call.return_value.__enter__.return_value.read.return_value = b'{}'
                server._google_chat({'key': 'AIza' + 'x'*35}, '', 'hi')
                self.assertEqual(call.call_args.kwargs['timeout'], expected)
                self.assertTrue(call.call_args.args[0].full_url.startswith('https://relay.example/v1beta/models/'))
    def test_errors_are_safe_and_specific(self):
        errors = [(TimeoutError(), 'GOOGLE_AI_BASE_URL'), (urllib.error.URLError('secret'), 'GOOGLE_AI_BASE_URL')]
        errors += [(urllib.error.HTTPError('https://x', c, 'secret', {}, None), word) for c, word in [(400, 'کلید'), (401, 'کلید'), (403, 'منطقه'), (429, 'سهمیه')]]
        for error, word in errors:
            with self.subTest(word=word), patch.object(server.urllib.request, 'urlopen', side_effect=error):
                result = server._google_chat({'key': 'AIza'+'x'*35}, '', 'hi')
                self.assertIn(word, result['error']); self.assertNotIn('secret', str(result))
    def test_rejects_http_relay(self):
        with patch.dict(os.environ, GOOGLE_AI_BASE_URL='http://relay.example'), patch.object(server.urllib.request, 'urlopen') as call:
            self.assertFalse(server._google_chat({'key':'fake'}, '', '')['ok']); call.assert_not_called()
    def test_endpoint_deadline(self):
        release = threading.Event()
        def slow(*a, **kw):
            release.wait(1); return {'ok': True}
        try:
            with patch.object(server, '_kb_guard', return_value=({}, None)), patch.object(server, '_google_ai_config', return_value={'key':'fake'}), patch.object(server, '_google_chat', side_effect=slow), patch.object(server, 'GOOGLE_TEST_DEADLINE', .01, create=True):
                result = server.google_ai_test(None, {})
                self.assertFalse(result['ok']); self.assertIn('error', result)
        finally:
            release.set()
