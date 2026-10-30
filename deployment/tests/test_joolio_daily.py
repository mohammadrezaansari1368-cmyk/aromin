import datetime
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class JoolioDaily(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        self.now = datetime.datetime(2026, 10, 29, 18)
        patch.object(server, '_sa_now', return_value=self.now).start()
        patch.object(server, '_sa_all', return_value={}).start()
        self.q = patch.object(server, 'q', side_effect=AssertionError('unexpected DB')).start()
        patch.object(server, '_sa_people', return_value=[{'id': 'r', 'name': 'علی کیانی'}]).start()
        patch.object(server, 'sa_manager', return_value={'id': 'm', 'phone': '09121234567'}).start()
        self.chat = patch.object(server, 'lead_chat_id', return_value='chat').start()
        self.send = patch.object(server, 'lead_send').start()
        self.sms = patch.object(server, '_sa_send_sms', return_value=(True, '')).start()
        self.real_claim = server._sa_claim_day
        self.days = set()
        self.claim = patch.object(server, '_sa_claim_day', side_effect=self.claim_day).start()

    def claim_day(self, tenant, key, day):
        claim = (tenant, key, day)
        if claim in self.days:
            return False
        self.days.add(claim)
        return True

    def payload(self):
        return {'date': '2026-10-29', 'sellers': [dict(name='آقای علي\u200cكياني', calls=10,
            callsOk=4, callsNoAnswer=-1, talkMin=120, deals=4, won=2, wonValue=1000, workdays=2)]}

    def snapshot(self):
        return server.joolio_snapshot('t', self.payload())

    def test_mapping_metrics(self):
        snapshot = self.snapshot()
        row = snapshot['sellers'][0]
        self.assertEqual(row['personId'], 'r')
        self.assertEqual([row[k] for k in ('callsNoAnswer', 'avgContract', 'effortHours', 'efficiency', 'conversion')], [0, 500, 1, 40, 50])
        self.assertIn('جمع تیم', server.joolio_summary(snapshot))
        self.assertEqual(server.joolio_name('خانم کیانی'), 'کیانی')

    def test_zero_unmatched(self):
        payload = self.payload()
        payload['sellers'][0].update(calls=0, won=0, deals=0, workdays=0, name='ناشناس')
        row = server.joolio_snapshot('t', payload)['sellers'][0]
        for key in ('personId', 'avgContract', 'effortHours', 'efficiency', 'conversion'):
            self.assertIsNone(row[key])

    def test_validation(self):
        for key, value in [('calls', True), ('won', 1.5), ('talkMin', float('inf')), ('name', 'x'*121)]:
            payload = self.payload()
            payload['sellers'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                server.joolio_snapshot('t', payload)
        for change in ({'date': '2026-02-30'}, {'sellers': [{}]*101}, {'force': 1}):
            payload = self.payload()
            payload.update(change)
            with self.assertRaises(ValueError):
                server.joolio_snapshot('t', payload)

    def test_daily_force_channels_whatsapp(self):
        with patch.object(server, '_sa_all', return_value={'t': {'joolioReport': {'channels': {'telegram': False, 'sms': True, 'whatsapp': True}}}}):
            with patch('builtins.print') as log:
                sent = server.joolio_send('t', self.snapshot())
                log.assert_any_call('[SA] whatsapp: no API')
            self.assertEqual(sent, dict(bale='ok', telegram='skipped', sms='ok', whatsapp='skipped'))
            self.assertEqual(server.joolio_send('t', self.snapshot())['bale'], 'skipped')
            server.joolio_send('t', self.snapshot(), True)
        self.assertEqual(self.send.call_count, 2)
        self.assertEqual(self.sms.call_count, 2)
        with patch.object(server, '_sa_all', return_value={'t': {'joolioReport': {'enabled': False}}}):
            self.assertEqual(server.joolio_send('t', self.snapshot(), True)['bale'], 'skipped')

    def test_failure_isolated(self):
        self.send.side_effect = [RuntimeError('09121234567'), None]
        with patch('builtins.print') as log:
            sent = server.joolio_send('t', self.snapshot())
        self.assertEqual((sent['bale'], sent['telegram']), ('error', 'ok'))
        self.assertNotIn('09121234567', str(log.call_args_list))

    def test_endpoint(self):
        with patch.object(server, '_sync_auth', return_value=(None, 'denied')):
            self.assertEqual(server.joolio_snapshot_post(None, self.payload(), 't'), 'denied')
        with patch.object(server, '_sync_auth', return_value=({'role': 'manager'}, None)):
            out = server.joolio_snapshot_post(None, self.payload(), 't')
            self.assertEqual((out['matched'], out['unmatched']), (1, 0))

    def test_followup_cutoff_empty_fallback_limit(self):
        leads = [dict(name='مشتری', phone='09121234567', updated_at=self.now-datetime.timedelta(hours=h), status=status, rep=rep)
                 for h, status, rep in [(24, 'assigned', 'a'), (25, 'closed', 'a'), (25, 'assigned', 'b')] + [(49, 'assigned', 'a')]*17]
        def query(sql, args):
            self.assertIn("status='assigned' AND updated_at<%s", sql)
            self.assertEqual(args[2], self.now-datetime.timedelta(hours=24))
            return [r for r in leads if r['status']=='assigned' and r['rep']==args[1] and r['updated_at']<args[2]]
        self.q.side_effect = query
        self.chat.side_effect = lambda tenant, pid, ch: None if ch=='bale' or pid=='c' else 'tg-chat'
        with patch.object(server, 'sa_reps', return_value=[{'id': k} for k in ('a', 'empty', 'c')]):
            server.sa_followup('t')
            server.sa_followup('t')
        self.send.assert_called_once()
        channel, chat, text = self.send.call_args.args
        self.assertEqual(channel, 'tg')
        self.assertIn('و 2 مورد دیگر', text)
        self.assertEqual(sum(line.startswith('مشتری ·') for line in text.splitlines()), 15)
        self.assertNotIn('09121234567', text)

    def test_followup_hour(self):
        with patch.object(server, '_sa_now', return_value=self.now.replace(hour=0)):
            server.sa_followup('t')
        self.claim.assert_not_called()

    def test_config_save(self):
        with patch.object(server, '_sa_guard', return_value=({'role': 'manager'}, None)), patch.object(server, '_sa_save') as save, patch.object(server, 'sales_agent_get', return_value={'ok': True}):
            server.sales_agent_put(None, {'followupHour': 0, 'joolioReport': {'enabled': False, 'hour': 0, 'channels': {'sms': True}}}, 't')
            cfg = save.call_args.args[1]
            self.assertEqual(cfg['followupHour'], 0)
            self.assertFalse(cfg['joolioReport']['enabled'])
            self.assertTrue(cfg['joolioReport']['channels']['sms'])
            self.assertTrue(cfg['joolioReport']['channels']['bale'])
            save.reset_mock()
            response = server.sales_agent_put(None, {'followupHour': True}, 't')
            self.assertEqual(response.status_code, 400)
            save.assert_not_called()

    def test_real_claim(self):
        with patch.object(server, '_SaTx') as tx:
            cursor = tx.return_value.__enter__.return_value
            cursor.one.return_value = {'v': '2026-10-29'}
            self.assertFalse(self.real_claim('t', 'followup_day', '2026-10-29'))
            cursor.one.return_value = {'v': '2026-10-28'}
            self.assertTrue(self.real_claim('t', 'followup_day', '2026-10-29'))
            self.assertIn('FOR UPDATE', cursor.one.call_args.args[0])

if __name__ == '__main__':
    unittest.main()
