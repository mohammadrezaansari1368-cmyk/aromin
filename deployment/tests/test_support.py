"""Synthetic support intake and durable handoff contracts."""
import copy
import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from aromin_support import Support, SupportError, chunks, unchunks, verify_payload


class SupportTests(unittest.TestCase):
    def setUp(self):
        self.now = 1800000000
        self.state = {}
        self.s = Support(self.state, 'tenant-a', 'k' * 40, lambda: self.now)
        self.link = self.s.link('generate')['token']

    def complete(self):
        session = self.s.start(self.link)['sessionId']
        for text in ['مشتری آزمایشی', 'test@example.invalid', 'فروشگاه آزمایشی', 'راهنمایی', '<script>synthetic</script>', 'عادی', 'بله']:
            self.s.message(self.link, session, text)
        return session, self.s.submit(self.link, session)

    def test_consent_and_stable_idempotent_enqueue(self):
        sid = self.s.start(self.link)['sessionId']
        with self.assertRaises(SupportError): self.s.submit(self.link, sid)
        sid, out = self.complete()
        self.assertEqual(out, self.s.submit(self.link, sid))
        self.assertEqual(len(self.state['requests']), 1)
        payload = self.state['requests'][out['reference']]['payload']
        self.assertTrue(verify_payload(payload, 'k' * 40))
        self.assertNotIn('test@', payload['chatSummary'])
        self.assertNotIn('script', payload['chatSummary'])
        self.assertNotIn('test@', json.dumps(self.state['audit']))

    def test_rotation_revocation_and_cross_tenant(self):
        other = Support({}, 'tenant-b', 'k' * 40)
        other.link('generate')
        with self.assertRaises(SupportError): other.start(self.link)
        self.s.link('rotate')
        with self.assertRaises(SupportError): self.s.start(self.link)
        link = self.s.link('rotate')['token']
        self.s.link('revoke')
        with self.assertRaises(SupportError): self.s.start(link)

    def test_retry_lease_and_idempotent_ack(self):
        _, out = self.complete()
        item = self.s.pull(1)['items'][0]
        self.assertEqual(self.s.pull(1)['items'], [])
        self.now += 121
        newer = self.s.pull(1)['items'][0]
        with self.assertRaises(SupportError): self.s.ack(out['reference'], item['receipt'], 'done', '')
        self.s.ack(out['reference'], newer['receipt'], 'executing', '')
        self.s.ack(out['reference'], newer['receipt'], 'done', 'انجام شد')
        self.s.ack(out['reference'], newer['receipt'], 'done', 'انجام شد')
        self.assertEqual(self.s.pull(1)['items'], [])
        self.assertEqual(self.s.view()['requests'][0]['status'], 'done')

    def test_cross_tenant_ack_and_nack_backoff(self):
        _, out = self.complete()
        item = self.s.pull(1)['items'][0]
        other = Support({}, 'tenant-b', 'k' * 40)
        with self.assertRaises(SupportError): other.ack(out['reference'], item['receipt'], 'done', '')
        self.s.nack(out['reference'], item['receipt'])
        self.assertEqual(self.s.pull(1)['items'], [])
        self.now += 61
        self.assertEqual(len(self.s.pull(1)['items']), 1)

    def test_bounded_chunks_and_corruption_rejected(self):
        state = {'text': 'سلام😀' * 600}
        rows = chunks(state)
        self.assertTrue(all(len(k) <= 32 and len(v) <= 255 for k,v in rows.items()))
        self.assertEqual(unchunks(rows), state)
        rows.pop('sup:000001')
        with self.assertRaises(SupportError): unchunks(rows)

    def test_input_caps_and_no_raw_link_storage(self):
        sid = self.s.start(self.link)['sessionId']
        with self.assertRaises(SupportError): self.s.message(self.link, sid, 'x' * 2001)
        self.assertNotIn(self.link, json.dumps(self.state))
        self.assertNotIn('linkHash', json.dumps(self.s.view()))

    def test_no_consent_does_not_enqueue(self):
        sid = self.s.start(self.link)['sessionId']
        for text in ['نام', 'test@example.invalid', 'نمونه', 'راهنمایی', 'نمونه', 'عادی', 'خیر']:
            self.s.message(self.link, sid, text)
        with self.assertRaises(SupportError): self.s.submit(self.link, sid)
        self.assertFalse(self.state.get('requests'))

    def test_tampered_signature(self):
        _, out = self.complete()
        payload = copy.deepcopy(self.state['requests'][out['reference']]['payload'])
        payload['tenantId'] = 'tenant-b'
        self.assertFalse(verify_payload(payload, 'k' * 40))

