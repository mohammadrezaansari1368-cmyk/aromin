import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from aromin_support_goftino import verify_inbound, GoftinoAdapter, receive
from aromin_support_campaign import SmartxSupport
from aromin_support import SupportError

class FakeAdapter:
    def __init__(self): self.sent=[];self.fail=False
    def send(self,config,chat,text):
        if self.fail: raise SupportError('goftino_unavailable',503)
        self.sent.append((config['tenant'],chat,text));return 'synthetic-id'

class GoftinoTests(unittest.TestCase):
    def setUp(self):
        self.cfg={'tenant':'a','webhookSecret':'s'*40,'operatorId':'bot','apiKey':'k'*40,'enabled':True}
        self.s=SmartxSupport({},'a','k'*40);self.adapter=FakeAdapter()
    def event(self,mid='1',text='سلام',sender='user'):
        return {'event':'new_message','data':{'chat_id':'chat','user_id':'user','message_id':mid,'sender':{'from':sender},'type':'text','content':text}}
    def test_authentication_fail_closed_and_tenant_binding(self):
        with self.assertRaises(SupportError): verify_inbound(self.cfg,{},b'{}')
        verify_inbound(self.cfg,{'x-aromin-goftino-secret':'s'*40},b'{}')
        cfg={**self.cfg,'tenant':'b'}
        with self.assertRaises(SupportError): receive(self.s,cfg,self.event())
    def test_retry_does_not_advance_twice_and_operator_ignored(self):
        r=receive(self.s,self.cfg,self.event());self.adapter.send(self.cfg,r['chat'],r['text'])
        receive(self.s,self.cfg,self.event('2','برند آزمایشی'))
        replay=receive(self.s,self.cfg,self.event('2','برند آزمایشی'))
        self.assertTrue(replay['duplicate'])
        self.assertEqual(list(self.s.state['sessions'].values())[0]['step'],1)
        self.assertIsNone(receive(self.s,self.cfg,self.event('3','echo','operator')))
    def test_send_failure_preserves_reply_for_retry(self):
        reply=receive(self.s,self.cfg,self.event());self.adapter.fail=True
        with self.assertRaises(SupportError): self.adapter.send(self.cfg,reply['chat'],reply['text'])
        again=receive(self.s,self.cfg,self.event())
        self.assertEqual(reply['text'],again['text'])
    def test_real_outbound_contract_with_injected_http(self):
        calls=[]
        def http(url,headers,body): calls.append((url,headers,json.loads(body)));return {'status':'success','data':{'message_id':'synthetic'}}
        adapter=GoftinoAdapter(http)
        self.assertEqual(adapter.send(self.cfg,'chat','سلام'),'synthetic')
        self.assertEqual(calls[0][0],'https://api.goftino.com/v1/send_message')
        self.assertEqual(calls[0][2],{'chat_id':'chat','operator_id':'bot','message':'سلام'})
    def test_hmac_signature_and_stale_timestamp(self):
        import hmac,hashlib
        raw=b'{}';timestamp='1800000000'
        signature='sha256='+hmac.new(('s'*40).encode(),timestamp.encode()+b'.'+raw,hashlib.sha256).hexdigest()
        headers={'x-aromin-goftino-timestamp':timestamp,'x-aromin-goftino-signature':signature}
        verify_inbound(self.cfg,headers,raw,lambda:1800000000)
        with self.assertRaises(SupportError): verify_inbound(self.cfg,headers,b'{"forged":true}',lambda:1800000000)
        with self.assertRaises(SupportError): verify_inbound(self.cfg,headers,raw,lambda:1800001000)
    def test_link_rotation_preserves_verified_channel_interview(self):
        receive(self.s,self.cfg,self.event())
        receive(self.s,self.cfg,self.event('2','برند آزمایشی'))
        self.s.link('generate');self.s.link('rotate');self.s.link('revoke')
        reply=receive(self.s,self.cfg,self.event('3','شعبه آزمایشی'))
        self.assertNotIn('session_unavailable',reply['text'])
        self.assertEqual(list(self.s.state['sessions'].values())[0]['step'],2)
    def test_older_failed_reply_survives_newer_message(self):
        first=receive(self.s,self.cfg,self.event())
        receive(self.s,self.cfg,self.event('2','برند آزمایشی'))
        retried=receive(self.s,self.cfg,self.event())
        self.assertIsNotNone(retried)
        self.assertEqual(retried['text'],first['text'])
    def test_orphaned_expired_session_restarts_explicitly(self):
        receive(self.s,self.cfg,self.event())
        self.s.state['sessions'].clear()  # session TTL can expire before active channel mapping
        reply=receive(self.s,self.cfg,self.event('2','ادامه'))
        self.assertNotIn('session_unavailable',reply['text'])
        self.assertIn('منقضی',reply['text'])
    def test_sensitive_first_message_asks_again_without_storing_it(self):
        reply=receive(self.s,self.cfg,self.event('1','رمز عبور: synthetic-secret'))
        self.assertIn('sensitive_input',reply['text'])
        self.assertNotIn('synthetic-secret',str(self.s.state))
    def test_capacity_failure_is_not_swallowed_as_validation(self):
        receive(self.s,self.cfg,self.event())
        self.s.state['padding']='x'*1250000
        with self.assertRaises(SupportError) as error: receive(self.s,self.cfg,self.event('2','برند آزمایشی'))
        self.assertEqual(error.exception.status,503)
