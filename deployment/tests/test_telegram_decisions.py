"""Offline regression tests: never contact Telegram or start a publisher."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

class TelegramDecisions(unittest.TestCase):
    def decision(self, action, changed=1, state='REJECTED', sender=42):
        callback={'id':'test','from':{'id':sender},'data':action+'_post:1','message':{'message_id':7,'chat':{'id':42}}}
        with patch.object(server,'TG_ADMIN_ID',42), patch.object(server,'q',return_value=[{'id':1,'status':state,'preview_message_id':7}]), patch.object(server,'_tg_exec',return_value=(changed,None)) as transition, patch.object(server,'_tg_try') as api, patch.object(server,'_tg_audit'), patch.object(server,'sa_start_worker') as worker, patch.object(server,'_sa_kick'):
            result=server.tg_handle_callback(callback)
            return result,api.call_args_list,transition.call_count,worker.call_count
    def test_reject_sends_explicit_confirmation_and_never_publishes(self):
        result,calls,_,workers=self.decision('reject')
        self.assertEqual(result,'rejected');self.assertEqual(workers,0)
        self.assertTrue(any(c.args[0]=='sendMessage' and 'رد شد و منتشر نمی‌شود' in c.kwargs['text'] for c in calls))
    def test_approve_confirms_and_schedules_once(self):
        result,calls,transitions,workers=self.decision('approve',state='PENDING_APPROVAL')
        self.assertEqual((result,transitions,workers),('approved',1,1))
        self.assertTrue(any(c.args[0]=='sendMessage' and 'تأیید شد' in c.kwargs['text'] for c in calls))
    def test_repeated_click_does_not_schedule(self):
        result,calls,_,workers=self.decision('approve',changed=0)
        self.assertEqual((result,workers),('already',0))
        self.assertTrue(any(c.args[0]=='sendMessage' and 'قبلاً' in c.kwargs['text'] for c in calls))
    def test_other_sender_is_denied_before_transition(self):
        result,_,transitions,workers=self.decision('approve',sender=99)
        self.assertEqual((result,transitions,workers),('denied',0,0))
