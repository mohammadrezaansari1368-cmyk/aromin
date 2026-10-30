"""WO3 proofs using synthetic attendance only; no network or database."""
import json
import unittest
from unittest.mock import MagicMock, patch

import aromin_attendance as att
import aromin_performance as perf
import server


class WorkOrderThree(unittest.TestCase):
    def setUp(self):
        self.person = dict(id='1', name='Synthetic', role='sales')
        self.full = dict(fy='1405', people=[self.person], targets={'1': [2600] * 12})
        self.start, self.end = '1405/07/01', '1405/07/30'
        self.working = perf.calendar_days(self.start, self.end)
        self.assertEqual(len(self.working), 26)
        self.history = [dict(personId='1', metric='contracts', date='1405/06/01', value=100)]

    def row(self, date, status=None, pid='1', minutes=450):
        r = dict(personId=pid, date=date, presentMin=minutes)
        if status is not None:
            r['dayStatus'] = status
        return r

    def target(self, rows, mapped=('1',), coverage=None):
        attendance = dict(rows=rows, mappedPersons=set(mapped), available=True,
                          coverage=set(coverage if coverage is not None else perf.month_dates(1405, 7)))
        return perf.sales_targets(self.full, self.person, self.start, self.end, attendance, (), self.history)

    def test_twenty_of_twenty_six(self):
        rows = [self.row(d, 'present' if i < 20 else 'leave') for i, d in enumerate(self.working)]
        t = self.target(rows)
        self.assertEqual(t['activity'], 800)
        self.assertEqual(t['amount'], 2600 * 20 / 26)
        self.assertEqual(t['count'], 20)
        self.assertEqual(t['attendance']['presentDays'], 20)
        self.assertEqual(t['attendance']['leaveDays'], 6)
        self.assertEqual(t['attendance']['calendarDays'], 26)
        self.assertFalse(t['issue'])

    def test_status_overrides_minutes_and_mission_needs_no_minutes(self):
        for status in ('leave', 'sick', 'absent', 'holiday', 'closure'):
            with self.subTest(status=status):
                t = self.target([self.row(self.working[0], status)])
                self.assertEqual((t['activity'], t['amount'], t['count']), (0, 0, 0))
                self.assertFalse(t['issue'])
        for status in ('present', 'mission'):
            t = self.target([self.row(self.working[0], status, minutes=None)])
            self.assertEqual(t['activity'], 40)
            self.assertFalse(t['issue'])

    def test_legacy_minutes_and_calendar_exclusions(self):
        rows = [self.row(d) for d in perf.month_dates(1405, 7)]
        t = self.target(rows)
        self.assertEqual((t['activity'], t['amount']), (1040, 2600))
        self.assertEqual(self.target([self.row(self.working[0], minutes=0)])['activity'], 0)
        self.start = self.end = '1405/01/01'  # automatic official holiday
        self.assertEqual(self.target([self.row(self.start, 'mission')], coverage=[self.start])['activity'], 0)

    def test_company_closure_and_another_person_present(self):
        d = self.working[0]
        for rows in ([], [self.row(d, 'closure'), self.row(d, 'holiday', pid='2')]):
            t = self.target(rows, mapped=('1', '2'), coverage=[d])
            self.assertEqual(t['workingDays'], 25)
            self.assertEqual(t['attendance']['closureDays'], 1)
        t = self.target([self.row(d, 'leave'), self.row(d, 'mission', pid='2')], mapped=('1', '2'), coverage=[d])
        self.assertEqual(t['attendance']['closureDays'], 0)
        self.assertEqual(t['workingDays'], 25)

    def test_month_denominators_and_calendar_fallback(self):
        t = self.target([], coverage=[])
        self.assertEqual((t['activity'], t['amount'], t['basis']), (1040, 2600, 'calendar'))
        self.end = '1405/08/30'
        t = self.target([self.row(self.working[0], 'mission')], coverage=self.working)
        self.assertAlmostEqual(t['amount'], 2600 / 26 + 2600)

    def test_invalid_zurvan_status(self):
        for status in ('unknown', [], {}):
            with self.subTest(status=status), self.assertRaises(ValueError):
                server._zurvan_rows({'rows': [dict(card_no='10', date_j=self.start, status=status)]})

    def test_status_survives_double_ingest_and_read(self):
        alias = dict(kind='card', alias_key='10', person_id='1', status='confirmed')
        stored, batches = {}, []
        tx = MagicMock()
        tx.cur.lastrowid = 1

        def query(sql, args):
            if sql.startswith('INSERT INTO attendance_batches'):
                batches.append(dict(id=1, file_sha256=args[1], period_from=args[5], period_to=args[6]))
            elif sql.startswith('INSERT INTO attendance_days'):
                stored[(args[1], args[2])] = dict(card_no=args[1], date_j=args[2], present_min=args[6],
                                                  note=args[7], raw_json=args[8], row_sha256=args[9])
            result = MagicMock()
            result.fetchall.return_value = ([alias] if 'FROM identity_aliases' in sql else
                                            list(stored.values()) if 'FROM attendance_days' in sql else
                                            batches if 'FROM attendance_batches' in sql else [])
            return result

        tx.x.side_effect = query
        tx.one.side_effect = lambda sql, args: alias if 'identity_aliases' in sql else batches[0] if batches else None
        sheets = server._zurvan_rows({'rows': [dict(card_no='10', date_j=self.start, status='mission')]})
        parsed = att.parse_payload(dict(fileName='synthetic.json', sha256='c' * 64, source='zurvan', sheets=sheets))
        self.assertEqual(parsed['sheets'][0]['days'][0]['day_status'], 'mission')
        with patch.object(server, '_SaTx') as factory, patch.object(server, '_domain_lock'), \
             patch.object(server, '_member_write'), patch.object(server, '_alias_write'), \
             patch.object(server, '_att_batch', side_effect=lambda b: b), \
             patch.object(server.urllib.request, 'urlopen') as network:
            factory.return_value.__enter__.return_value = tx
            first = server._att_ingest('synthetic', 'test', parsed, [self.person])
            self.assertFalse(json.loads(first.body)['duplicate'])
            before = server._perf_target_attendance('synthetic', self.start, self.end)
            self.assertTrue(server._att_ingest('synthetic', 'test', parsed, [self.person])['duplicate'])
            after = server._perf_target_attendance('synthetic', self.start, self.end)
            network.assert_not_called()
        self.assertEqual(before, after)
        self.assertEqual(before[0]['rows'][0]['dayStatus'], 'mission')
        self.assertEqual((len(stored), len(batches)), (1, 1))


if __name__ == '__main__':
    unittest.main()
