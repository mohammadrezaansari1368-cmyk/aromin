"""Server attendance: pure parsing/validation and endpoint scope with the SQLite fake. Synthetic fixture only."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aromin_attendance as att
import server
from db_fake import Connection, load_schema

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/attendance_synthetic.json').read_text(encoding='utf-8'))
SHEET_A, SHEET_B, SHEET_C = 'کارت یک', 'کارت نه', 'بی‌کارت'


class Pure(unittest.TestCase):
    def test_parse_sheet(self):
        a, why = att.parse_sheet(SHEET_A, FIXTURE['sheets'][SHEET_A])
        self.assertIsNone(why)
        self.assertEqual((a['card_no'], a['person_name'], a['ignored_rows'], len(a['days'])), ('1', 'محمد رضایی گنجگاه', 1, 5))
        self.assertEqual(a['days'][0]['date_j'], '1405/06/01')
        self.assertEqual((a['days'][0]['punches'], a['days'][0]['present_min']), ([600, 1080], 475))
        b, _ = att.parse_sheet(SHEET_B, FIXTURE['sheets'][SHEET_B])
        self.assertEqual((b['card_no'], len(b['days'][0]['punches']), b['days'][0]['present_min']), ('9', 6, 125 + 150 + 175))
        self.assertEqual(att.parse_sheet(SHEET_C, FIXTURE['sheets'][SHEET_C]), (None, 'بدون شماره کارت'))
        self.assertEqual(att.parse_sheet('راهنما', [{'متن': 'x'}]), (None, 'بدون ستون تاریخ'))
        mixed = copy.deepcopy(FIXTURE['sheets'][SHEET_A]); mixed[1]['شماره کارت'] = 2
        self.assertEqual(att.parse_sheet('x', mixed)[1], 'چند شماره کارت در یک شیت')
        dup = copy.deepcopy(FIXTURE['sheets'][SHEET_A]); dup[1]['تاريخ'] = '1405/06/01'
        self.assertEqual(att.parse_sheet('x', dup)[1], 'تاریخ تکراری با محتوای متفاوت')

    def test_dates_and_minutes(self):
        self.assertEqual(att.norm_date('۱۴۰۵/۶/۳'), '1405/06/03')
        for bad in ('1405/07/31', '1405/13/01', '1405-06-01', None, 'موظفی'):
            self.assertIsNone(att.norm_date(bad))
        vectors = [('10:05', 605), ('۰۸:۳۰', 510), ('7:05 PM', 1145), ('12:10 AM', 10), ('00:00', None), (0.5, 720), (1, None),
                   ('24:00', None), ('x', None), (None, None), ('', None), (True, None), ('08:00:59', 480)]
        for v, want in vectors:
            self.assertEqual(att.to_minutes(v), want, v)

    def test_plan_upsert_and_period(self):
        days = [dict(card_no='1', date_j='1405/06/0%d' % i, row_sha256=str(i)) for i in (1, 2, 3)]
        plan = att.plan_upsert({('1', '1405/06/01'): '1', ('1', '1405/06/02'): 'old'}, days)
        self.assertEqual((len(plan['insert']), len(plan['update']), plan['unchanged']), (1, 1, 1))
        self.assertEqual(att.period(days), ('1405/06/01', '1405/06/03'))

    def test_payload_limits(self):
        good = dict(fileName='f.xlsx', sha256='a' * 64, source='import-center', sheets=FIXTURE['sheets'])
        out = att.parse_payload(good)
        self.assertEqual(([s['card_no'] for s in out['sheets']], out['skipped']), (['1', '9'], [{'sheet': SHEET_C, 'reason': 'بدون شماره کارت'}]))
        for bad in (dict(good, sha256='A' * 64), dict(good, source='x'), dict(good, sheets={}),
                    dict(good, sheets={'s': [{'تاريخ': '1405/06/01', 'v': {'nested': 1}}]}), dict(good, sheets={'s': [{'v': 'x' * 301}]})):
            with self.assertRaises(ValueError):
                att.parse_payload(bad)
        with self.assertRaises(att.TooLarge):
            att.parse_payload(dict(good, sheets={'s': [{}] * 401}))

    def test_override_and_settings(self):
        self.assertIsNone(att.validate_override(None))
        self.assertIsNone(att.validate_override({'note': ''}))
        self.assertEqual(att.validate_override({'code': 'leave', 'entry': '09:30', 'excuse': True}), {'code': 'leave', 'entry': '09:30', 'excuse': True})
        for bad in ({'code': 'vacation'}, {'entry': '9.30'}, {'exit': '25:00'}, {'note': 'x' * 301}, {'person': 'x'}, {'excuse': 'yes'}):
            with self.assertRaises(ValueError):
                att.validate_override(bad)
        s = att.validate_settings({})
        self.assertEqual((s['workStart'], s['workEnd'], s['overtimeByLateExit']), ('10:00', '18:00', False))
        self.assertEqual(att.validate_settings({'restDuration': '30', 'overtimeByLateExit': True, 'extra': 1})['restDuration'], 30)
        for bad in ({'workStart': '18:00'}, {'workEnd': '09:00'}, {'overtimeByLateExit': 'on'}, {'lateThreshold': -1}, {'dailyWork': '7'}):
            with self.assertRaises(ValueError):
                att.validate_settings(bad)


class Endpoints(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db = str(Path(tmp.name) / 't.sqlite')
        load_schema(Path(server.HERE) / 'migrations/006_identity_attendance.sql', self.db)
        self.full = {'people': FIXTURE['people']}
        self.users = {'mgr': {'role': 'manager'}, 'sara': {'personId': 2, 'role': 'sales'}, 'mohammad': {'person': 'محمد رضایی', 'role': 'sales'}}
        self.ident = {'user': 'mgr', 'role': 'manager'}
        self.addCleanup(patch.stopall)
        patch.object(server, 'kb_identity', side_effect=lambda r, t: self.ident).start()
        patch.object(server, '_tenant_full', side_effect=lambda t='team': self.full).start()
        patch.object(server, '_kb_directory', side_effect=lambda t: (self.users, self.full['people'])).start()
        patch.object(server, 'db_conn', side_effect=lambda: Connection(self.db)).start()

    def as_(self, user, role):
        self.ident = {'user': user, 'role': role}

    def res(self, r):
        return (r.status_code, json.loads(r.body)) if hasattr(r, 'status_code') else (200, r)

    def upload(self, sha='a', tenant='t1', sheets=None):
        return self.res(server.attendance_upload(None, {'tenant': tenant, 'fileName': 'synthetic.xlsx', 'sha256': sha * 64,
                                                        'source': 'import-center', 'sheets': sheets or FIXTURE['sheets']}))

    def get(self, tenant='t1', **kw):
        return self.res(server.attendance_read(None, tenant=tenant, **kw))

    def count(self, table):
        cx = Connection(self.db)
        try:
            return cx.connection.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
        finally:
            cx.close()

    def test_upload_duplicate_update_and_overrides_preserved(self):
        code, out = self.upload()
        self.assertEqual(code, 201)
        self.assertEqual((out['batch']['days'], out['batch']['inserted'], out['batch']['sheets']), (10, 10, 2))
        self.assertEqual(out['skipped'], [{'sheet': SHEET_C, 'reason': 'بدون شماره کارت'}])
        self.assertEqual({u['cardNo']: u['status'] for u in out['unmapped']}, {'1': 'suggested', '9': 'review'})
        self.assertEqual(self.res(server.identity_list(None, tenant='t1'))[1]['counts']['confirmed'], 0)
        code, dup = self.upload()
        self.assertEqual((code, dup['duplicate'], dup['batch']['id']), (200, True, out['batch']['id']))
        self.assertEqual((self.count('attendance_days'), self.count('attendance_batches')), (10, 1))
        self.res(server.attendance_override(None, {'tenant': 't1', 'cardNo': 9, 'date': '1405/06/02', 'fields': {'code': 'leave', 'note': 'دستی'}}))
        changed = copy.deepcopy(FIXTURE['sheets']); changed[SHEET_B][1]['خروج 3'] = '19:30'
        code, out2 = self.upload('b', sheets=changed)
        self.assertEqual((code, out2['batch']['inserted'], out2['batch']['updated'], out2['batch']['unchanged']), (201, 0, 1, 9))
        card9 = next(c for c in self.get()[1]['cards'] if c['cardNo'] == '9')
        self.assertEqual(card9['overrides'], {'1405/06/02': {'code': 'leave', 'note': 'دستی'}})
        self.assertEqual(card9['rows'][1]['خروج 3'], '19:30')
        self.assertEqual((code, self.upload('c', sheets={SHEET_C: FIXTURE['sheets'][SHEET_C]})[0]), (201, 400))

    def test_non_admin_writes_are_403_without_db(self):
        for ident in (None, {'user': 'sara', 'role': 'sales'}, {'user': 'p', 'role': 'support'}):
            self.ident = ident
            calls = [lambda: server.attendance_upload(None, {'tenant': 't1'}), lambda: server.attendance_delete(None, tenant='t1', all='1'),
                     lambda: server.attendance_override(None, {'tenant': 't1'}), lambda: server.attendance_override_batch(None, {'tenant': 't1'}),
                     lambda: server.attendance_settings(None, {'tenant': 't1'})]
            for call in calls:
                with self.subTest(ident=ident), patch.object(server, 'db_conn') as db:
                    self.assertEqual(call().status_code, 401 if ident is None else 403)
                    db.assert_not_called()
        self.ident = None
        with patch.object(server, 'db_conn') as db:
            self.assertEqual(server.attendance_read(None, tenant='t1').status_code, 401)
            db.assert_not_called()

    def test_employee_scope_follows_confirmed_card(self):
        self.upload()
        self.as_('sara', 'sales')
        code, out = self.get()
        self.assertEqual((code, out['cards'], out['scope']), (200, [], 'self'))
        self.assertNotIn('batches', out)
        self.as_('mgr', 'manager')
        alias = next(a for a in self.res(server.identity_list(None, tenant='t1'))[1]['aliases'] if a['key'] == '9')
        self.res(server.identity_decide(None, {'tenant': 't1', 'id': alias['id'], 'action': 'confirm', 'personId': '2'}))
        self.as_('sara', 'sales')
        code, out = self.get()
        self.assertEqual([(c['cardNo'], c['mapping'], c['personId']) for c in out['cards']], [('9', 'confirmed', '2')])
        self.assertEqual(len(out['cards'][0]['rows']), 5)
        self.assertNotIn('batches', out)
        self.assertNotIn('محمد', json.dumps(out, ensure_ascii=False))
        self.assertEqual(self.get(person='1')[0], 403)
        self.assertEqual(len(self.get(person='2', start='1405/06/02', end='1405/06/03')[1]['cards'][0]['rows']), 2)
        self.assertEqual(self.get(start='1405/06/05', end='1405/06/01')[0], 400)
        self.as_('mohammad', 'sales')
        self.assertEqual(self.get()[1]['cards'], [])   # card 1 is only suggested
        self.as_('ghost', 'sales')
        self.assertEqual(self.get()[0], 403)

    def test_admin_view_and_tenant_isolation(self):
        self.upload()
        code, out = self.get()
        self.assertEqual((out['scope'], len(out['cards']), len(out['batches'])), ('organization', 2, 1))
        self.assertEqual({c['cardNo']: c['mapping'] for c in out['cards']}, {'1': 'suggested', '9': 'review'})
        self.assertEqual(out['period'], {'from': '1405/06/01', 'to': '1405/06/05'})
        self.assertEqual((out['settings']['workEnd'], out['settingsStored']), ('18:00', False))
        code, out = self.get(tenant='t2')
        self.assertEqual((out['cards'], out['batches']), ([], []))
        self.assertEqual(server.attendance_delete(None, tenant='t2', batch='1').status_code, 404)

    def test_delete_batch_keeps_newer_rows_and_overrides(self):
        first = self.upload()[1]['batch']['id']
        changed = copy.deepcopy(FIXTURE['sheets']); changed[SHEET_A][0]['حضور'] = '08:00'
        self.upload('b', sheets=changed)
        self.res(server.attendance_override(None, {'tenant': 't1', 'cardNo': '1', 'date': '1405/06/03', 'fields': {'code': 'sick'}}))
        self.assertEqual(server.attendance_delete(None, tenant='t1').status_code, 400)
        self.assertEqual(self.res(server.attendance_delete(None, tenant='t1', batch=str(first)))[1],
                         {'ok': True, 'removedDays': 9, 'removedBatches': 1, 'removedOverrides': 0})
        self.assertEqual((self.count('attendance_days'), self.count('attendance_overrides')), (1, 1))
        self.assertEqual(self.upload()[0], 201)   # deleted file can be uploaded again
        self.assertEqual(self.res(server.attendance_delete(None, tenant='t1', all='1', overrides='1'))[1]['removedOverrides'], 1)
        self.assertEqual(self.count('identity_aliases'), 2)

    def test_overrides_if_absent_batch_and_settings(self):
        put = lambda **kw: self.res(server.attendance_override(None, dict({'tenant': 't1', 'cardNo': '9', 'date': '1405/06/01'}, **kw)))
        self.assertEqual(put(fields={'code': 'leave'}), (200, {'ok': True, 'override': {'code': 'leave'}}))
        self.assertEqual(put(fields={'code': 'sick'}, ifAbsent=True), (200, {'ok': True, 'skipped': True}))
        self.assertEqual(put(fields={'bogus': 1})[0], 400)
        out = self.res(server.attendance_override_batch(None, {'tenant': 't1', 'ifAbsent': True, 'items': [
            {'cardNo': '9', 'date': '1405/06/01', 'fields': {'code': 'absent'}}, {'cardNo': '9', 'date': '1405/6/2', 'fields': {'code': 'mission'}}]}))
        self.assertEqual(out[1], {'ok': True, 'written': 1, 'skipped': 1})
        self.assertEqual(put(fields=None)[1], {'ok': True, 'override': None})
        self.assertEqual(self.count('attendance_overrides'), 1)
        self.assertEqual(self.res(server.attendance_settings(None, {'tenant': 't1', 'settings': {'workStart': '19:00'}}))[0], 400)
        self.assertEqual(self.res(server.attendance_settings(None, {'tenant': 't1', 'settings': {'overtimeByLateExit': True}}))[1]['settings']['overtimeByLateExit'], True)
        self.as_('sara', 'sales')
        out = self.get()[1]
        self.assertEqual((out['settings']['overtimeByLateExit'], out['settingsStored']), (True, True))


class RouteOrder(unittest.TestCase):
    def test_attendance_is_registered_before_catch_all(self):
        paths = [(getattr(r, 'path', ''), getattr(r, 'methods', set())) for r in server.app.routes]
        idx = lambda path: next(i for i, (p, m) in enumerate(paths) if p == path and 'GET' in m)
        self.assertLess(idx('/api/performance/attendance'), idx('/api/performance/{view}'))

    def test_http_get_reaches_attendance_handler(self):
        from fastapi.testclient import TestClient
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        db = str(Path(tmp.name) / 't.sqlite')
        load_schema(Path(server.HERE) / 'migrations/006_identity_attendance.sql', db)
        with patch.object(server, 'kb_identity', return_value={'user': 'mgr', 'role': 'manager'}), \
                patch.object(server, '_tenant_full', return_value={'people': FIXTURE['people']}), \
                patch.object(server, 'db_conn', side_effect=lambda: Connection(db)):
            r = TestClient(server.app).get('/api/performance/attendance?tenant=t1')
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()['cards'], r.json()['scope']), ([], 'organization'))


if __name__ == '__main__':
    unittest.main()
