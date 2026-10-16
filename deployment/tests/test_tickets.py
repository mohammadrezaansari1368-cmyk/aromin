"""Server tickets (WP-4): parsing, dedupe, name-alias attribution and support axes. Synthetic data only."""
import json
import re
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aromin_tickets as tk
import aromin_performance as perf
from aromin_attendance import TooLarge

PEOPLE = [{'id': 1, 'name': 'کارشناس یک', 'role': 'support'}, {'id': 2, 'name': 'کارشناس دو', 'role': 'support'}]


def row(no, date='1405/06/19 10:20', agent='کارشناس یک', sla='عدم تاخیر', ola='عدم تاخیر', **extra):
    r = {'شماره تیکت': no, 'تاریخ ثبت': date, 'کارشناس': agent, 'تاخیر SLA': sla, 'تاخیر OLA': ola, 'سرشاخه': 'تلفنی',
         'موضوع اصلی': 'رفع مشکل', 'وضعیت': 'بسته', 'شرکت': 'مشتری الف', 'نحوه ثبت تیکت': 'تلفن', 'تاریخچه‌ها': 'x' * 900}
    r.update(extra)
    return r


ROWS = [row(101), row(102, sla='تاخیر ۲ ساعت'), row(103, agent='کارشناس دو', ola=None), row('۱۰۴', agent='ناشناس'),
        row(105, date='بد'), row(None)]


def body(sha='a', rows=None, tenant='t1'):
    return dict(tenant=tenant, fileName='JOOLIO-Ticket.xlsx', sha256=sha * 64, source='import-center', rows=ROWS if rows is None else rows)


