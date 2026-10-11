"""Server calls (WP-C): pure parsing, dedupe, identity resolution and daily stats. Synthetic fixture only."""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aromin_calls as calls
from aromin_attendance import TooLarge, norm_header

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/calls_synthetic.json').read_text(encoding='utf-8'))
LOG = dict(fileName='calllog.xlsx', sha256='a' * 64, source='import-center', rows=FIXTURE['log'])
SUMMARY = dict(fileName='calls.xlsx', sha256='b' * 64, source='import-center', direction='in', period={'month': '1405/06'}, rows=FIXTURE['summary'])
CMAP = {norm_header(c): c for c in FIXTURE['log'][0]}
ALIASES = [dict(kind='julio', alias_key='25', person_id=1, status='confirmed'),
           dict(kind='ext', alias_key='103', person_id=2, status='confirmed'),
           dict(kind='ext', alias_key='999', person_id=2, status='confirmed'),   # owner of the shared extension: still never credited
           dict(kind='julio', alias_key='5', person_id=None, status='review'),
           dict(kind='julio', alias_key='7', person_id=1, status='suggested')]


def row(**changes):
    r = copy.deepcopy(FIXTURE['log'][1])
    r.update(changes)
    return r


def call(**kw):
    c = dict(date_j='1405/06/19', time_s=36000, direction='out', o_ext='102', o_julio='25', o_name=None, d_ext=None, d_julio=None, d_name=None,
             total_sec=10, talk_sec=8, call_status='answered')
    c.update(kw)
    return c


