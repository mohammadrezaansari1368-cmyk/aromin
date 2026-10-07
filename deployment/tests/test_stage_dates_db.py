"""Correction transaction regression on the explicitly enabled disposable local DB."""
import contextlib
import copy
import io
import os
import unittest
from unittest.mock import patch
import test_stage_dates as fixtures
import fix_stage_dates as fix
import server

@unittest.skipUnless(os.environ.get('AROMIN_LOCAL_INTEGRATION') == '1', 'requires disposable local MariaDB')
class CorrectionDatabase(unittest.TestCase):
    tenant = 'codex_stage_fix_test'

    def test_dry_run_apply_idempotency_rollback_and_backup_failure(self):
        self.assertEqual(server.CFG_DB['database'], 'aromin_dev')
        self.assertEqual(server.CFG_DB['host'], '127.0.0.1')
        server.ensure_tenant_table()
        full = fixtures.blob([fixtures.deal(stageChangedAt='16:32:51 1405/06/31')])
        server._c1_save(self.tenant, full)
        before = copy.deepcopy(server._tenant_full(self.tenant))
        def run(*args):
            with contextlib.redirect_stdout(io.StringIO()) as buf:
                self.assertEqual(fix.main(['--tenant', self.tenant, *args]), 0)
            import json
            return json.loads(buf.getvalue())
        try:
            out = run()
            self.assertEqual(out['mode'], 'dry-run')
            self.assertEqual(server._tenant_full(self.tenant), before)
            # Deliberate backup failure must leave the business payload untouched.
            with patch.object(server, 'ensure_backup_table', side_effect=RuntimeError('backup unavailable')):
                with self.assertRaises(RuntimeError): run('--apply')
            self.assertEqual(server._tenant_full(self.tenant), before)
            applied = run('--apply')
            after = server._tenant_full(self.tenant)
            self.assertEqual(after['people'][0]['inv'][0]['saleDate'], '1405/06/31')
            self.assertEqual(run('--apply')['fields_changed'], 0)
            reverted = run('--rollback', applied['run_id'])
            self.assertGreater(reverted['reverted'], 0)
            restored = server._tenant_full(self.tenant)
            self.assertEqual(restored['people'], before['people'])
            self.assertEqual(restored.get('saleDates'), before.get('saleDates'))
        finally:
            server.q('DELETE FROM data_fix_audit WHERE tenant=%s', (self.tenant,))
            server.q('DELETE FROM tenant_backups WHERE tenant=%s', (self.tenant,))
            server.q('DELETE FROM tenant_state WHERE tenant=%s', (self.tenant,))