class Pure(unittest.TestCase):
    def test_columns_values_and_projection(self):
        cols = tk.pick_columns(list(ROWS[0]))
        self.assertEqual((cols['no'], cols['date'], cols['agent'], cols['sla']), ('شماره تیکت', 'تاریخ ثبت', 'کارشناس', 'تاخیر SLA'))
        self.assertEqual(tk.pick_columns(['نحوه ثبت تیکت', 'کد تیکت'])['no'], 'کد تیکت')   # descriptive columns never become the number
        self.assertNotIn('no', tk.pick_columns(['نحوه ثبت تیکت']))
        # review PR11-R03: description/history columns never become the number, so the upload is rejected instead
        self.assertNotIn('no', tk.pick_columns(['شرح تیکت', 'توضیحات تیکت', 'یادداشت تیکت', 'متن تیکت']))
        self.assertEqual([tk.on_time(v) for v in ('عدم تاخیر', 'عدم‌تاخیر', 'تاخیر ۲ ساعت', '', None)], [1, 1, 0, None, None])
        self.assertEqual([tk.ticket_no(v) for v in ('۱۰۴', 101.0, '#12', 1.5, 'abc', True)], ['104', '101', '12', None, None, None])
        self.assertEqual((tk.reg_date('۱۴۰۵/۶/۹ ۱۰:۲۰'), tk.reg_date('1405/13/01')), ('1405/06/09', None))

    def test_parse_payload(self):
        p = tk.parse_payload(body())
        self.assertEqual([t['ticket_no'] for t in p['tickets']], ['101', '102', '103', '104'])
        self.assertEqual([s['reason'] for s in p['skipped']], ['تاریخ ثبت نامعتبر', 'شماره تیکت نامعتبر'])
        self.assertNotIn('تاریخچه‌ها', json.loads(p['tickets'][0]['raw_json']))   # long history columns are never stored
        self.assertEqual((p['tickets'][1]['sla_ok'], p['tickets'][2]['ola_ok']), (0, None))
        dup = tk.parse_payload(body(rows=[row(7), row(7), row(8), row(8, agent='کارشناس دو')]))
        self.assertEqual(([t['ticket_no'] for t in dup['tickets']], dup['in_file_conflicts']), (['7'], [{'key': '8', 'reason': 'in_file', 'rows': [3, 4]}]))
        for bad in (dict(body(), sha256='x'), dict(body(), rows=[]), dict(body(), rows=[{'کارشناس': 'a', 'تاریخ ثبت': '1405/01/01'}])):
            with self.assertRaises(ValueError):
                tk.parse_payload(bad)
        with self.assertRaises(TooLarge):
            tk.parse_payload(body(rows=[{str(i): i for i in range(301)}]))

    def test_plan_and_records(self):
        a, b = tk.parse_payload(body())['tickets'][:2]
        old = {'101': dict(a), '102': dict(b, status='باز', row_sha256='z')}
        pl = tk.plan(old, [a, b, dict(a, ticket_no='999')])
        self.assertEqual((pl['unchanged'], [u['key'] for u in pl['update']], pl['update'][0]['fields'], [t['ticket_no'] for t in pl['insert']]),
                         (1, ['102'], ['status'], ['999']))
        rows = tk.parse_payload(body())['tickets']
        aliases = [dict(kind='name', alias_key='کارشناس یک', person_id=1, status='confirmed'),
                   dict(kind='name', alias_key='کارشناس دو', person_id=2, status='suggested')]
        recs, issues = tk.records(rows, aliases)
        self.assertEqual([(r['id'], r['personId'], r['onTime']) for r in recs], [('ticket:101', '1', 1), ('ticket:102', '1', 0)])
        self.assertEqual({(i['key'], i['tickets']) for i in issues}, {('کارشناس دو', 1), ('ناشناس', 1)})   # suggested ≠ confirmed

    def test_support_axes_owner_decision(self):
        recs = [dict(personId='1', date='1405/06/19', metric='tickets', value=1, source='ticket_logs', onTime=v) for v in (1, 1, 0, None)]
        ax = {m['id']: m for m in perf.metrics('support', recs, [], '', '', None)}
        self.assertEqual((ax['activity']['value'], ax['activity']['detailsMetric'], ax['activity']['status']), (4, 'tickets', 'valid'))
        self.assertEqual((round(ax['efficiency']['value'], 4), ax['efficiency']['numerator'], ax['efficiency']['denominator'], ax['efficiency']['status']),
                         (66.6667, 2, 3, 'partial'))   # unknown SLA/OLA is excluded and marks the value partial
        none = {m['id']: m for m in perf.metrics('support', recs[3:], [], '', '', None)}
        self.assertEqual((none['activity']['value'], none['efficiency']['status']), (1, 'no_data'))
        self.assertEqual(perf.metrics('sales', recs, [], '', '', None)[0]['status'], 'no_data')   # decision is support-only


