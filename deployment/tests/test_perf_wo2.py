"""Frozen WO2 proofs, synthetic data only."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import aromin_performance as perf
import aromin_calls as calls
import server


class WorkOrderTwo(unittest.TestCase):
    def setUp(self):
        self.person={'id':'1','name':'Moharrami','role':'sales'}
        self.full={'fy':'1405','people':[self.person], 'targets':{'1':[3_000_000_000]*12}}
        self.history=[self.row('contracts',30_000_000,date='1405/06/01')]

    def row(self, metric, value, pid='1', date='1405/07/01'):
        return dict(id=metric+pid,personId=pid,date=date,metric=metric,value=value,source='synthetic')

    def targets(self,start='1405/07/01',end='1405/07/30',attendance=(),holidays=()):
        if not isinstance(attendance,dict):
            attendance=self.attendance(attendance)
        return perf.sales_targets(self.full,self.person,start,end,attendance,holidays,self.history)

    def attendance(self, rows=(), coverage=None, mapped=None):
        return {'rows':list(rows),'coverage':set(coverage if coverage is not None else (r['date'] for r in rows)),
                'mappedPersons':set(mapped if mapped is not None else (r['personId'] for r in rows)),'available':True}

    def projection(self, rows, targets, issues=(), available=True):
        return {m['id']:m for m in perf.sales_projection(perf.metrics('sales',rows,issues,'1405/07/01','1405/07/30',None),rows,targets,self.full.get('perf',{}),issues,available)}

    def test_moharrami_26_days_1040_439(self):
        attendance=[dict(personId='1',date='1405/07/%02d'%d,presentMin=450) for d in range(1,27)]
        t=self.targets(attendance=self.attendance(attendance,perf.month_dates(1405,7)))
        self.assertEqual((t['activity'],t['workingDays'],t['basis']),(1040,26,'attendance'))
        activity=self.projection([self.row('calls_answered',457)],[t])['activity']
        self.assertAlmostEqual(activity['pct'],43.9423076923)
        self.assertEqual(round(activity['pct'],1),43.9)

    def test_budget_count_and_average(self):
        t=self.targets()
        self.assertEqual(t['amount'],3_000_000_000)
        self.assertEqual(t['count'],100)
        self.history.append(self.row('contracts',90_000_000,pid='2'))
        self.assertEqual(self.targets()['avgContract'],30_000_000)
        self.history=self.history[1:]
        self.assertEqual(self.targets()['avgContract'],90_000_000)

    def test_quarter_equals_three_months_and_year(self):
        quarter=self.targets('1405/07/01','1405/09/30')
        months=[self.targets('1405/%02d/01'%m,'1405/%02d/30'%m) for m in (7,8,9)]
        for k in ('activity','amount','count'):
            self.assertEqual(quarter[k],sum(t[k] for t in months))
        self.assertEqual(self.targets('1405/01/01',perf.month_dates(1405,12)[-1])['amount'],36_000_000_000)

    def test_half_month_prorates_workdays_and_known_holiday(self):
        holidays={'1405/07/02'}
        t=self.targets(end='1405/07/15',holidays=holidays)
        expected=3_000_000_000*len(perf.calendar_days('1405/07/01','1405/07/15',holidays))/len(perf.calendar_days('1405/07/01','1405/07/30',holidays))
        self.assertAlmostEqual(t['amount'],expected)
        self.assertEqual(t['basis'],'calendar')
        self.assertNotIn('1405/07/02',perf.calendar_days('1405/07/01','1405/07/30',holidays))

    def test_attendance_zero_is_not_calendar_and_precedence(self):
        self.full['perf']={'dailyCallTarget':50,'levelCallTarget':{'senior':60}}
        self.person['level']='senior'
        self.assertEqual(self.targets()['dailyCallTarget'],60)
        self.person['perfSet']={'dailyCallTarget':70}
        self.assertEqual(self.targets()['dailyCallTarget'],70)
        t=self.targets(start='1405/07/01',end='1405/07/01',attendance=[dict(personId='1',date='1405/07/01',presentMin=0)])
        self.assertEqual((t['activity'],t['basis']),(0,'attendance'))

    def test_farvardin_solar_defaults_and_legacy_monthly_target(self):
        self.full['perf']={'callTarget':400}
        self.person['perfSet']={'callTarget':800}
        t=self.targets('1405/01/01','1405/01/31')
        # Solar holidays plus tabular 2 Shawwal on 01/01 and 25 Shawwal on 01/24.
        self.assertEqual((t['workingDays'],t['dailyCallTarget'],t['activity']),(20,40,800))

    def test_daily_target_precedence_and_zero(self):
        self.full['perf']={'dailyCallTarget':50,'levelCallTarget':{'middle':60}}
        self.person['level']='mid'
        self.assertEqual(self.targets()['dailyCallTarget'],60)
        self.person['perfSet']={'dailyCallTarget':70,'callTarget':400}
        self.assertEqual(self.targets()['dailyCallTarget'],70)
        self.person['perfSet']['dailyCallTarget']=0
        self.assertEqual(self.targets()['activity'],0)
        self.person.pop('perfSet'); self.person.pop('level')
        self.assertEqual(self.targets()['dailyCallTarget'],50)

    def test_explicit_holidays_union_and_friday_overlap(self):
        self.full['perf']={'holidays':['1405/01/07','1405/01/08','1405/01/08']}
        t=self.targets('1405/01/01','1405/01/31',holidays={'1405/01/08','1405/01/09'})
        self.assertEqual(t['workingDays'],18)
        self.full['perf']['holidays']=[]
        self.assertEqual(self.targets('1405/01/01','1405/01/31')['workingDays'],20)

    def test_solar_defaults_follow_period_year_across_year_boundary(self):
        self.assertEqual(self.targets('1406/01/01','1406/01/04')['workingDays'],0)
        self.assertEqual(self.targets('1405/12/29','1406/01/04')['workingDays'],0)

    def test_missing_target_renormalises_caps_and_no_data(self):
        target=dict(activity=10,count=None,amount=100,basis='calendar',workingDays=1)
        rows=[self.row('calls_answered',20),self.row('calls_out',40),self.row('contracts',50)]
        eff=self.projection(rows,[target])['efficiency']
        self.assertEqual(eff['value'],100)
        self.assertEqual(eff['parts']['weights'],dict(activity=.5,count=0,amount=.5))
        self.assertEqual(eff['status'],'partial')
        self.assertEqual(eff['answerRate'],50)
        self.assertEqual(self.projection(rows,[dict(target,activity=None,amount=None)])['efficiency']['status'],'no_data')

    def test_group_sums_before_percentages_and_relevant_issues(self):
        targets=[dict(activity=10,count=1,amount=100,basis='attendance',workingDays=1),dict(activity=30,count=3,amount=300,basis='calendar',workingDays=3)]
        rows=[self.row('calls_answered',20),self.row('calls_answered',20,pid='2'),self.row('contracts',400)]
        result=self.projection(rows,targets)
        self.assertEqual(result['activity']['target'],40)
        self.assertEqual(result['activity']['basis'],'mixed')
        self.assertEqual(result['efficiency']['parts']['count']['pct'],25)
        self.assertAlmostEqual(result['efficiency']['value'],75)
        self.assertEqual(self.projection(rows,targets,[{'metric':'tasks'}])['efficiency']['status'],'valid')
        self.assertEqual(self.projection(rows,targets,[{'metric':'contracts'}])['efficiency']['status'],'partial')
        self.assertEqual(self.projection(rows,targets,available=False)['efficiency']['status'],'partial')

    def test_forecast_year_is_scoped_and_missing_month_not_guessed(self):
        self.full['years']={'1404':{'targets':{'1':[12]*12}}}
        self.assertEqual(self.targets('1404/07/01','1404/07/30')['amount'],12)
        self.assertIsNone(self.targets('1403/07/01','1403/07/30')['amount'])
        self.full['targets']['1'][7]=None
        self.assertIsNone(self.targets('1405/07/01','1405/09/30')['amount'])

    def test_peak_hour_boundaries_and_mapping(self):
        aliases=[dict(kind='julio',alias_key='seller',person_id='1',status='confirmed')]
        def call(time,direction='out',status='answered'):
            return dict(date_j='1405/07/01',time_s=time,direction=direction,call_status=status,o_ext='101',o_julio='seller',d_ext='101',d_julio='seller')
        data=[call(t) for t in (35999,36000,39599,39600,50400,53999,54000)]
        data += [call(36000,'internal'),call(36000,status='missed'),dict(call(36000,'in'),d_julio=None)]
        totals=perf.call_totals(calls.daily_records(calls.daily_stats(data,aliases,'1405/07/01','1405/07/30'),performance=True))
        self.assertEqual(totals['calls_peak_answered'],4)
        self.assertEqual(totals['calls_answered'],7)
        self.assertAlmostEqual(totals['peakHourShare'],400/7)

    def test_server_attendance_confirmation_overrides_and_holidays(self):
        tx=MagicMock()
        tx.x.return_value.fetchall.side_effect=[
            [dict(alias_key='10',person_id='1',status='confirmed'),dict(alias_key='20',person_id='2',status='suggested')],
            [dict(card_no='10',date_j='1405/07/01',present_min=100,note=''),dict(card_no='20',date_j='1405/07/02',present_min=450,note='تعطیل رسمی')],
            [dict(card_no='10',date_j='1405/07/01',fields='{"present":"07:30"}')], []]
        with patch.object(server,'_SaTx') as factory:
            factory.return_value.__enter__.return_value=tx
            context,holidays=server._perf_target_attendance('synthetic','1405/07/01','1405/07/30')
        self.assertEqual(context['rows'],[dict(personId='1',date='1405/07/01',presentMin=450)])
        self.assertEqual(context['coverage'],{'1405/07/01'})
        self.assertEqual(context['mappedPersons'],{'1'})
        self.assertEqual(holidays,{'1405/07/02'})

    def test_summary_uses_projection_for_person_and_group_without_leaking_history(self):
        from starlette.requests import Request
        self.person['inv']=[dict(id='old',saleDate='1405/06/01',amount=30_000_000),dict(id='current',saleDate='1405/07/01',amount=30_000_000)]
        self.person['level']='middle'
        attendance=[dict(personId='1',date='1405/07/%02d'%d,presentMin=450) for d in range(1,27)]
        request=Request({'type':'http','headers':[]})
        with patch.object(server,'kb_identity',return_value={'role':'manager','user':'test'}), \
             patch.object(server,'_tenant_full',return_value=self.full), \
             patch.object(server,'_kb_directory',return_value=({},None)), \
             patch.object(server,'_perf_call_records',return_value=[self.row('calls_answered',457),self.row('calls_out',500)]), \
             patch.object(server,'_perf_ticket_records',return_value=[]), \
             patch.object(server,'_perf_target_attendance',return_value=(self.attendance(attendance,perf.month_dates(1405,7)),set())) as read_attendance:
            result=server.performance_read('summary',request,tenant='synthetic',person='',unit='sales',start='1405/07/01',end='1405/07/30',metric='tasks',offset=0,limit=100)
            read_attendance.return_value=(self.attendance(coverage=perf.month_dates(1405,7),mapped={'2'}),set())
            unmapped=server.performance_read('summary',request,tenant='synthetic',person='',unit='sales',start='1405/07/01',end='1405/07/30',metric='tasks',offset=0,limit=100)
        person=result['people'][0]
        self.assertEqual(person['level'],'middle')
        own={m['id']:m for m in person['metrics']}
        group={m['id']:m for m in result['groups'][0]['metrics']}
        self.assertEqual(own['activity']['target'],1040)
        self.assertEqual(own['efficiency']['parts']['count']['target'],100)
        self.assertEqual(group['efficiency']['value'],own['efficiency']['value'])
        self.assertEqual(own['efficiency']['answerRate'],91.4)
        self.assertEqual((group['activity']['attendanceDays'],group['activity']['calendarDays']),(26,0))
        issue={'personId':'1','metric':'activity','reason':'کارتِ حضورِ این شخص نگاشت نشده'}
        self.assertIn(issue,unmapped['issues'])
        self.assertIn(issue,unmapped['people'][0]['issues'])
        self.assertEqual(unmapped['groups'][0]['metrics'][0]['targetStatus'],'partial')

    def test_mixed_period_uses_daily_tenant_coverage(self):
        coverage={'1405/07/04','1405/07/05','1405/07/06'}
        # Coverage may be supplied by another person's confirmed card.
        rows=[dict(personId='2',date=date,presentMin=450) for date in coverage]
        rows.append(dict(personId='1',date='1405/07/04',presentMin=450))
        t=self.targets(end='1405/07/06',attendance=self.attendance(rows,coverage,mapped={'1','2'}))
        calendar=len(perf.calendar_days('1405/07/01','1405/07/03'))
        self.assertEqual((t['basis'],t['attendanceDays'],t['calendarDays']),('mixed',1,calendar))
        self.assertEqual(t['activity'],40*(1+calendar))
        self.assertFalse(t['issue'])
        metric=self.projection([], [t])['activity']
        self.assertEqual((metric['attendanceDays'],metric['calendarDays']),(1,calendar))
        self.assertEqual(metric['targetStatus'],'valid')

    def test_unmapped_card_is_visible_and_never_calendar_on_covered_dates(self):
        t=self.targets(end='1405/07/02',attendance=self.attendance(coverage={'1405/07/01','1405/07/02'},mapped={'2'}))
        self.assertEqual(t['basis'],'attendance')
        self.assertEqual(t['calendarDays'],0)
        self.assertIsNone(t['activity'])
        issue={'personId':'1','metric':'activity','reason':'کارتِ حضورِ این شخص نگاشت نشده'}
        self.assertEqual(t['issues'],[issue])
        result=self.projection([], [t])
        self.assertEqual(result['activity']['targetStatus'],'partial')
        self.assertEqual(result['activity']['status'],'partial')
        self.assertEqual(result['activity']['targetIssues'],[issue])
        self.assertEqual(result['efficiency']['status'],'partial')

    def test_absent_person_with_confirmed_card_counts_zero(self):
        rows=[dict(personId='2',date='1405/07/01',presentMin=450)]
        t=self.targets(end='1405/07/01',attendance=self.attendance(rows,mapped={'1','2'}))
        self.assertEqual((t['activity'],t['workingDays'],t['attendanceDays'],t['calendarDays']),(0,0,0,0))
        self.assertEqual(t['basis'],'attendance')
        self.assertFalse(t['issue'])

    def test_sync_batch_covers_dates_without_rows_or_zurvan_configuration(self):
        tx=MagicMock()
        tx.x.return_value.fetchall.side_effect=[
            [dict(alias_key='10',person_id='1',status='confirmed')], [], [],
            [dict(period_from='1405/06/30',period_to='1405/07/02')]]
        with patch.object(server,'ZURVAN_API_URL',''),patch.object(server,'_SaTx') as factory, \
             patch.object(server.urllib.request,'urlopen') as network:
            factory.return_value.__enter__.return_value=tx
            context,holidays=server._perf_target_attendance('synthetic','1405/07/01','1405/07/03')
            network.assert_not_called()
        self.assertEqual(context['coverage'],{'1405/07/01','1405/07/02'})
        t=self.targets(end='1405/07/03',attendance=context,holidays=holidays)
        self.assertEqual((t['basis'],t['attendanceDays']),('mixed',0))
        self.assertEqual(t['calendarDays'],len(perf.calendar_days('1405/07/03','1405/07/03')))

    def test_same_zurvan_payload_ingested_twice_has_identical_targets(self):
        # Exercise the actual parser, ingest duplicate branch and target read path,
        # with a stateful synthetic transaction in place of MariaDB.
        import aromin_attendance as att
        import json
        alias=dict(kind='card',alias_key='10',person_id='1',status='confirmed')
        stored={}; batches=[]
        tx=MagicMock(); tx.cur.lastrowid=1
        def query(sql,args):
            if sql.startswith('INSERT INTO attendance_batches'):
                batches.append(dict(id=1,file_sha256=args[1],period_from=args[5],period_to=args[6]))
            elif sql.startswith('INSERT INTO attendance_days'):
                stored[(args[1],args[2])]=dict(card_no=args[1],date_j=args[2],present_min=args[6],note=args[7],row_sha256=args[9])
            elif sql.startswith('SELECT'):
                if 'FROM identity_aliases' in sql: data=[alias]
                elif 'FROM attendance_days' in sql: data=list(stored.values())
                elif 'FROM attendance_batches' in sql: data=batches
                else: data=[]
                result=MagicMock(); result.fetchall.return_value=data; return result
            return MagicMock()
        def one(sql,args):
            if 'identity_aliases' in sql: return alias
            return batches[0] if batches else None
        tx.x.side_effect=query; tx.one.side_effect=one
        sheets=server._zurvan_rows({'rows':[{'card_no':'10','date_j':'1405/07/01','punches':['10:00','18:00'],'present_min':450}]})
        parsed=att.parse_payload(dict(fileName='synthetic.json',sha256='b'*64,source='zurvan',sheets=sheets))
        with patch.object(server,'ZURVAN_API_URL',''),patch.object(server,'_SaTx') as factory, \
             patch.object(server,'_domain_lock'),patch.object(server,'_member_write'), \
             patch.object(server,'_alias_write'),patch.object(server,'_att_batch',side_effect=lambda b:b), \
             patch.object(server.urllib.request,'urlopen') as network:
            factory.return_value.__enter__.return_value=tx
            first=server._att_ingest('synthetic','test',parsed,[self.person])
            self.assertEqual(first.status_code,201)
            self.assertFalse(json.loads(first.body)['duplicate'])
            context,holidays=server._perf_target_attendance('synthetic','1405/07/01','1405/07/02')
            before=self.targets(end='1405/07/02',attendance=context,holidays=holidays)
            self.assertTrue(server._att_ingest('synthetic','test',parsed,[self.person])['duplicate'])
            context,holidays=server._perf_target_attendance('synthetic','1405/07/01','1405/07/02')
            after=self.targets(end='1405/07/02',attendance=context,holidays=holidays)
            network.assert_not_called()
        self.assertEqual(before,after)
        self.assertEqual((len(stored),len(batches)),(1,1))
        self.assertEqual((before['activity'],before['attendanceDays'],before['basis']),(80,1,'mixed'))

if __name__=='__main__': unittest.main()