class Parse(unittest.TestCase):
    def test_digits_and_classify_party(self):
        self.assertEqual([calls.digits(v) for v in ('09110000001', '۲۰۲', 200, 200.0, 2.5, '12a', '', None, True)],
                         ['09110000001', '202', '200', '200', None, None, None, None, None])
        p = calls.classify_party(3257, '09110000001', 'مشتری الف')
        self.assertEqual((p['type'], p['phone'], p['contact'], p['julio'], p['ext'], p['name']), ('external', '09110000001', '3257', None, None, 'مشتری الف'))
        self.assertEqual(calls.classify_party(None, 9110000001, 9110000001)['phone'], '09110000001')
        self.assertIsNone(calls.classify_party(None, '01300000001', '01300000001')['name'])
        self.assertEqual(calls.classify_party(25, 200, 'کارشناس يك'), dict(type='ext', ext='200', julio='25', phone=None, contact=None, name='کارشناس یک'))
        self.assertEqual(calls.classify_party(None, '۲۰۲', None)['ext'], '202')
        self.assertIsNone(calls.classify_party(None, 999, None)['julio'])        # queue: extension without a Julio user
        self.assertEqual(calls.classify_party(None, '0200', None)['type'], 'external')
        for bad in (None, '', 'صف', 5, 0):
            self.assertEqual(calls.classify_party(7, bad, 'x')['type'], 'unknown', bad)
        overlap = calls.classify_party(8, '09000000003', 'مشتری ج')     # contact 8 next to a mobile is a contact, not Julio user 8
        self.assertEqual((overlap['contact'], overlap['julio']), ('8', None))

    def test_direction_of(self):
        ext, ext_q = calls.classify_party(25, 102, None), calls.classify_party(None, 999, None)
        ext_out, unk = calls.classify_party(1, '09000000001', None), calls.classify_party(None, None, None)
        self.assertEqual(calls.direction_of(ext, ext_q), 'internal')
        self.assertEqual(calls.direction_of(ext, ext_out), 'out')
        self.assertEqual(calls.direction_of(ext, unk), 'out')
        self.assertEqual(calls.direction_of(ext_out, ext_q), 'in')
        self.assertEqual(calls.direction_of(unk, ext), 'in')
        self.assertEqual(calls.direction_of(ext_out, ext_out), 'unknown')
        self.assertEqual(calls.direction_of(unk, unk), 'unknown')

    def test_clock_duration_sync_status(self):
        for v, want in (('18:13\':14"', 65594), ('۰۹:۰۵\':۰۰"', 32700), ('18:13', 65580), ('18:13:14', 65594), (0.5, 43200),
                        ('x', None), ('24:00', None), (1.5, None), (None, None), ('1405/06/20', None)):
            self.assertEqual(calls.parse_clock(v), want, v)
        for sec, hms, want in ((504, '00:00:01', 504), (None, '00:08:24', 504), ('', '00:08:24', 504), ('۱۲', None, 12), (12.0, None, 12),
                               (-1, None, None), (90000, None, None), (1.5, None, None), (None, '25:00:01', None), (None, 'x', None), (None, None, None)):
            self.assertEqual(calls.parse_duration(sec, hms), want, (sec, hms))
        self.assertEqual(calls.parse_sync('18:13 1405/06/20'), '1405/06/20 18:13')
        self.assertEqual(calls.parse_sync('۱۴۰۵/۶/۲۰  9:05'), '1405/06/20 09:05')
        for bad in ('1405/07/31 10:00', '25:00 1405/06/20', 'با تاخیر', None, 1405):
            self.assertIsNone(calls.parse_sync(bad), bad)
        self.assertEqual(calls.norm_status('موفق', 'پاسخ‌داده‌شده'), ('success', 'answered'))
        self.assertEqual(calls.norm_status('موفق', 'پاسخ داده شده'), ('success', 'answered'))
        self.assertEqual(calls.norm_status('بدون‌پاسخ', 'ازدست‌رفته'), ('no_answer', 'missed'))
        self.assertEqual(calls.norm_status('عدم موفقيت', None), ('failed', 'missed'))
        self.assertEqual(calls.norm_status('مشغول', ''), ('busy', 'missed'))
        self.assertEqual(calls.norm_status('موفق', 'نامشخص'), ('success', 'answered'))
        self.assertEqual(calls.norm_status('قطع', None), ('other', 'other'))

    def test_parse_call_row(self):
        c, why = calls.parse_call_row(FIXTURE['log'][1], CMAP)
        self.assertIsNone(why)
        self.assertEqual((c['channel_code'], c['date_j'], c['time_s'], c['direction'], c['o_ext'], c['o_julio'], c['d_phone'], c['d_contact']),
                         ('1002', '1405/06/19', 66567, 'out', '102', '25', '09000000002', '4075'))
        self.assertEqual((c['total_sec'], c['talk_sec'], c['channel_status'], c['call_status'], c['sync_at']),
                         (504, 503, 'success', 'answered', '1405/06/19 18:37'))
        self.assertEqual(json.loads(c['raw_json']), FIXTURE['log'][1])
        renamed, _ = calls.parse_call_row(row(**{'نام مبدا': 'کارشناس یک ', 'تاریخ همگام‌سازی': '19:00 1405/06/19'}), CMAP)
        self.assertNotEqual(renamed['row_sha256'], c['row_sha256'])
        self.assertEqual(renamed['core_sha256'], c['core_sha256'])     # name / sync are not core
        self.assertEqual(calls.parse_call_row(row(**{'کد کانال': None}), CMAP), (None, 'بدون کد کانال'))
        self.assertEqual(calls.parse_call_row(row(**{'کد کانال': 'abc'}), CMAP), (None, 'بدون کد کانال'))
        self.assertEqual(calls.parse_call_row(row(**{'تاریخ کانال': '1405/07/31'}), CMAP), (None, 'تاریخ نامعتبر'))
        kept, why = calls.parse_call_row(row(**{'ساعت': '??'}), CMAP)
        self.assertEqual((why, kept['time_s']), (None, None))
        q, _ = calls.parse_call_row(FIXTURE['log'][6], CMAP)
        self.assertEqual((q['direction'], q['d_ext'], q['d_julio'], q['o_phone'], q['o_name']), ('in', '999', None, '09000000005', None))
        x, _ = calls.parse_call_row(FIXTURE['log'][5], CMAP)
        self.assertEqual(x['d_phone'], '09000000004')

    def test_parse_log_payload(self):
        out = calls.parse_log_payload(LOG)
        self.assertEqual(([c['channel_code'] for c in out['calls']], out['skipped'], out['in_file_conflicts']),
                         (['1001', '1002', '1003', '1004', '1005', '1006', '1007'], [], []))
        self.assertEqual([c['direction'] for c in out['calls']], ['in', 'out', 'out', 'internal', 'out', 'out', 'in'])
        rows = FIXTURE['log'] + [FIXTURE['log'][0], row(**{'کد کانال': 1003}), row(**{'تاریخ کانال': 'x'})]
        out = calls.parse_log_payload(dict(LOG, rows=rows))
        self.assertEqual([c['channel_code'] for c in out['calls']], ['1001', '1002', '1004', '1005', '1006', '1007'])
        self.assertEqual(out['skipped'], [{'row': 8, 'reason': 'تکراری در فایل'}, {'row': 10, 'reason': 'تاریخ نامعتبر'}])
        self.assertEqual(out['in_file_conflicts'], [{'key': '1003', 'reason': 'in_file', 'rows': [3, 9]}])
        no_dest = [{k: v for k, v in r.items() if k != 'مقصد تماس'} for r in FIXTURE['log']]
        with self.assertRaisesRegex(ValueError, 'مقصد تماس'):
            calls.parse_log_payload(dict(LOG, rows=no_dest))
        for bad in (dict(LOG, sha256='A' * 64), dict(LOG, source='card'), dict(LOG, rows=[]), dict(LOG, fileName=''),
                    dict(LOG, rows=[row(v={'nested': 1})]), dict(LOG, rows=[row(v='x' * 301)]), []):
            with self.assertRaises(ValueError):
                calls.parse_log_payload(bad)
        with self.assertRaises(TooLarge):
            calls.parse_log_payload(dict(LOG, rows=[FIXTURE['log'][0]] * (calls.LIMITS['rows'] + 1)))


