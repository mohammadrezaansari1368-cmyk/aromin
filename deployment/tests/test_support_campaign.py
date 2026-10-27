import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from aromin_support_campaign import SmartxSupport, validate_campaign, render_template, settings_defaults, jalali_today
from aromin_support import SupportError, verify_payload


def answers(today):
    return ['برند آزمایشی','-','مشتری آزمایشی','مدیر','09120000000','کمپین','رویداد آزمایشی','فقط اطلاع‌رسانی','همه',today,'10:30','عضو گرامی باشگاه مشتریان؛ از عضویت شما در باشگاه سپاسگزاریم.','بله','-','رد','تأیید می‌کنم']

class CampaignTests(unittest.TestCase):
    def setUp(self):
        self.state={}; self.s=SmartxSupport(self.state,'a','k'*40,lambda:1800000000)
        self.token=self.s.link('generate')['token']
    def complete(self):
        sid=self.s.start(self.token)['sessionId']
        for text in answers(self.s.today()): self.s.message(self.token,sid,text)
        return sid,self.s.submit(self.token,sid)
    def test_flow_summary_confirmation_and_signed_campaign(self):
        sid=self.s.start(self.token)['sessionId']
        for text in answers(self.s.today())[:-1]: out=self.s.message(self.token,sid,text)
        self.assertIn('خلاصه',out['question']); self.assertIn('رویداد آزمایشی',out['question'])
        self.s.message(self.token,sid,'اوکی')
        with self.assertRaises(SupportError): self.s.submit(self.token,sid)
        self.s.message(self.token,sid,'تأیید می‌کنم')
        out=self.s.submit(self.token,sid)
        payload=self.state['requests'][out['reference']]['payload']
        self.assertTrue(verify_payload(payload,'k'*40))
        self.assertIsNone(payload['campaign']['campaign']['gift_credit'])
        self.assertFalse(payload['campaign']['contact']['brand_matched'])
        self.assertTrue(payload['campaign']['customer_confirmation']['confirmed'])
    def test_server_revalidates_tampered_campaign(self):
        _,out=self.complete(); body=copy.deepcopy(self.state['requests'][out['reference']]['payload']['campaign'])
        body['campaign']['percent_discount']={'percent':101}
        with self.assertRaises(SupportError): validate_campaign(body,self.s.today())
        for date in ['1400/01/01','1405/13/01','1405/12/30']:
            bad=copy.deepcopy(body); bad['campaign']['percent_discount']=None;bad['campaign']['send_date_jalali']=date
            with self.assertRaises(SupportError): validate_campaign(bad,self.s.today())
    def test_variables_and_settings_are_isolated(self):
        cfg=settings_defaults(); self.assertEqual(cfg['brands'],[])
        cfg['template']='{AGENT_NAME} {UNKNOWN} {LINK} {BRAND_LIST} {TODAY_JALALI}'
        self.s.save_settings(cfg)
        text=self.s.system_prompt(self.token)
        self.assertNotRegex(text,r'\{[A-Z_]+\}')
        other=SmartxSupport({},'b','k'*40)
        self.assertNotEqual(other.settings()['template'],cfg['template'])
    def test_bad_value_does_not_advance_and_secrets_not_saved(self):
        sid=self.s.start(self.token)['sessionId']
        with self.assertRaises(SupportError): self.s.message(self.token,sid,'رمز عبور: secret-value')
        self.assertNotIn('secret-value',str(self.state))
        for text in answers(self.s.today())[:10]: self.s.message(self.token,sid,text)
        step=self.state['sessions'][sid]['step']
        with self.assertRaises(SupportError): self.s.message(self.token,sid,'10:17')
        self.assertEqual(self.state['sessions'][sid]['step'],step)

class CampaignValidation(unittest.TestCase):
    def test_gift_and_discount_conditional_paths(self):
        for benefit,extra in [('اعتبار هدیه',['250000','14','ادغام','بله','2','-']),('تخفیف درصدی',['15','بدون سقف','2','14','خیر'])]:
            state={};s=SmartxSupport(state,'a','k'*40,lambda:1800000000);token=s.link('generate')['token'];sid=s.start(token)['sessionId']
            texts=answers(s.today());texts=texts[:7]+[benefit]+extra+texts[8:]
            for text in texts: s.message(token,sid,text)
            out=s.submit(token,sid);body=state['requests'][out['reference']]['payload']['campaign']
            self.assertEqual(validate_campaign(body,s.today()),body)
            bad=copy.deepcopy(body);bad['campaign']['send_time']='24:00'
            with self.assertRaises(SupportError): validate_campaign(bad,s.today())
    def test_confirmation_change_resets_and_placeholder_in_variable_is_removed(self):
        s=SmartxSupport({},'a','k'*40);token=s.link('generate')['token'];sid=s.start(token)['sessionId']
        for text in answers(s.today())[:-1]: s.message(token,sid,text)
        out=s.message(token,sid,'اصلاح');self.assertEqual(out['step'],0)
        self.assertNotIn('confirmation',s.state['sessions'][sid]['values'])
        cfg=s.settings();cfg['variables']['AGENT_NAME']='{UNRESOLVED}';s.save_settings(cfg)
        self.assertNotRegex(s.system_prompt(),r'\{[A-Z_]+\}')
    def test_priority_and_ticket_are_config_not_assumed(self):
        s=SmartxSupport({},'a','k'*40);token=s.link('generate')['token'];sid=s.start(token)['sessionId']
        for text in ['نمونه','-','نام','مدیر','09120000000','پشتیبانی','قطع صندوق','-','امروز','بررسی اینترنت','همه شعب','P1','تأیید می‌کنم']:
            s.message(token,sid,text)
        out=s.submit(token,sid);self.assertEqual(s.state['requests'][out['reference']]['payload']['ticket']['priority'],'P1')