class SupportAPI(unittest.TestCase):
    def setUp(self):
        import server
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        self.server, self.patch = server, patch
        self.states = {}
        self.env = patch.dict('os.environ', {'SOROUSH_SUPPORT_SIGNING_KEY': 'k' * 40, 'SOROUSH_SUPPORT_TOKENS_JSON': json.dumps({'tenant-a':'a'*40,'tenant-b':'b'*40})})
        self.env.start(); self.addCleanup(self.env.stop)
        def run(tenant, operation):
            state = copy.deepcopy(self.states.get(tenant, {}))
            out = operation(Support(state, tenant, 'k'*40))
            self.states[tenant] = state
            return out
        self.storage = patch.object(server, '_support_run', side_effect=run)
        self.storage.start(); self.addCleanup(self.storage.stop)
        self.guard = patch.object(server, '_w_guard', return_value=({'role':'manager','user':'synthetic'}, None))
        self.guard.start(); self.addCleanup(self.guard.stop)
        server._w_hits.clear()
        self.client = TestClient(server.app)
        self.link = self.client.post('/api/agent/support/link?tenant=tenant-a', json={'action':'generate'}).json()['token']
        self.headers = {'X-Support-Link':self.link}

    def test_link_cannot_choose_another_tenant(self):
        r = self.client.post('/api/support/session', headers=self.headers, json={'tenantId':'tenant-b'})
        self.assertEqual(r.status_code, 400)
        r = self.client.post('/api/support/session', headers=self.headers, json={})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('tenant-b', self.states)

    def test_auth_scoping_body_origin_and_revocation(self):
        self.assertEqual(self.client.post('/api/soroush/pull', json={'tenantId':'tenant-a'}).status_code, 401)
        auth = {'Authorization':'Bearer ' + 'a'*40}
        self.assertEqual(self.client.post('/api/soroush/pull', headers=auth, json={'tenantId':'tenant-b'}).status_code, 401)
        self.assertEqual(self.client.post('/api/support/message', headers=self.headers, content='x'*4097).status_code, 413)
        self.assertEqual(self.client.post('/api/support/session', headers={**self.headers,'Origin':'https://evil.invalid'}, json={}).status_code, 403)
        self.client.post('/api/agent/support/link?tenant=tenant-a', json={'action':'revoke'})
        self.assertEqual(self.client.post('/api/support/session', headers=self.headers, json={}).status_code, 404)

    def test_full_handoff_and_cross_tenant_ack(self):
        sid = self.client.post('/api/support/session', headers=self.headers, json={}).json()['sessionId']
        for step, text in enumerate(['نام', 'test@example.invalid', 'نمونه', 'خطا', '<img src=x onerror=alert(1)>', 'فوری', 'بله']):
            r = self.client.post('/api/support/message', headers=self.headers, json={'sessionId':sid,'message':text,'expectedStep':step})
            self.assertEqual(r.status_code, 200)
        submitted = self.client.post('/api/support/submit', headers=self.headers, json={'sessionId':sid}).json()
        rid = submitted['reference']
        self.assertEqual(self.client.post('/api/support/submit', headers=self.headers, json={'sessionId':sid}).json(), submitted)
        auth_a, auth_b = {'Authorization':'Bearer '+'a'*40}, {'Authorization':'Bearer '+'b'*40}
        self.assertEqual(self.client.post('/api/soroush/pull', headers=auth_b, json={'tenantId':'tenant-b'}).json()['items'], [])
        delivery = self.client.post('/api/soroush/pull', headers=auth_a, json={'tenantId':'tenant-a'}).json()['items'][0]
        self.assertTrue(verify_payload(delivery['payload'], 'k'*40))
        body = {'tenantId':'tenant-b','receipt':delivery['receipt'],'status':'executing'}
        self.assertEqual(self.client.post('/api/soroush/requests/'+rid+'/ack', headers=auth_b, json=body).status_code, 404)
        body['tenantId'] = 'tenant-a'
        self.assertEqual(self.client.post('/api/soroush/requests/'+rid+'/ack', headers=auth_b, json=body).status_code, 401)
        self.assertEqual(self.client.post('/api/soroush/requests/'+rid+'/ack', headers=auth_a, json=body).status_code, 200)
        body.update(status='done', resultNote='انجام شد؛ Authorization: Bearer ' + 'a'*40)
        self.assertEqual(self.client.post('/api/soroush/requests/'+rid+'/ack', headers=auth_a, json=body).status_code, 200)
        dashboard = self.client.get('/api/agent/support?tenant=tenant-a').json()
        self.assertEqual(dashboard['requests'][0]['status'], 'done')
        self.assertNotIn('test@', json.dumps(dashboard))
        self.assertNotIn(delivery['receipt'], json.dumps(dashboard))
        self.assertNotIn('a'*40, json.dumps(dashboard))

    def test_service_poll_budget_does_not_consume_customer_quota(self):
        for _ in range(70):
            r = self.client.post('/api/soroush/pull', headers={'Authorization':'Bearer '+'a'*40}, json={'tenantId':'tenant-a'})
            self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.post('/api/support/session', headers=self.headers, json={}).status_code, 200)

    def test_customer_page_has_no_credentials_and_safe_headers(self):
        r = self.client.get('/support')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers['referrer-policy'], 'no-referrer')
        self.assertIn("default-src 'none'", r.headers['content-security-policy'])
        self.assertNotIn('k'*40, r.text)
        self.assertNotIn(self.link, r.text)