class Endpoints(unittest.TestCase):
    def setUp(self):
        import server
        from db_fake import Connection, load_schema
        self.server = server
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db = str(Path(tmp.name) / 't.sqlite')
        for mig in ('006_identity_attendance.sql', '007_calls.sql', '008_tickets.sql', '009_batch_rows.sql'):
            load_schema(Path(server.HERE) / 'migrations' / mig, self.db)
        self.full = {'people': [dict(p) for p in PEOPLE]}
        self.users = {'mgr': {'role': 'manager'}, 'one': {'personId': 1, 'role': 'support'}}
        self.ident = {'user': 'mgr', 'role': 'manager'}
        self.addCleanup(patch.stopall)
        patch.object(server, 'kb_identity', side_effect=lambda r, t: self.ident).start()
        patch.object(server, '_tenant_full', side_effect=lambda t='team': self.full).start()
        patch.object(server, '_kb_directory', side_effect=lambda t: (self.users, self.full['people'])).start()
        patch.object(server, 'db_conn', side_effect=lambda: Connection(self.db)).start()

    def res(self, r):
        return (r.status_code, json.loads(r.body)) if hasattr(r, 'status_code') else (200, r)

    def up(self, **kw):
        return self.res(self.server.tickets_upload(None, body(**kw)))

    def test_orphan_membership_from_rollback_never_resurrects(self):   # review R01-REV-02
        a = self.up()[1]['batch']['id']
        cx = sqlite3.connect(self.db)
        try:   # the pre-009 server (after rollback.sh) deletes batch A but leaves its membership rows
            cx.execute('DELETE FROM ticket_logs WHERE batch_id=?', (a,)); cx.execute('DELETE FROM ticket_batches WHERE id=?', (a,)); cx.commit()
        finally:
            cx.close()
        b = self.up(sha='c', rows=[row(101)])[1]['batch']
        self.assertEqual(b['inserted'], 1)
        out = self.res(self.server.tickets_delete(None, tenant='t1', batch=str(b['id'])))[1]
        self.assertEqual((out['removedRows'], out['restored']), (1, 0))
        cx = sqlite3.connect(self.db)
        try:
            self.assertEqual(cx.execute('SELECT COUNT(*) FROM ticket_logs').fetchone()[0], 0)
        finally:
            cx.close()

    def perf(self, view, **kw):
        args = dict(tenant='t1', person='', unit='', start='1405/06/01', end='1405/06/31', metric='tasks', offset=0, limit=100)
        args.update(kw)
        return self.res(self.server.performance_read(view, None, **args))

    def test_upload_dedupe_update_and_aliases(self):
        code, out = self.up()
        self.assertEqual((code, out['batch']['inserted'], out['batch']['periodFrom'], len(out['batch']['skipped'])), (201, 4, '1405/06/19', 2))
        self.assertEqual({u['rawName'] for u in out['unmapped']}, {'ناشناس'})
        cx = sqlite3.connect(self.db)
        try:
            al = dict(cx.execute("SELECT alias_key, status FROM identity_aliases WHERE tenant='t1' AND kind='name' AND source='tickets'").fetchall())
        finally:
            cx.close()
        self.assertEqual(al, {'کارشناس یک': 'confirmed', 'کارشناس دو': 'confirmed', 'ناشناس': 'review'})
        self.assertEqual(len(self.full['people']), 2)   # nobody is created
        self.assertTrue(self.up()[1]['duplicate'])
        code, out = self.up(sha='b', rows=[row(101), row(102, sla='عدم تاخیر', وضعیت='باز')])
        self.assertEqual((out['batch']['updated'], out['batch']['unchanged'], out['batch']['details']['updates']),
                         (1, 1, [{'key': '102', 'fields': ['وضعیت', 'SLA']}]))
        code, out = self.res(self.server.tickets_delete(None, tenant='t1', batch=str(out['batch']['id'])))
        # R01: ticket 102 is still in the first file, so it goes back to that version instead of disappearing
        self.assertEqual((out['removedRows'], out['removedBatches'], out['restored']), (0, 1, 1))
        cx = sqlite3.connect(self.db)
        try:
            self.assertEqual(cx.execute("SELECT status, sla_ok FROM ticket_logs WHERE ticket_no='102'").fetchone(), ('بسته', 0))
        finally:
            cx.close()
        self.assertEqual(self.res(self.server.tickets_delete(None, tenant='t1'))[0], 400)

    def test_roles_before_db(self):
        s = self.server
        for ident in (None, {'user': 'one', 'role': 'support'}, {'user': 'p', 'role': 'sales'}):
            self.ident = ident
            for call in (lambda: s.tickets_upload(None, body()), lambda: s.tickets_batches(None, tenant='t1'), lambda: s.tickets_delete(None, tenant='t1', all='1')):
                with self.subTest(ident=ident), patch.object(s, 'db_conn') as db:
                    self.assertEqual(call().status_code, 401 if ident is None else 403)
                    db.assert_not_called()

    def test_performance_support_axes(self):
        self.up()
        out = self.perf('summary')[1]
        ax = {p['id']: {m['id']: m for m in p['metrics']} for p in out['people']}
        self.assertEqual((ax['1']['activity']['value'], ax['1']['efficiency']['value']), (2, 50.0))
        self.assertEqual((ax['2']['activity']['value'], ax['2']['efficiency']['status']), (1, 'no_data'))   # OLA unknown
        self.assertTrue(any('ticket_logs' in n for n in out['notes']))
        daily = self.perf('daily', metric='tickets', person='1')[1]
        self.assertEqual((daily['days'], daily['unit']), ([{'date': '1405/06/19', 'value': 2, 'status': 'valid'}], 'تیکت'))
        self.assertEqual(self.perf('details', metric='tickets', person='1')[1]['total'], 2)
        self.ident = {'user': 'one', 'role': 'support'}
        self.assertEqual([p['id'] for p in self.perf('summary')[1]['people']], ['1'])
        self.assertEqual(self.perf('details', metric='tickets', person='2')[0], 403)
        with patch.object(self.server, 'db_conn', side_effect=OSError('down')):
            out = self.perf('summary')[1]
        self.assertTrue(any('تیکت در دسترس نبود' in n for n in out['notes']))
        self.assertEqual(out['people'][0]['metrics'][0]['status'], 'no_data')

    def test_routes_before_catch_all(self):
        paths = [getattr(r, 'path', '') for r in self.server.app.routes]
        self.assertLess(paths.index('/api/performance/tickets/batches'), paths.index('/api/performance/{view}'))