class Plan(unittest.TestCase):
    def test_plan_calls(self):
        base = calls.parse_log_payload(LOG)['calls']
        c1002 = base[1]
        meta, _ = calls.parse_call_row(row(**{'نام مقصد': 'مشتری ب۲'}), CMAP)
        newer, _ = calls.parse_call_row(row(**{'مدت مکالمه (ثانیه)': 500, 'تاریخ همگام‌سازی': '18:40 1405/06/19'}), CMAP)
        older, _ = calls.parse_call_row(row(**{'مدت مکالمه (ثانیه)': 500, 'تاریخ همگام‌سازی': '18:30 1405/06/19'}), CMAP)
        same, _ = calls.parse_call_row(row(**{'مدت مکالمه (ثانیه)': 500}), CMAP)
        nosync, _ = calls.parse_call_row(row(**{'مدت مکالمه (ثانیه)': 500, 'تاریخ همگام‌سازی': None}), CMAP)
        stored = {'1002': dict({k: c1002[k] for k in calls.CORE_FIELDS}, row_sha256=c1002['row_sha256'], core_sha256=c1002['core_sha256'], sync_at=c1002['sync_at'])}
        self.assertEqual(calls.plan_calls({}, [c1002])['insert'], [c1002])
        self.assertEqual(calls.plan_calls(stored, [c1002])['unchanged'], 1)
        u = calls.plan_calls(stored, [meta])['update'][0]
        self.assertEqual((u['key'], u['reason'], u['fields'], u['call']), ('1002', 'meta', [], meta))
        u = calls.plan_calls(stored, [newer])['update'][0]
        self.assertEqual((u['reason'], u['fields']), ('newer_sync', ['talk_sec']))
        for c, reason in ((older, 'older_or_same_sync'), (same, 'older_or_same_sync'), (nosync, 'no_sync')):
            plan = calls.plan_calls(stored, [c])
            self.assertEqual((plan['insert'], plan['update'], plan['unchanged']), ([], [], 0))
            self.assertEqual(plan['conflicts'], [{'key': '1002', 'reason': reason, 'fields': ['talk_sec']}])
        no_old_sync = {'1002': dict(stored['1002'], sync_at=None)}
        self.assertEqual(calls.plan_calls(no_old_sync, [newer])['conflicts'][0]['reason'], 'no_sync')
        shas_only = {'1002': {k: stored['1002'][k] for k in ('row_sha256', 'core_sha256', 'sync_at')}}
        self.assertEqual(calls.plan_calls(shas_only, [newer])['update'][0]['fields'], [])

    def test_parse_period(self):
        self.assertEqual(calls.parse_period({'month': '1405/06'}), ('1405/06/01', '1405/06/31'))
        self.assertEqual(calls.parse_period({'month': '۱۴۰۵/۱۲'}), ('1405/12/01', '1405/12/30'))
        self.assertEqual(calls.parse_period({'from': '1405/6/1', 'to': '1405/06/15'}), ('1405/06/01', '1405/06/15'))
        self.assertEqual(calls.parse_period({'from': '1405/01/01', 'to': '1405/12/29'}), ('1405/01/01', '1405/12/29'))
        self.assertEqual(calls.parse_period({'from': '1404/07/01', 'to': '1405/07/01'}), ('1404/07/01', '1405/07/01'))   # 366 days (1404 not leap)
        for bad in ({'from': '1405/06/02', 'to': '1405/06/01'}, {'from': '1404/07/01', 'to': '1405/07/02'}, {'month': '1405/13'},
                    {'month': '1405'}, {'from': '1405/06/01'}, {}, None, '1405/06'):
            with self.assertRaises(ValueError, msg=bad):
                calls.parse_period(bad)

    def test_parse_summary_payload(self):
        out = calls.parse_summary_payload(SUMMARY)
        self.assertEqual((out['direction'], out['period_from'], out['period_to']), ('in', '1405/06/01', '1405/06/31'))
        self.assertEqual([r['ext'] for r in out['rows']], ['999', '301', '103', '102'])
        q, r301, r103, r102 = out['rows']
        self.assertEqual((q['total'], q['answered'], q['talk_sec'], q['agent_name']), (0, 0, 0, 'صف پاسخگویی'))
        self.assertEqual((r102['total'], r102['answered'], r102['no_answer'], r102['busy'], r102['failed'], r102['talk_sec']), (61, 19, 20, 18, 4, 1479))
        self.assertEqual(json.loads(r102['raw_json']), FIXTURE['summary'][3])
        self.assertEqual(out['skipped'], [{'row': 5, 'reason': 'داخلی نامعتبر'}])     # «جمع»
        self.assertEqual(out['warnings'], [])
        rows = copy.deepcopy(FIXTURE['summary'])
        rows[2]['موفق'] = 25
        rows += [copy.deepcopy(FIXTURE['summary'][3]), dict(FIXTURE['summary'][1], **{'تمامی رکوردها': 2}), dict(FIXTURE['summary'][0], **{'موفق': 'x'})]
        out = calls.parse_summary_payload(dict(SUMMARY, rows=rows))
        self.assertEqual([r['ext'] for r in out['rows']], ['999', '103', '102'])   # the invalid 999 copy is skipped before dedupe
        self.assertEqual(out['warnings'], ['جمعِ وضعیت‌ها با کل نمی‌خواند (داخلی 103)'])
        self.assertEqual(out['skipped'], [{'row': 2, 'reason': 'داخلیِ تکراری با محتوای متفاوت'},
                                          {'row': 5, 'reason': 'داخلی نامعتبر'}, {'row': 6, 'reason': 'تکراری در فایل'},
                                          {'row': 7, 'reason': 'داخلیِ تکراری با محتوای متفاوت'}, {'row': 8, 'reason': 'مقدار نامعتبر در ستون موفق'}])
        for bad in (dict(SUMMARY, direction=None), dict(SUMMARY, direction='both'), dict(SUMMARY, period=None),
                    dict(SUMMARY, period={'month': '1405/13'}), dict(SUMMARY, rows=[{'کارشناس': 'x', 'داخلی': 100}])):
            with self.assertRaises(ValueError):
                calls.parse_summary_payload(bad)
        with self.assertRaisesRegex(ValueError, 'جهت و دوره'):
            calls.parse_summary_payload(dict(SUMMARY, direction=None))

    def test_plan_summary(self):
        rows = calls.parse_summary_payload(SUMMARY)['rows']
        plan = calls.plan_summary({'102': rows[3]['row_sha256'], '103': 'old'}, rows)
        self.assertEqual(([r['ext'] for r in plan['insert']], [r['ext'] for r in plan['update']], plan['unchanged']), (['999', '301'], ['103'], 1))