class SupportStorage(unittest.TestCase):
    """Exercise production SQL shape and rollback with a local transactional adapter.
    MariaDB row-lock concurrency still requires the integration environment.
    """
    def test_roundtrip_tenant_filter_and_rollback(self):
        import sqlite3
        import server
        from unittest.mock import patch
        cx = sqlite3.connect(':memory:')
        self.addCleanup(cx.close)
        cx.row_factory = sqlite3.Row
        cx.execute('CREATE TABLE sa_state(tenant TEXT COLLATE NOCASE, k TEXT CHECK(length(k)<=32), v TEXT CHECK(length(v)<=255), PRIMARY KEY(tenant,k))')
        statements = []
        class Tx:
            def __enter__(self):
                cx.execute('BEGIN'); return self
            def __exit__(self, typ, val, tb):
                cx.rollback() if typ else cx.commit()
            def x(self, sql, args=None):
                statements.append(sql)
                sql = sql.replace('INSERT IGNORE', 'INSERT OR IGNORE').replace(' FOR UPDATE','').replace('BINARY tenant', 'tenant COLLATE BINARY').replace('%s','?').replace('%%','%')
                return cx.execute(sql, args or ())
            def one(self, sql, args=None): return self.x(sql, args).fetchone()
        with patch.dict('os.environ', {'SOROUSH_SUPPORT_SIGNING_KEY':'k'*40}), patch.object(server, '_SaTx', Tx):
            token = server._support_run('a', lambda s:s.link('generate'))['token']
            self.assertTrue(server._support_run('a', lambda s:s.view())['enabled'])
            self.assertFalse(server._support_run('b', lambda s:s.view())['enabled'])
            with self.assertRaises(SupportError): server._support_run('A', lambda s:s.view())
            before = [tuple(r) for r in cx.execute('SELECT * FROM sa_state ORDER BY tenant,k')]
            def broken(s):
                s.link('revoke'); raise RuntimeError('synthetic failure')
            with self.assertRaises(RuntimeError): server._support_run('a', broken)
            self.assertEqual(before, [tuple(r) for r in cx.execute('SELECT * FROM sa_state ORDER BY tenant,k')])
            server._support_run('a', lambda s:s.start(token))
            self.assertTrue(any('FOR UPDATE' in sql for sql in statements))
            self.assertTrue(all('tenant=%s' in sql or sql.startswith('INSERT') for sql in statements))

class SupportKB(unittest.TestCase):
    def test_public_scope_is_bound_to_link_tenant_and_registry(self):
        import server
        from unittest.mock import patch
        with patch.object(server, 'agent_spec', return_value={'scope':['support','private','dashboard_help'],'persona':'synthetic','model':'fixture'}), patch.object(server, '_support_run', return_value='tenant support template'), patch.object(server, 'kb_context', return_value='synthetic') as system, patch.object(server, 'ai_chat', return_value={'ok':True,'text':'پاسخ آزمایشی'}):
            self.assertEqual(server._support_answer('tenant-a', 'پرسش'), 'پاسخ آزمایشی')
            self.assertEqual(system.call_args.args[0], 'tenant-a')
            self.assertTrue(system.call_args.kwargs['public'])
            self.assertEqual(system.call_args.kwargs['scope'], ['support','dashboard_help','smartx'])

