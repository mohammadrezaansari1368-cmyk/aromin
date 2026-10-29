import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
import aromin_worker as worker
from aromin_job_handlers import execute


class Handlers(unittest.TestCase):
    def job(self, kind='ledger_audit', payload=None):
        return {'kind':kind,'payload':payload or {'fy':'1405'},'tenant':'team','requested_by':'boss'}

    def test_revoked_manager_cannot_execute_previously_queued_work(self):
        with patch.object(server,'_tenant_full',return_value={'people':[]}), patch.object(server,'_kb_directory',return_value=({'boss':{'role':'sales'}},[])):
            with self.assertRaises(PermissionError): execute(self.job())

    def test_read_only_ledger_report_never_calls_state_save(self):
        full={'fy':'1405','people':[]}
        with patch.object(server,'_tenant_full',return_value=full), patch.object(server,'_kb_directory',return_value=({'boss':{'role':'manager','pass':'changed-password'}},[])), patch.object(server,'_c1_save',side_effect=AssertionError('must remain read-only')):
            result=execute(self.job())
            self.assertIsInstance(result,dict)
            self.assertNotIn('changed-password',str(result))

    def test_child_returns_sanitized_error_and_closes_pipe(self):
        pipe=Mock()
        job={'kind':'ledger_audit','payload_json':'{"fy":"1405"}','tenant':'team','requested_by':'boss'}
        with patch('aromin_job_handlers.execute',side_effect=RuntimeError('secret-in-error')), patch.object(worker,'public_error'):
            worker._child(pipe,job)
        pipe.send.assert_called_once_with(('retry','processing_failed'))
        pipe.close.assert_called_once()

    def test_parent_deadline_terminates_child_and_schedules_retry(self):
        store=Mock(); parent=Mock(); child=Mock(); proc=Mock()
        proc.is_alive.return_value=True
        context=Mock(); context.Pipe.return_value=(parent,child); context.Process.return_value=proc
        # Expired immediately: no real process, sleeps, DB, or network.
        with patch.object(worker.multiprocessing,'get_context',return_value=context), patch.object(worker.time,'monotonic',side_effect=[0,0,2]):
            worker.process(store,{'id':'j','lease_token':'t'},timeout=1)
        store.fail.assert_called_once_with('j','t','execution_timeout',retry=True)
        proc.terminate.assert_called_once()
        store.complete.assert_not_called()

