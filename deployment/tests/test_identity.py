"""Identity map: normalization, matching levels and admin-only endpoints. Synthetic names only."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aromin_identity as idm
import server
from db_fake import Connection, load_schema

P = lambda *names: [{'id': str(i + 1), 'name': n, 'inactive': False} for i, n in enumerate(names)]


class Normalization(unittest.TestCase):
    def test_names(self):
        self.assertEqual(idm.normalize_name('آقای  محمد رضايي'), 'اقای محمد رضایی')
        self.assertEqual(idm.normalize_name('كاوه خرم‌آبادی'), idm.normalize_name('کاوه خرم آبادي'))
        self.assertEqual(idm.normalize_name('مُحَمَّد ـ ۱۲'), 'محمد 12')

    def test_keys(self):
        for raw in ('۰۹', 9.0, '9 ', '09', 9, '9.0', '٩'):
            self.assertEqual(idm.normalize_key('card', raw), '9', raw)
        for raw in (None, '', 'x9', 9.5, True, '-1'):
            self.assertIsNone(idm.normalize_key('card', raw), raw)
        self.assertEqual(idm.normalize_key('ext', '0'), '0')
        self.assertEqual(idm.normalize_key('name', ' خانم  سارا كريمي '), 'خانم سارا کریمی')
        self.assertIsNone(idm.normalize_key('phone', '9'))

    def test_split_and_titles(self):
        self.assertEqual(idm.strip_titles('آقای مهندس محمد رضایی'), 'محمد رضایی')
        self.assertEqual(idm.split_name('خانم سارا کریمی'), ('سارا', ['کریمی']))
        self.assertEqual(idm.split_name('احمدی'), ('', ['احمدی']))
        self.assertEqual(idm.split_name('محمد رضایی گنجگاه'), ('محمد', ['رضایی', 'گنجگاه']))


class Matching(unittest.TestCase):
    def test_levels_and_auto_status(self):
        cases = [
            ('julio', 'آقای محمد رضايي', P('محمد رضایی'), 'exact', ('confirmed', '1')),
            ('card', 'آقای محمد رضايي', P('محمد رضایی'), 'exact', ('suggested', '1')),
            ('card', 'محمد رضايي گنجگاه', P('محمد رضایی'), 'strong', ('suggested', '1')),
            ('card', 'زهرا كريمي', P('خانم سارا کریمی'), 'weak', ('review', None)),
            ('card', 'مريم نيك‌نام', P('خانم نگار نیک نام'), 'weak', ('review', None)),
            ('name', 'احمدی', P('لیلا احمدی', 'علی احمدی'), 'ambiguous', ('review', None)),
            ('name', 'کاوه خرم‌آبادی', P('کاوه خرم آبادي'), 'exact', ('confirmed', '1')),
            ('julio', 'سارا کریمی', P('محمد رضایی'), 'none', ('review', None)),
        ]
        for kind, raw, people, conf, status in cases:
            with self.subTest(raw=raw, kind=kind):
                m = idm.match(raw, people)
                self.assertEqual(m['confidence'], conf)
                self.assertEqual(idm.auto_status(kind, m), status)
        m = idm.match('زهرا كريمي', P('خانم سارا کریمی'))
        self.assertIn('first_name_conflict', m['candidates'][0]['reasons'])
        self.assertIn('two_part_surname', idm.match('محمد رضايي گنجگاه', P('محمد رضایی'))['candidates'][0]['reasons'])
        self.assertEqual(len(idm.match('احمدی', P('لیلا احمدی', 'علی احمدی'))['candidates']), 2)

    def test_short_prefix_and_duplicates(self):
        self.assertEqual(idm.match('علی نو بخت', P('علی نو'))['confidence'], 'none')   # prefix tokens need ≥3 letters
        with self.assertRaises(ValueError):
            idm.match('x', [{'id': '1', 'name': 'a'}, {'id': '1', 'name': 'b'}])
        with self.assertRaises(ValueError):
            idm.people_of({'people': [{'id': 1, 'name': 'a'}, {'id': '1', 'name': 'b'}]})

    def test_merge_alias_respects_humans_and_demotes_stale_auto(self):
        exact = idm.match('محمد رضایی', P('محمد رضایی'))
        for status in ('confirmed', 'rejected'):
            human = {'status': status, 'decided_by': 'admin', 'person_id': '9'}
            self.assertIsNone(idm.merge_alias(human, 'julio', '5', 'محمد رضایی', 'tasks', exact))
        auto = idm.merge_alias(None, 'julio', '5', 'محمد رضایی', 'tasks', exact, now='t0')
        self.assertEqual((auto['status'], auto['decided_by'], auto['person_id'], auto['decided_at']), ('confirmed', 'auto', '1', 't0'))
        self.assertIsNone(idm.merge_alias(auto, 'julio', '5', 'محمد رضایی', 'tasks', exact, now='t1'))
        twice = idm.match('محمد رضایی', P('محمد رضایی', 'محمد رضایی'))
        demoted = idm.merge_alias(auto, 'julio', '5', 'محمد رضایی', 'tasks', twice)
        self.assertEqual((demoted['status'], demoted['person_id'], demoted['decided_by']), ('review', None, None))

    def test_manual_link_hint_is_only_suggested(self):
        row = idm.merge_alias(None, 'card', '9', 'زهرا کریمی', 'migration', idm.match('زهرا کریمی', P('خانم سارا کریمی')), hint='1')
        self.assertEqual((row['status'], row['person_id']), ('suggested', '1'))
        self.assertIn('local_manual_link', json.loads(row['candidates'])[0]['reasons'])


class Endpoints(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db = str(Path(tmp.name) / 't.sqlite')
        load_schema(Path(server.HERE) / 'migrations/006_identity_attendance.sql', self.db)
        self.full = {'people': [{'id': 1, 'name': 'محمد رضایی', 'role': 'sales'}, {'id': 2, 'name': 'خانم سارا کریمی', 'role': 'sales'}]}
        self.ident = {'user': 'mgr', 'role': 'manager'}
        self.addCleanup(patch.stopall)
        patch.object(server, 'kb_identity', side_effect=lambda r, t: self.ident).start()
        patch.object(server, '_tenant_full', side_effect=lambda t='team': self.full).start()
        patch.object(server, 'db_conn', side_effect=lambda: Connection(self.db)).start()

    def res(self, r):
        return (r.status_code, json.loads(r.body)) if hasattr(r, 'status_code') else (200, r)

    def scan(self, tenant='t1', **item):
        return self.res(server.identity_scan(None, {'tenant': tenant, 'items': [dict(dict(kind='julio', key='25', raw='آقای محمد رضايي', source='tasks'), **item)]}))

    def test_auth_and_roles_never_touch_db(self):
        calls = [lambda: server.identity_list(None, tenant='t1'), lambda: server.identity_scan(None, {'tenant': 't1', 'items': []}),
                 lambda: server.identity_decide(None, {'tenant': 't1', 'id': 1, 'action': 'reset'})]
        for ident, code in ((None, 401), ({'user': 's', 'role': 'sales'}, 403), ({'user': 'p', 'role': 'support'}, 403)):
            self.ident = ident
            for call in calls:
                with self.subTest(ident=ident), patch.object(server, 'db_conn') as db:
                    self.assertEqual(call().status_code, code)
                    db.assert_not_called()

    def test_scan_list_decide(self):
        self.assertEqual(self.scan(), (200, {'ok': True, 'created': 1, 'updated': 0, 'unchanged': 0}))
        self.assertEqual(self.scan()[1]['unchanged'], 1)
        self.scan(kind='card', key='09', raw='زهرا كريمي', source='attendance')
        _, out = self.res(server.identity_list(None, tenant='t1'))
        self.assertEqual(out['counts'], {'confirmed': 1, 'suggested': 0, 'review': 1, 'rejected': 0})
        card = next(a for a in out['aliases'] if a['kind'] == 'card')
        self.assertEqual((card['key'], card['personId'], card['candidates'][0]['personId']), ('9', None, '2'))
        code, body = self.res(server.identity_decide(None, {'tenant': 't1', 'id': card['id'], 'action': 'confirm', 'personId': '77'}))
        self.assertEqual(code, 400)
        code, body = self.res(server.identity_decide(None, {'tenant': 't1', 'id': card['id'], 'action': 'confirm', 'personId': '2', 'updatedAt': 'stale'}))
        self.assertEqual(code, 409)
        code, body = self.res(server.identity_decide(None, {'tenant': 't1', 'id': card['id'], 'action': 'confirm', 'personId': '2', 'updatedAt': card['updatedAt']}))
        self.assertEqual((code, body['alias']['status'], body['alias']['personId'], body['alias']['decidedBy']), (200, 'confirmed', '2', 'mgr'))
        self.scan(kind='card', key='9', raw='کسی دیگر', source='attendance')   # human decision is never overwritten
        self.assertEqual(self.res(server.identity_list(None, tenant='t1', status='confirmed'))[1]['counts']['confirmed'], 2)
        body = self.res(server.identity_decide(None, {'tenant': 't1', 'id': card['id'], 'action': 'reset'}))[1]
        self.assertEqual((body['alias']['status'], body['alias']['personId']), ('review', None))

    def test_other_tenant_alias_is_404_and_bad_items_400(self):
        self.scan(tenant='t2')
        aid = self.res(server.identity_list(None, tenant='t2'))[1]['aliases'][0]['id']
        self.assertEqual(self.res(server.identity_list(None, tenant='t1'))[1]['aliases'], [])
        self.assertEqual(server.identity_decide(None, {'tenant': 't1', 'id': aid, 'action': 'reject'}).status_code, 404)
        self.assertEqual(self.scan(source='hack')[0], 400)
        self.assertEqual(self.scan(personId='99')[0], 400)
        self.assertEqual(self.scan(kind='card', key='x1')[0], 400)


if __name__ == '__main__':
    unittest.main()
