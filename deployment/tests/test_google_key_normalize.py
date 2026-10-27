import sys, unittest, tempfile, os
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

KEY=('AIzaSy0123456789abcdefghijklmnopqrstuvwxyz_-ABC')[:39]  # synthetic, 39 chars, never a real key
FA_KEY=KEY.replace('0123456789','۰۱۲۳۴۵۶۷۸۹')

class GoogleKeyNormalizeTests(unittest.TestCase):
 def save(self, raw):
  with tempfile.TemporaryDirectory() as tmp, patch.object(server,'GOOGLE_SECRET_DIR',tmp), patch.object(server,'kb_identity',return_value={'role':'manager'}):
   result=server.google_ai_save(None,{'tenant':'t','key':raw,'enabled':True})
   stored=server._google_ai_config('t').get('key')
  return result, stored
 def test_clean_key_still_accepted(self):
  self.assertEqual(len(KEY),39)
  result,stored=self.save(KEY); self.assertTrue(result['ok']); self.assertEqual(stored,KEY)
 def test_pasted_noise_is_normalized(self):
  noisy={
   'zero-width space':'\u200b'+KEY, 'ZWNJ inside':KEY[:10]+'\u200c'+KEY[10:], 'LRM/RLM':'\u200e'+KEY+'\u200f',
   'BOM':'\ufeff'+KEY, 'inner space/newline':KEY[:20]+' \n'+KEY[20:], 'NBSP':'\u00a0'+KEY+'\u00a0',
   'quotes':'"'+KEY+'"', 'persian quotes':'«'+KEY+'»', 'backticks':'`'+KEY+'`', 'persian digits':FA_KEY, 'fullwidth':KEY.replace('A','Ａ',1),
  }
  for name,raw in noisy.items():
   with self.subTest(name):
    result,stored=self.save(raw)
    self.assertTrue(result.get('ok') is True, result); self.assertEqual(stored,KEY)
 def test_persian_digits_map_to_ascii(self):
  self.assertEqual(server._normalize_google_key(FA_KEY),KEY)
 def test_genuinely_bad_key_still_rejected(self):
  for raw in ['short','سلام'*10,'AIza$%^&*()_+'+'x'*30]:
   with self.subTest(raw=raw):
    result,_=self.save(raw); self.assertEqual(result.status_code,422)
 def test_test_endpoint_uses_same_normalization(self):
  with patch.object(server,'kb_identity',return_value={'role':'manager'}), patch.object(server,'_google_ai_config',return_value={}), patch.object(server,'_google_chat',return_value={'ok':True}) as chat:
   result=server.google_ai_test(None,{'tenant':'t','key':'\u200e'+KEY+'\u200f'})
   self.assertTrue(result['ok']); self.assertEqual(chat.call_args[0][0]['key'],KEY)
