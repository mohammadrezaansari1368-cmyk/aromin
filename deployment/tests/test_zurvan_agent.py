"""Offline security boundaries for ZURVAN; synthetic data only."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools'))
import server

class Registry(unittest.TestCase):
    def test_registered_scoped_model_and_route(self):
        self.assertIn('zurvan', server.AGENT_KEYS)
        c = server.agent_norm({'enabled': True, 'agents': {'zurvan': {'enabled': True}}})
        with patch.object(server, 'agent_cfg', return_value=c):
            r = server.agent_route('a', 'website', 'زروان حضور و غیاب')
            s = server.agent_spec('a', r, [], 'site12345', False)
        self.assertEqual(s['scope'], ['zurvan_public'])
        self.assertEqual(s['model'], server.AI_MODEL)
        self.assertNotIn('web_search', s['actions'])
        self.assertTrue(server.agent_registry_validate({'zurvan': {'model': 'unconfigured-model'}}))
        self.assertEqual(server.agent_registry_validate({'zurvan': {'model': server.AI_MODEL}}), [])

class Sanitizer(unittest.TestCase):
    def test_secret_values_and_addresses_never_survive(self):
        from generate_zurvan_kb import sanitize
        dirty = 'API_KEY=synthetic-secret\npassword: hello-world\nssh user@10.2.3.4 -i ~/.ssh/id_rsa\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\nhttp://user:pass@192.168.1.5:8080\nBearer abc.def.ghi\nTOKEN = "abc"\nحضور و غیاب'
        clean = sanitize(dirty)
        for value in ('synthetic-secret','hello-world','10.2.3.4','id_rsa','192.168.1.5','abc.def.ghi','user:pass','PRIVATE KEY'):
            self.assertNotIn(value, clean)
        self.assertIn('حضور و غیاب', clean)

class Proposals(unittest.TestCase):
    def test_confirmation_tenant_replay_and_audit(self):
        from zurvan_setup import SetupService, FakeAdapter
        adapter = FakeAdapter({'a': {'headcount': 5}, 'b': {'headcount': 9}})
        state = {'proposals': {}, 'audit': []}
        s = SetupService(state, adapter)
        p = s.propose('a', 'owner', [{'setting': 'headcount', 'proposed': 7, 'why': 'درخواست مالک'}])
        with self.assertRaises(PermissionError): s.apply('a', 'owner', p['id'])
        with self.assertRaises(PermissionError): s.confirm('b', 'owner', p['id'], True)
        with self.assertRaises(PermissionError): s.confirm('a', 'owner', p['id'], 'yes')
        s.confirm('a', 'owner', p['id'], True)
        s.apply('a', 'owner', p['id'])
        with self.assertRaises(ValueError): s.apply('a', 'owner', p['id'])
        self.assertEqual(adapter.read('b')['headcount'], 9)
        self.assertEqual(adapter.read('a')['headcount'], 7)
        self.assertEqual([x['event'] for x in state['audit']], ['proposal', 'confirm', 'apply'])
        self.assertTrue(all(x['tenant']=='a' and x['who']=='owner' and x['when'] and 'before' in x and 'after' in x for x in state['audit']))

    def test_stale_and_rejected_proposals_cannot_apply(self):
        from zurvan_setup import SetupService, FakeAdapter
        a = FakeAdapter({'a': {'headcount': 5}})
        s = SetupService({'proposals': {}, 'audit': []}, a)
        p = s.propose('a', 'owner', [{'setting':'headcount','proposed':8,'why':'درخواست'}])
        s.confirm('a','owner',p['id'],True)
        a.settings['a']['headcount'] = 6
        with self.assertRaises(ValueError): s.apply('a','owner',p['id'])
        s.reject('a','owner',p['id'])
        with self.assertRaises(ValueError): s.apply('a','owner',p['id'])

class SurfaceSecurity(unittest.TestCase):
    def test_setup_http_requires_tenant_identity_and_manager(self):
        from fastapi.testclient import TestClient
        c=TestClient(server.app)
        for identity,status in [(None,401),({'user':'s','role':'sales','tenant':'a'},403)]:
            with patch.object(server,'kb_identity',return_value=identity):
                self.assertEqual(c.post('/api/agent/zurvan/setup/confirm?tenant=a',json={'id':'x','uiConfirm':True}).status_code,status)

    def test_model_is_passed_to_existing_arvan_turn(self):
        cfg=server.agent_norm({'agents':{'zurvan':{'enabled':True}}})
        with patch.object(server,'agent_cfg',return_value=cfg):
            spec=server.agent_spec('a',{'agent':'zurvan'},[],log=False)
        with patch.object(server,'ai_chat',return_value={'ok':True,'text':'اطلاعات ندارم'}) as ai:
            server._agent_turn({'messages':[{'role':'user','content':'نصب؟'}]},'s','a','manager',spec)
        self.assertEqual(ai.call_args.kwargs['model'],server.AI_MODEL)
        self.assertTrue(ai.call_args.kwargs['arvan_only'])
        self.assertEqual(spec['scope'],['zurvan_public','zurvan_setup'])

class PersistentSetup(unittest.TestCase):
    def test_http_proposals_are_persisted_and_cross_tenant_confirmation_fails(self):
        import sqlite3
        import tempfile
        from db_fake import Connection
        from fastapi.testclient import TestClient
        from zurvan_setup import FakeAdapter
        with tempfile.TemporaryDirectory() as directory:
            database=Path(directory)/'synthetic.sqlite'
            cx=sqlite3.connect(database)
            cx.execute('CREATE TABLE zurvan_setup_state(tenant TEXT PRIMARY KEY,data TEXT NOT NULL)');cx.commit();cx.close()
            def query(sql,args=()):
                c=Connection(database)
                try:
                    cursor=c.cursor();cursor.execute(sql,args);return cursor.fetchall()
                finally:c.close()
            with patch.object(server,'db_conn',side_effect=lambda:Connection(database)), patch.object(server,'q',side_effect=query), patch.object(server,'agent_tables',return_value=True), patch.object(server,'kb_identity',side_effect=lambda request,tenant:{'tenant':tenant,'user':'owner-'+tenant,'role':'manager'}), patch.object(server,'ZURVAN_ADAPTER',FakeAdapter({'a':{'headcount':5},'b':{'headcount':9}})):
                client=TestClient(server.app)
                response=client.post('/api/agent/zurvan/setup/propose?tenant=a',json={'changes':[{'setting':'headcount','proposed':7,'why':'owner request'}]})
                self.assertEqual(response.status_code,200,response.text)
                pid=next(iter(response.json()['state']['proposals']))
                self.assertEqual(client.post('/api/agent/zurvan/setup/apply?tenant=a',json={'id':pid}).status_code,403)
                self.assertEqual(client.post('/api/agent/zurvan/setup/confirm?tenant=b',json={'id':pid,'uiConfirm':True}).status_code,403)
                self.assertEqual(client.post('/api/agent/zurvan/setup/confirm?tenant=a',json={'id':pid,'uiConfirm':True}).status_code,200)
                self.assertEqual(client.post('/api/agent/zurvan/setup/apply?tenant=a',json={'id':pid}).status_code,200)
                state=client.get('/api/agent/zurvan/setup?tenant=a').json()['state']
                self.assertEqual([x['event'] for x in state['audit']],['proposal','confirm','apply'])


class BridgeSecret(unittest.TestCase):
    def test_stored_token_maps_primary_tenant_and_env_wins(self):
        tok = 'A' * 43
        with patch.object(server, '_zurvan_connections', {}), patch.object(server, 'secret_get', return_value=tok):
            c = server.zurvan_connections()
            self.assertEqual(list(c), [server.ZURVAN_TENANT])
            self.assertEqual(c[server.ZURVAN_TENANT]['url'], 'https://zurvan.aromin.ir/api/zurvan-agent')
            self.assertEqual(c[server.ZURVAN_TENANT]['token'], tok)
            self.assertIsInstance(server.zurvan_adapter(), server.RemoteAdapter)
        with patch.object(server, '_zurvan_connections', {}), patch.object(server, 'secret_get', return_value='short'):
            self.assertEqual(server.zurvan_connections(), {})
            self.assertIsInstance(server.zurvan_adapter(), server.UnavailableAdapter)
        env = {'x': {'url': 'u', 'businessId': 'b', 'token': 'B' * 43}}
        with patch.object(server, '_zurvan_connections', env), patch.object(server, 'secret_get', return_value=tok):
            self.assertIs(server.zurvan_connections(), env)
        self.assertEqual(server.SECRET_NAMES['zurvan_bridge']['kind'], 'token')