class SmartxAPI(unittest.TestCase):
    def setUp(self):
        import server
        import json
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        self.server=server;self.states={}
        def run(tenant,operation):
            state=copy.deepcopy(self.states.get(tenant,{}));result=operation(SmartxSupport(state,tenant,'k'*40));self.states[tenant]=state;return result
        for p in [patch.object(server,'_support_run',side_effect=run),patch.object(server,'_w_guard',return_value=({'role':'manager'},None)),patch.dict('os.environ',{'SOROUSH_SUPPORT_SIGNING_KEY':'k'*40,'GOFTINO_SUPPORT_ACCOUNTS_JSON':json.dumps({'widget-a':{'tenant':'a','webhookSecret':'s'*40,'apiKey':'k'*40,'operatorId':'bot','enabled':True}})})]:
            p.start();self.addCleanup(p.stop)
        server._w_hits.clear();self.client=TestClient(server.app)
    def test_campaign_routes_settings_and_unguessable_link(self):
        cfg=self.client.get('/api/agent/support/settings?tenant=a').json()['settings']
        cfg['brands']=[{'name':'برند آزمایشی','active':True}]
        self.assertEqual(self.client.put('/api/agent/support/settings?tenant=a',json=cfg).status_code,200)
        token=self.client.post('/api/agent/support/link?tenant=a',json={'action':'generate'}).json()['token'];headers={'X-Support-Link':token}
        sid=self.client.post('/api/support/session',headers=headers,json={}).json()['sessionId']
        for step,text in enumerate(answers(jalali_today())):
            r=self.client.post('/api/support/message',headers=headers,json={'sessionId':sid,'message':text,'expectedStep':step});self.assertEqual(r.status_code,200)
        out=self.client.post('/api/support/submit',headers=headers,json={'sessionId':sid}).json()
        self.assertTrue(self.states['a']['requests'][out['reference']]['payload']['campaign']['contact']['brand_matched'])
        self.assertEqual(self.client.post('/api/support/session',headers=headers,json={'tenantId':'b'}).status_code,400)
    def test_goftino_webhook_real_format_fake_transport(self):
        from unittest.mock import patch
        event={'event':'new_message','data':{'chat_id':'chat','user_id':'user','message_id':'m1','sender':{'from':'user'},'type':'text','content':'سلام'}}
        self.assertEqual(self.client.post('/api/support/goftino/widget-a',json=event).status_code,401)
        with patch.object(self.server.GOFTINO_SUPPORT_ADAPTER,'send',return_value='synthetic') as send:
            for _ in range(2):
                r=self.client.post('/api/support/goftino/widget-a',headers={'X-Aromin-Goftino-Secret':'s'*40},json=event);self.assertEqual(r.status_code,200)
            self.assertEqual(send.call_count,1)
        self.assertNotIn('b',self.states)
    def test_result_status_is_session_bound_and_notes_safe(self):
        token=self.client.post('/api/agent/support/link?tenant=a',json={'action':'generate'}).json()['token'];headers={'X-Support-Link':token}
        sid=self.client.post('/api/support/session',headers=headers,json={}).json()['sessionId']
        for step,text in enumerate(answers(jalali_today())):
            self.client.post('/api/support/message',headers=headers,json={'sessionId':sid,'message':text,'expectedStep':step})
        rid=self.client.post('/api/support/submit',headers=headers,json={'sessionId':sid}).json()['reference']
        self.states['a']['requests'][rid].update(status='failed',resultNote='متن باید اصلاح و دوباره تأیید شود.')
        out=self.client.post('/api/support/status',headers=headers,json={'sessionId':sid}).json()
        self.assertEqual(out['status'],'failed');self.assertNotIn('campaign',out)
        token_b=self.client.post('/api/agent/support/link?tenant=b',json={'action':'generate'}).json()['token']
        self.assertEqual(self.client.post('/api/support/status',headers={'X-Support-Link':token_b},json={'sessionId':sid}).status_code,404)
    def test_terminal_goftino_note_is_relayed_once(self):
        from unittest.mock import patch
        s=SmartxSupport({},'a','k'*40);token=s.link('generate')['token'];sid=s.start(token)['sessionId']
        for text in answers(s.today()): s.message(token,sid,text)
        rid=s.submit(token,sid)['reference'];row=s.state['requests'][rid]
        row.update(replyChannel='goftino',replyAccount='widget-a',replyChat='chat',status='failed',resultNote='برای متن تازه، شروع بنویسید و دوباره تأیید کنید.')
        self.states['a']=s.state
        with patch.object(self.server.GOFTINO_SUPPORT_ADAPTER,'send',return_value='synthetic') as send:
            self.server._support_notify_result('a',rid);self.server._support_notify_result('a',rid)
            self.assertEqual(send.call_count,1)
