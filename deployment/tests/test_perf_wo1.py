"""WO1 synthetic proofs: support parts, contract status, and dormant Zurvan plumbing."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aromin_performance as perf
import aromin_attendance as att
import aromin_calls as calls
import server


class WorkOrderOne(unittest.TestCase):
    def metric(self, unit, rows, issues=()):
        return {m['id']: m for m in perf.metrics(unit, rows, issues, '1405/07/01', '1405/07/30', None)}

    def row(self, metric, value=1, id=None):
        return {'id': id or metric, 'metric': metric, 'value': value, 'source': 'ticket_logs' if metric == 'tickets' else 'call_logs'}

    def test_support_activity_parts_and_unchanged_efficiency(self):
        ticket = dict(self.row('tickets', id='ticket:1'), onTime=True)
        rows = [ticket, dict(self.row('tickets', id='ticket:2'), onTime=False),
                self.row('calls_in_answered', 3), self.row('calls_out_answered', 4), self.row('calls_missed', 99)]
        result = self.metric('support', rows)
        self.assertEqual(result['activity']['value'], 9)
        self.assertEqual(result['activity']['parts'], {'tickets': 2, 'callsIn': 3, 'callsOut': 4})
        self.assertEqual(result['efficiency']['value'], 50)
        self.assertEqual(self.metric('support', [ticket, ticket])['activity']['value'], 1)
        self.assertEqual(self.metric('support', [self.row('calls_in', 3)])['activity']['value'], 0)

    def test_contract_status_uses_only_relevant_issues(self):
        rows = [self.row('contracts', 100)]
        self.assertEqual(self.metric('sales', rows)['contract_average']['status'], 'valid')
        self.assertEqual(self.metric('sales', rows, [{'metric': 'tasks'}])['contract_average']['status'], 'valid')
        self.assertEqual(self.metric('sales', rows, [{'metric': 'contracts'}])['contract_average']['status'], 'partial')
        self.assertEqual(self.metric('sales', [])['contract_average']['status'], 'no_data')
        self.assertIn('خام', self.metric('sales', rows)['contract_average']['definition'])

    def test_zurvan_not_configured_no_database_or_network(self):
        with patch.object(server, 'ZURVAN_API_URL', ''), patch.object(server, 'q') as db, \
             patch.object(server, '_SaTx') as tx, patch.object(server, 'secret_get') as secret, \
             patch.object(server.urllib.request, 'urlopen') as network:
            self.assertEqual(server.zurvan_sync('synthetic'), {'ok': False, 'error': 'زروان هنوز تنظیم نشده است.'})
            for mock in (db, tx, secret, network): mock.assert_not_called()
        with patch.object(server, 'ZURVAN_API_URL', 'https://device.invalid'), patch.object(server, 'secret_get', return_value=''), \
             patch.object(server, '_SaTx') as tx, patch.object(server.urllib.request, 'urlopen') as network:
            self.assertFalse(server.zurvan_sync('synthetic')['ok'])
            tx.assert_not_called(); network.assert_not_called()

    def test_zurvan_rows_use_existing_parser(self):
        payload = {'rows': [{'card_no': '123', 'date_j': '1405/07/02', 'punches': ['10:00', '18:00'], 'present_min': 450}]}
        sheets = server._zurvan_rows(payload)
        self.assertEqual(sheets['زروان 123'][0]['حضور'], '07:30')
        parsed = att.parse_payload({'fileName': 'test.json', 'sha256': 'a' * 64, 'source': 'zurvan', 'sheets': sheets})
        self.assertEqual(parsed['sheets'][0]['days'][0]['present_min'], 450)
        self.assertEqual(parsed['sheets'][0]['days'][0]['punches'], [600, 1080])
        with self.assertRaises(ValueError): server._zurvan_rows({'unexpected': []})

    def test_zurvan_configured_reuses_ingest(self):
        payload = {'rows': [{'card_no': '123', 'date_j': '1405/07/02', 'punches': ['10:00', '18:00']}]}
        import io, json
        with patch.object(server, 'ZURVAN_API_URL', 'https://device.invalid'), patch.object(server, 'secret_get', return_value='synthetic'), \
             patch.object(server.urllib.request, 'urlopen', return_value=io.StringIO(json.dumps(payload))), \
             patch.object(server, '_tenant_full', return_value={'people': []}), patch.object(server, '_att_ingest', return_value={'ok': True}) as ingest:
            self.assertTrue(server.zurvan_sync('synthetic')['ok'])
            self.assertEqual(ingest.call_args.args[2]['sheets'][0]['days'][0]['present_min'], 480)
            self.assertEqual(ingest.call_args.args[2]['source'], 'zurvan')

    def test_effort_talk_excludes_internal_and_unanswered(self):
        aliases = [{'kind': 'julio', 'alias_key': 'user', 'person_id': '1', 'status': 'confirmed'}]
        def call(direction, status, seconds):
            return dict(date_j='1405/07/02', direction=direction, call_status=status, talk_sec=seconds,
                        total_sec=seconds, time_s=36000, o_ext='101', o_julio='user', d_ext='101', d_julio='user')
        stats = calls.daily_stats([call('in', 'answered', 60), call('out', 'answered', 120),
                                   call('internal', 'answered', 500), call('out', 'missed', 900)], aliases, '1405/07/01', '1405/07/30')
        totals = perf.call_totals(calls.daily_records(stats, performance=True))
        self.assertEqual(totals['effort_talk_seconds'], 180)
        self.assertEqual((totals['calls_in_answered'], totals['calls_out_answered']), (1, 1))


if __name__ == '__main__':
    unittest.main()
