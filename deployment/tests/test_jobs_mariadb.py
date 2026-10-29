"""Opt-in queue locking checks on an isolated MariaDB, never production."""
import os
import sys
import threading
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aromin_jobs as jobs
import server


@unittest.skipUnless(os.environ.get('AROMIN_QUEUE_INTEGRATION') == '1', 'isolated MariaDB required')
class MariaQueue(unittest.TestCase):
    def setUp(self):
        if server.CFG_DB['database'] not in ('aromin_dev', 'aromin_queue_test') or server.CFG_DB['host'] not in ('127.0.0.1', 'localhost', 'db'):
            raise RuntimeError('Queue integration requires a named local disposable DB')
        self.tenant = 'queue_test_' + uuid.uuid4().hex[:12]
        self.store = jobs.Store(server.db_conn)
        # Refuse shared databases: claim() intentionally addresses the whole worker queue.
        with self.store.transaction() as cur:
            cur.execute('SELECT COUNT(*) AS n FROM background_jobs')
            if cur.fetchone()['n']:
                raise RuntimeError('Queue integration requires an empty job table')
        self.addCleanup(self.cleanup)

    def cleanup(self):
        with self.store.transaction() as cur:
            cur.execute('DELETE FROM background_jobs WHERE tenant=%s', (self.tenant,))

    def test_concurrent_claims_have_one_owner_and_stale_completion_fails(self):
        for i in range(12):
            self.store.enqueue(self.tenant,'synthetic_manager','ledger_audit',{'fy':'1405'},f'synthetic-{i:04}')
        found, errors, lock = [], [], threading.Lock()
        def claim():
            try:
                row = self.store.claim()
                with lock: found.append(row)
            except Exception as error:
                with lock: errors.append(type(error).__name__)
        workers = [threading.Thread(target=claim) for _ in range(12)]
        for worker in workers: worker.start()
        for worker in workers: worker.join(timeout=30)
        self.assertFalse(any(worker.is_alive() for worker in workers))
        self.assertEqual(errors, [])
        self.assertEqual(len({row['id'] for row in found}),12)
        old = found[0]
        with self.store.transaction() as cur:
            cur.execute('UPDATE background_jobs SET lease_until=0 WHERE id=%s',(old['id'],))
        self.assertFalse(self.store.complete(old['id'],old['lease_token'],{'stale':True}))
        recovered = self.store.claim()
        self.assertEqual(recovered['id'],old['id'])
        self.assertNotEqual(recovered['lease_token'],old['lease_token'])
        self.assertTrue(self.store.complete(recovered['id'],recovered['lease_token'],{'fresh':True}))