class Stats(unittest.TestCase):
    def test_resolve_party(self):
        idx = [dict(kind='julio', alias_key='25', person_id=1, status='confirmed'), dict(kind='ext', alias_key='102', person_id=1, status='confirmed'),
               dict(kind='ext', alias_key='103', person_id=2, status='confirmed'), dict(kind='julio', alias_key='7', person_id=1, status='confirmed'),
               dict(kind='julio', alias_key='9', person_id=2, status='suggested'), dict(kind='ext', alias_key='104', person_id=None, status='review')]
        self.assertEqual(calls.resolve_party('102', '25', idx), ('1', None))
        self.assertEqual(calls.resolve_party('200', '25', idx), ('1', None))       # julio wins over an unknown extension
        self.assertEqual(calls.resolve_party('103', None, idx), ('2', None))
        self.assertEqual(calls.resolve_party('103', '7', idx), (None, 'julio_ext_conflict'))
        self.assertEqual(calls.resolve_party('104', '9', idx), (None, 'unmapped'))
        self.assertEqual(calls.resolve_party(None, None, idx), (None, 'unmapped'))
        self.assertEqual(calls.resolve_party('103', None, calls.confirmed_index(idx)), ('2', None))

    def test_daily_stats_fixture(self):
        st = calls.daily_stats(calls.parse_log_payload(LOG)['calls'], ALIASES, '1405/06/19', '1405/06/20')
        self.assertEqual([p['personId'] for p in st['people']], ['1', '2'])
        p1, p2 = st['people']
        d = p1['days'][0]
        self.assertEqual(len(p1['days']), 1)
        self.assertEqual({k: d[k] for k in calls.STAT_KEYS}, {'in': 0, 'inAnswered': 0, 'inMissed': 0, 'out': 3, 'outAnswered': 2, 'outUnanswered': 1,
                                                              'internal': 1, 'answered': 2, 'missed': 0, 'talkSec': 503 + 12 + 64 + 9,
                                                              'totalSec': 504 + 14 + 72 + 18, 'afterHours': 1})
        self.assertEqual((p1['totals']['date'], p1['totals']['out']), (None, 3))
        self.assertEqual((p2['totals']['out'], p2['totals']['in'], p2['totals']['inMissed'], p2['totals']['talkSec']), (1, 0, 0, 56))   # 999 never credited to its owner
        self.assertEqual(st['queues'], [{'ext': '999', 'date': '1405/06/19', 'in': 1, 'inAnswered': 0, 'inMissed': 1, 'talkSec': 0, 'totalSec': 20, 'afterHours': 1}])
        self.assertEqual(st['unassigned'], [{'date': '1405/06/19', 'in': 0, 'inMissed': 0, 'out': 0, 'internal': 1, 'unknown': 0},
                                            {'date': '1405/06/20', 'in': 1, 'inMissed': 1, 'out': 0, 'internal': 0, 'unknown': 0}])
        self.assertEqual(st['issues'], [{'kind': 'julio', 'key': '3', 'raw': 'کارشناس دو', 'reason': 'unmapped', 'calls': 1},
                                        {'kind': 'julio', 'key': '5', 'raw': 'کارشناس سه', 'reason': 'unmapped', 'calls': 1}])

    def test_daily_stats_rules(self):
        both = [dict(kind='julio', alias_key='25', person_id=1, status='confirmed'), dict(kind='julio', alias_key='7', person_id=2, status='confirmed'),
                dict(kind='ext', alias_key='300', person_id=1, status='confirmed')]
        cs = [call(direction='internal', d_ext='103', d_julio='7'),                                   # both sides
              call(direction='internal', d_ext='300', d_julio=None),                                  # self-internal: once
              call(direction='out', call_status='missed', time_s=35999),                              # 09:59:59 → after hours
              call(direction='out', call_status='other', time_s=64800),                               # 18:00 → after hours
              call(direction='in', o_ext=None, o_julio=None, d_ext='102', d_julio='25', call_status='missed', time_s=None, talk_sec=None),
              call(direction='in', o_ext=None, o_julio=None, d_ext='102', d_julio='25', time_s=64799),
              call(direction='in', o_ext=None, o_julio=None, d_ext='300', d_julio=None, call_status='answered'),   # queue even if answered
              call(direction='unknown', o_ext=None, o_julio=None),
              call(direction='out', o_ext='150', o_julio=None),
              call(date_j='1405/06/18'), call(date_j='1405/06/21'), call(date_j='1405/06/20')]
        st = calls.daily_stats(cs, both, '1405/06/19', '1405/06/20')
        a = st['people'][0]['days'][0]
        self.assertEqual((a['internal'], a['out'], a['outAnswered'], a['outUnanswered'], a['missed'], a['in'], a['inAnswered'], a['inMissed'], a['answered']),
                         (2, 2, 0, 1, 1, 2, 1, 1, 1))
        self.assertEqual((a['afterHours'], a['talkSec']), (2, 8 * 5))
        self.assertEqual(st['people'][1]['days'][0]['internal'], 1)
        self.assertEqual([d['date'] for d in st['people'][0]['days']], ['1405/06/19', '1405/06/20'])   # inclusive range
        self.assertEqual(st['people'][0]['totals']['out'], 3)
        self.assertEqual(st['queues'][0]['ext'], '300')
        self.assertEqual((st['queues'][0]['in'], st['queues'][0]['inAnswered']), (1, 1))
        self.assertEqual(st['unassigned'], [{'date': '1405/06/19', 'in': 0, 'inMissed': 0, 'out': 1, 'internal': 0, 'unknown': 1}])
        self.assertEqual(st['issues'], [{'kind': 'ext', 'key': '150', 'raw': '150', 'reason': 'unmapped', 'calls': 1}])
        conflict = both + [dict(kind='ext', alias_key='102', person_id=2, status='confirmed')]
        st = calls.daily_stats([call()], conflict, '1405/06/19', '1405/06/19')
        self.assertEqual((st['people'], st['issues'][0]['reason']), ([], 'julio_ext_conflict'))
        st = calls.daily_stats([call()], conflict, '1405/06/19', '1405/06/19', work=(0, 1440))
        self.assertEqual(st['unassigned'][0]['out'], 1)

    def test_daily_records(self):
        st = calls.daily_stats(calls.parse_log_payload(LOG)['calls'], ALIASES, '1405/06/19', '1405/06/20')
        recs = calls.daily_records(st)
        self.assertEqual({r['personId'] for r in recs}, {'1', '2'})
        by = {r['id']: r for r in recs}
        self.assertEqual(sorted(k for k in by if k.startswith('calls:1:')),
                         ['calls:1:1405/06/19:calls_answered', 'calls:1:1405/06/19:calls_internal', 'calls:1:1405/06/19:calls_out', 'calls:1:1405/06/19:talk_seconds'])
        self.assertEqual((by['calls:1:1405/06/19:calls_out']['value'], by['calls:1:1405/06/19:calls_out']['unit']), (3, 'تماس'))
        self.assertEqual((by['calls:1:1405/06/19:talk_seconds']['value'], by['calls:1:1405/06/19:talk_seconds']['unit']), (588, 'ثانیه'))
        self.assertTrue(all(r['source'] == 'call_logs' and r['value'] and r['note'] for r in recs))
        self.assertNotIn('calls:2:1405/06/19:calls_missed', by)       # zeros (and the queue call) never become a record
        self.assertEqual(calls.daily_records({'people': [], 'queues': st['queues']}), [])


if __name__ == '__main__':
    unittest.main()
