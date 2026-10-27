"""Synthetic failure boundaries; no network or live configuration."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from fastapi.testclient import TestClient

class Degradation(unittest.TestCase):
    def test_worker_exception_is_handled_and_does_not_expose_details(self):
        with patch.object(server, '_sa_reply_turn', side_effect=RuntimeError('private-detail')):
            out = server.sa_reply({'tenant':'fixture'}, [])
        self.assertTrue(out['ok'])
        self.assertTrue(out['unavailable'])
        self.assertNotIn('private-detail', str(out))

    def test_missing_zurvan_knowledge_offers_contact_instead_of_dead_end(self):
        with patch.object(server, 'assistant_system', return_value=''), patch.object(server, 'agent_enabled', return_value=False):
            out = server._sa_reply_turn({'tenant':'fixture'}, [{'role':'user','content':'سلام'}], spec={'agent':'zurvan','persona':'','scope':['zurvan_public']})
        self.assertTrue(out.get('unavailable'))
        self.assertIn('تماس', out['text'])

    def test_public_model_failure_is_a_handled_turn(self):
        with patch.object(server, '_w_site_for', return_value=({'siteId':'synthetic1','tenant':'fixture'}, 'https://example.test', None)), patch.object(server, '_w_public_cfg', return_value={'enabled':True}), patch.object(server, 'agent_enabled', return_value=False), patch.object(server, 'sa_enabled', return_value=True), patch.object(server, 'sa_reply', return_value={'ok':False,'error':'private-detail'}):
            server._w_hits.clear()
            r = TestClient(server.app).post('/api/widget/public/synthetic1/chat', json={'conversationId':'syntheticconv','visitorId':'syntheticvisitor','messages':[{'role':'user','content':'سلام'}]})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['ok'])
        self.assertTrue(r.json()['unavailable'])
        self.assertNotIn('private-detail', r.text)

class CouncilLoading(unittest.TestCase):
    def test_seats_do_not_download_unrelated_kb_bodies(self):
        import json
        server._kb_docs_cache.clear()
        items=[{'id':'council','status':'ready','collections':['council']}, {'id':'other','status':'ready','collections':['general']}]
        def get(method,key):
            return 200,{},json.dumps({'businessId':'fixture','id':'council','filename':'synthetic.md','text':'نمونه','seat':'alavi','collections':['council']}).encode()
        with patch.object(server,'_s3_ready',return_value=True),patch.object(server,'kb_migrate'),patch.object(server,'kb_list',return_value=items),patch.object(server,'_s3',side_effect=get) as body:
            server.council_seat_list('fixture')
        self.assertEqual(body.call_count,1)
        server._kb_invalidate('fixture')
        self.assertFalse(any(k.startswith('fixture') for k in server._kb_docs_cache))

class FailureModes(unittest.TestCase):
    def turn(self, ai=None):
        def system(*a, **kw):
            kw['kb_ids'].append('synthetic-kb')
            return 'دانش مصنوعی آزمایشی'
        with patch.object(server,'assistant_system',side_effect=system),patch.object(server,'agent_enabled',return_value=False),patch.object(server,'agent_event'),patch.object(server,'ai_chat',return_value=ai or {'ok':True,'text':'پاسخ آزمایشی'}) if ai is not None else patch.object(server,'AI_KEY',''):
            return server._sa_reply_turn({'tenant':'fixture','siteId':'synthetic1'}, [{'role':'user','content':'سلام'}], dry_run=True, spec={'agent':'zurvan','persona':'','scope':['zurvan_public'],'model':server.AI_MODEL,'actions':[]})

    def test_no_key(self):
        out=self.turn()
        self.assertTrue(out['unavailable'])
        self.assertIn('تماس',out['text'])

    def test_model_error(self):
        out=self.turn({'ok':False,'error':'private-provider-detail'})
        self.assertTrue(out['unavailable'])
        self.assertNotIn('private-provider-detail',str(out))

    def test_normal_answer(self):
        self.assertEqual(self.turn({'ok':True,'text':'پاسخ آزمایشی'})['text'],'پاسخ آزمایشی')

    def test_kb_connection_exception(self):
        with patch.object(server,'_sa_reply_turn',side_effect=ConnectionError('private-endpoint')):
            self.assertTrue(server.sa_reply({'tenant':'fixture'},[])['unavailable'])

    def test_timeout(self):
        from unittest.mock import Mock
        from concurrent.futures import TimeoutError
        future=Mock()
        future.result.side_effect=TimeoutError()
        future.add_done_callback.side_effect=lambda callback:callback(future)
        with patch.object(server._SA_POOL,'submit',return_value=future):
            out=server.sa_reply({'tenant':'fixture'},[])
        self.assertTrue(out['unavailable'])
        self.assertEqual(out['code'],'timeout')

    def test_disabled_agent_and_unknown_site(self):
        client=TestClient(server.app)
        body={'conversationId':'syntheticconv','visitorId':'syntheticvisitor','agent':'zurvan','messages':[{'role':'user','content':'سلام'}]}
        with patch.object(server,'_w_site_for',return_value=({'siteId':'synthetic1','tenant':'fixture'},'https://example.test',None)),patch.object(server,'_w_public_cfg',return_value={'enabled':True}),patch.object(server,'agent_enabled',return_value=False),patch.object(server,'agent_cfg',return_value={}),patch.object(server,'agent_candidates',return_value=[]):
            server._w_hits.clear()
            r=client.post('/api/widget/public/synthetic1/chat',json=body)
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['code'],'disabled_agent')
        with patch.object(server,'_w_load',return_value={'sites':{}}):
            r=client.post('/api/widget/public/unknownsite/chat',json=body)
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['code'],'unknown_site')
        self.assertNotIn('Access-Control-Allow-Origin',r.headers)
        with patch.object(server,'_w_load',return_value={'sites':{}}):
            config=client.get('/api/widget/public/unknownsite/config')
        self.assertEqual(config.status_code,200)
        self.assertFalse(config.json()['enabled'])
        self.assertTrue(config.json()['unavailable'])

    def test_untrusted_origin_stays_forbidden(self):
        from fastapi.responses import JSONResponse
        with patch.object(server,'_w_site_for',return_value=(None,'',JSONResponse({},status_code=403))):
            r=TestClient(server.app).post('/api/widget/public/synthetic1/chat',json={})
        self.assertEqual(r.status_code,403)

    def test_config_connection_failure_is_handled(self):
        with patch.object(server, '_w_site_for', return_value=({'siteId':'synthetic1','tenant':'fixture'}, 'https://example.test', None)), patch.object(server, '_w_public_cfg', side_effect=ConnectionError('private-config-detail')):
            response=TestClient(server.app).get('/api/widget/public/synthetic1/config')
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.json()['enabled'])
        self.assertTrue(response.json()['unavailable'])
        self.assertNotIn('private-config-detail',response.text)
