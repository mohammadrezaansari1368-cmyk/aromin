"""Durable queue state transitions with synthetic data; no live network/DB."""
import json
from contextlib import closing
import sqlite3
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aromin_jobs as jobs
import server
from db_fake import Connection, load_schema


class Queue(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db = str(Path(tmp.name) / 'queue.sqlite')
        load_schema(Path(server.HERE) / 'migrations/014_background_jobs.sql', self.db)
        self.now = 100000
        self.store = jobs.Store(lambda: Connection(self.db), clock=lambda: self.now)

    def enqueue(self, key='request-1234', tenant='team', kind='ledger_audit', payload=None):
        return self.store.enqueue(tenant, 'manager', kind, payload or {'fy':'1405'}, key)

    def test_idempotency_reuses_job_but_rejects_changed_request(self):
        first, created = self.enqueue()
        self.assertTrue(created)
        again, created = self.enqueue()
        self.assertFalse(created)
        self.assertEqual(first['id'], again['id'])
        with self.assertRaises(jobs.Conflict): self.enqueue(payload={'fy':'1404'})
        self.assertEqual(len(self.store.list('team')), 1)
        self.assertNotIn('payload_json', first)
        self.assertNotIn('requested_by', first)

    def test_tenant_isolation_for_result_cancel_retry_and_idempotency(self):
        a, _ = self.enqueue()
        b, _ = self.enqueue(tenant='other')
        self.assertNotEqual(a['id'], b['id'])
        self.assertIsNone(self.store.get('other', a['id']))
        self.assertFalse(self.store.cancel('other', a['id']))
        self.assertFalse(self.store.retry('other', a['id']))
        self.assertEqual(len(self.store.list('other')), 1)

    def test_success_and_redacted_listing(self):
        first, _ = self.enqueue()
        job = self.store.claim()
        self.assertEqual((job['status'], job['attempts']), ('running', 1))
        self.assertIsNone(self.store.claim())
        self.assertTrue(self.store.complete(job['id'], job['lease_token'], {'checked':12}))
        row = self.store.get('team', first['id'])
        self.assertEqual((row['status'], row['result']), ('succeeded', {'checked':12}))
        self.assertNotIn('result', self.store.list('team')[0])
        self.assertNotIn('lease_token', row)
        self.assertFalse(self.store.complete(job['id'], job['lease_token'], {'checked':99}))

    def test_expired_worker_cannot_renew_or_overwrite_reclaimed_job(self):
        self.enqueue()
        old = self.store.claim(10000)
        self.now += 10001
        self.assertFalse(self.store.renew(old['id'], old['lease_token']))
        self.assertFalse(self.store.complete(old['id'], old['lease_token'], {'stale':True}))
        new = self.store.claim(10000)
        self.assertEqual(new['attempts'], 2)
        self.assertNotEqual(old['lease_token'], new['lease_token'])
        self.assertFalse(self.store.fail(old['id'], old['lease_token']))
        self.assertTrue(self.store.complete(new['id'], new['lease_token'], {'fresh':True}))

    def test_retries_back_off_and_stop_then_manual_retry_preserves_attempts(self):
        self.enqueue()
        for attempt in range(1, 4):
            job = self.store.claim()
            self.assertEqual(job['attempts'], attempt)
            self.assertTrue(self.store.fail(job['id'], job['lease_token'], 'execution_timeout'))
            row = self.store.get('team', job['id'])
            if attempt < 3:
                self.assertEqual(row['status'], 'retry_wait')
                self.assertIsNone(self.store.claim())
                self.now = row['available_at']
        self.assertEqual(row['status'], 'failed')
        self.assertIsNone(self.store.claim())
        self.assertTrue(self.store.retry('team', job['id']))
        retry = self.store.claim()
        self.assertEqual((retry['attempts'], retry['max_attempts']), (4, 6))

    def test_expired_final_attempt_becomes_failed(self):
        self.enqueue()
        with closing(sqlite3.connect(self.db)) as cx:
            cx.execute('UPDATE background_jobs SET attempts=2')
            cx.commit()
        job = self.store.claim(10000)
        self.now += 10001
        self.assertIsNone(self.store.claim())
        self.assertEqual(self.store.get('team', job['id'])['status'], 'failed')

    def test_cancel_fences_running_worker(self):
        row, _ = self.enqueue()
        running = self.store.claim()
        self.assertTrue(self.store.cancel('team', row['id']))
        self.assertFalse(self.store.renew(row['id'], running['lease_token']))
        self.assertFalse(self.store.complete(row['id'], running['lease_token'], {'bad':1}))
        self.assertEqual(self.store.get('team', row['id'])['status'], 'cancelled')
        self.assertIsNone(self.store.claim())

    def test_invalid_work_and_oversized_results_are_rejected(self):
        for kind, payload in [('shell',{'command':'echo unsafe'}), ('performance_report',{'start':'1405/13/01','end':'1405/01/01'}), ('ledger_audit',{'fy':'1405','url':'https://example.com'})]:
            with self.assertRaises(ValueError): self.enqueue(kind=kind,payload=payload)
        self.enqueue()
        job = self.store.claim()
        with self.assertRaises(ValueError): self.store.complete(job['id'], job['lease_token'], {'text':'x' * jobs.MAX_RESULT})
        self.assertEqual(self.store.get('team',job['id'])['status'],'running')

    def test_concurrent_workers_claim_distinct_jobs(self):
        for i in range(8): self.enqueue(key=f'request-{i:04}')
        found, errors = [], []
        def claim():
            try: found.append(self.store.claim()['id'])
            except Exception as error: errors.append(error)
        threads = [threading.Thread(target=claim) for _ in range(8)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(errors, [])
        self.assertEqual(len(set(found)), 8)


class Endpoints(Queue):
    def setUp(self):
        super().setUp()
        self.ident = {'user':'manager','role':'manager'}
        patcher = patch.dict(server.os.environ, {'AROMIN_JOBS_ENABLED':'1'})
        patcher.start(); self.addCleanup(patcher.stop)
        patcher = patch.object(server,'kb_identity',side_effect=lambda *_:self.ident)
        patcher.start(); self.addCleanup(patcher.stop)
        patcher = patch.object(server,'db_conn',side_effect=lambda:Connection(self.db))
        patcher.start(); self.addCleanup(patcher.stop)

    def test_permissions_fail_before_database(self):
        for role, status in [('sales',403),('salesmgr',403),('finance',403),('support',403),(None,401)]:
            self.ident = {'user':'u','role':role} if role else None
            with patch.object(server,'db_conn',side_effect=AssertionError('must not access DB')):
                self.assertEqual(server.jobs_list(None,'team').status_code,status)
        self.ident = {'user':'manager','role':'manager'}
        with patch.dict(server.os.environ, {'AROMIN_JOBS_ENABLED':'0'}):
            self.assertEqual(server.jobs_list(None,'team').status_code,503)

    def test_create_get_cancel_are_tenant_scoped(self):
        response = server.jobs_create(None,{'tenant':'team','kind':'ledger_audit','payload':{'fy':'1405'},'idempotencyKey':'request-1234'})
        self.assertEqual(response.status_code,201)
        job_id = json.loads(response.body)['job']['id']
        self.assertEqual(server.jobs_get(job_id,None,'other').status_code,404)
        self.assertEqual(server.jobs_action(job_id,'cancel',None,{'tenant':'other'}).status_code,404)
        self.assertEqual(server.jobs_action(job_id,'cancel',None,{'tenant':'team'})['job']['status'],'cancelled')
        self.assertEqual(server.jobs_action(job_id,'retry',None,{'tenant':'team'}).status_code,409)