class SupportAdditional(unittest.TestCase):
    def setUp(self):
        self.now = 1800000000
        self.state = {}
        self.s = Support(self.state, 'tenant-a', 'k'*40, lambda:self.now)
        self.link = self.s.link('generate')['token']

    def fill(self):
        sid = self.s.start(self.link)['sessionId']
        for text in ['نام', 'test@example.invalid', 'کسب‌وکار', 'خطا', 'جزئیات', 'فوری', 'بله']:
            self.s.message(self.link, sid, text)
        return sid

    def test_duplicate_terminal_ack_is_audited(self):
        rid = self.s.submit(self.link, self.fill())['reference']
        item = self.s.pull(1)['items'][0]
        self.s.ack(rid, item['receipt'], 'executing', '')
        self.s.ack(rid, item['receipt'], 'done', '')
        before = len(self.state['audit'])
        self.s.ack(rid, item['receipt'], 'done', '')
        self.assertEqual(len(self.state['audit']), before + 1)

    def test_strict_execution_transition(self):
        rid = self.s.submit(self.link, self.fill())['reference']
        item = self.s.pull(1)['items'][0]
        with self.assertRaises(SupportError): self.s.ack(rid, item['receipt'], 'done', '')

    def test_details_schema_cap_and_queue_full(self):
        sid = self.s.start(self.link)['sessionId']
        for text in ['نام', 'test@example.invalid', 'b'*200, 'خطا', 'd'*1700, 'فوری', 'بله']:
            self.s.message(self.link, sid, text)
        out = self.s.submit(self.link, sid)
        self.assertLessEqual(len(self.state['requests'][out['reference']]['payload']['details']), 2000)
        template = copy.deepcopy(self.state['requests'][out['reference']])
        self.state['requests'] = {str(i):copy.deepcopy(template) for i in range(100)}
        with self.assertRaises(SupportError): self.s.submit(self.link, self.fill())

    def test_out_of_order_or_retried_message_does_not_shift_slots(self):
        sid = self.s.start(self.link)['sessionId']
        first = self.s.message(self.link, sid, 'نام', expected_step=0)
        self.assertEqual(self.s.message(self.link, sid, 'نام', expected_step=0), first)
        with self.assertRaises(SupportError): self.s.message(self.link, sid, 'دیگر', expected_step=0)
        self.assertEqual(self.state['sessions'][sid]['step'], 1)

class SupportNoKnowledgeLeak(unittest.TestCase):
    def test_no_model_call_without_business_knowledge(self):
        import server
        from unittest.mock import patch
        with patch.object(server,'agent_spec',return_value={'scope':['support'],'model':'fixture','persona':'private-owner-text'}), patch.object(server,'kb_context',return_value=''), patch.object(server,'ai_chat') as model:
            out = server._support_answer('tenant-a','تماس شما چیست؟')
            self.assertIn('دانش', out)
            model.assert_not_called()

    def test_no_global_identity_or_dashboard_persona(self):
        import server
        from unittest.mock import patch
        with patch.object(server,'agent_spec',return_value={'scope':['support'],'model':'fixture','persona':'private-owner-text'}), patch.object(server,'_support_run',return_value='tenant support template'), patch.object(server,'kb_context',return_value='دانش عمومی همین کسب‌وکار') as kb, patch.object(server,'ai_chat',return_value={'ok':True,'text':'نمونه'}) as model:
            server._support_answer('tenant-a','پرسش')
            system = model.call_args.args[0]
            self.assertNotIn('private-owner-text', system)
            self.assertNotIn(server.AROMIN_PHONE_FA, system)
            self.assertEqual(kb.call_args.args[0], 'tenant-a')
            self.assertTrue(kb.call_args.kwargs['public'])

class SupportCapacity(unittest.TestCase):
    def test_old_audit_entries_do_not_block_revoke_or_completion(self):
        now = 1800000000
        state = {'audit':[{'event':'ack:executing','requestId':'synthetic','at':now,'actor':'soroush'} for _ in range(20000)]}
        service = Support(state,'tenant-a','k'*40,lambda:now)
        service.link('revoke')
        self.assertLessEqual(len(state['audit']), 2000)

    def test_accepted_requests_have_storage_headroom(self):
        state = {'syntheticPadding':'x'*1250000}
        service = Support(state,'tenant-a','k'*40)
        token = service.link('generate')['token']
        with self.assertRaises(SupportError): service.start(token)
        service.link('revoke')
