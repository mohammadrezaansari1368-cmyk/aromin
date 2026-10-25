"""Offline: Bale mirror never contacts the network and never breaks the Telegram post."""
import os, sys, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

ENV = {'BALE_BOT_TOKEN': 'x', 'BALE_CHANNEL_ID': '5883591839'}

class BaleMirror(unittest.TestCase):
    def test_skipped_without_config(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('BALE_BOT_TOKEN', None)
            self.assertEqual(server.bale_mirror('hi', photo_url='https://x/y.jpg'), 'skipped')
    def test_photo_url_plain_caption(self):
        with patch.dict(os.environ, ENV), patch.object(server, '_bale_call', return_value={}) as c:
            r = server.bale_mirror('<b>Hi</b> <a href="https://a.co">site</a> &amp;', photo_url='https://x/y.jpg')
        self.assertEqual(r, 'ok'); m, f = c.call_args.args[:2]
        self.assertEqual(m, 'sendPhoto'); self.assertEqual(f['photo'], 'https://x/y.jpg')
        self.assertEqual(f['caption'], 'Hi site (https://a.co) &'); self.assertEqual(f['chat_id'], '5883591839')
    def test_retry_once_then_fail_quietly(self):
        with patch.dict(os.environ, ENV), patch.object(server, '_bale_call', side_effect=RuntimeError('boom')) as c, patch.object(server.time, 'sleep'):
            self.assertEqual(server.bale_mirror('t', photo_bytes=b'\xff', mime='image/jpeg'), 'failed')
        self.assertEqual(c.call_count, 2)
    def test_bytes_upload_and_buttons(self):
        with patch.dict(os.environ, ENV), patch.object(server, '_bale_call', return_value={}) as c:
            server.bale_mirror('t', photo_bytes=b'\xff', mime='image/jpeg', buttons=[[{'text': 'Site', 'url': 'https://a.co'}]])
        self.assertIn('photo', c.call_args.kwargs['files']); self.assertIn('inline_keyboard', c.call_args.args[1]['reply_markup'])

if __name__ == '__main__': unittest.main()