class Migration008(unittest.TestCase):
    def test_loads_twice_and_down_drops_only_its_tables(self):
        from db_fake import load_schema
        mig = Path(__file__).resolve().parents[1] / 'migrations'
        sql = (mig / '008_tickets.sql').read_text(encoding='utf-8')
        self.assertEqual(len(re.findall(r'CREATE TABLE IF NOT EXISTS', sql)), len(re.findall(r'CREATE TABLE', sql)))
        code = re.sub(r'--[^\n]*', '', sql).upper()
        for banned in ('ON DUPLICATE KEY', 'ENUM(', ' JSON', 'COLLATE'):
            self.assertNotIn(banned, code)
        with tempfile.TemporaryDirectory() as tmp:
            db = str(Path(tmp) / 'm.sqlite')
            load_schema(mig / '006_identity_attendance.sql', db)
            load_schema(mig / '008_tickets.sql', db)
            load_schema(mig / '008_tickets.sql', db)
            cx = sqlite3.connect(db)
            try:
                ins = "INSERT INTO ticket_logs (tenant,ticket_no,date_j,raw_json,row_sha256,batch_id,updated_at) VALUES (?,?,?,?,?,?,?)"
                r = ('t', '1', '1405/06/01', '{}', 'x', 1, 'n')
                cx.execute(ins, r)
                with self.assertRaises(sqlite3.IntegrityError):
                    cx.execute(ins, r)
                cx.executescript((mig / '008_tickets.down.sql.txt').read_text(encoding='utf-8'))
                names = {n for (n,) in cx.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                self.assertFalse({'ticket_batches', 'ticket_logs'} & names)
                self.assertIn('identity_aliases', names)
            finally:
                cx.close()


class DomainLock(unittest.TestCase):
    def test_every_import_writer_locks_its_domain_before_any_statement(self):   # R01-01
        import inspect
        import server
        writers = {'attendance': (server.attendance_upload, server.attendance_delete),
                   'calls': (server.calls_log_upload, server.calls_summary_upload, server.calls_delete),
                   'tickets': (server.tickets_upload, server.tickets_delete)}
        for lock, fns in writers.items():
            for fn in fns:
                body = inspect.getsource(fn).split('with _SaTx() as t:', 1)
                self.assertEqual(len(body), 2, fn.__name__)
                first = body[1].strip().splitlines()[0].strip()
                self.assertEqual(first, '_domain_lock(t, tenant, "%s")' % lock, fn.__name__)
                self.assertEqual(inspect.getsource(fn).count('with _SaTx() as t:'), 1, fn.__name__)


if __name__ == '__main__':
    unittest.main()
