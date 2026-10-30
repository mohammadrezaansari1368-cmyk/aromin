"""WO4 proofs: synthetic state, calls and attendance; no external writes."""
import copy
import json
import unittest
from unittest.mock import MagicMock, patch

import aromin_performance as perf
import server


class WorkOrderFour(unittest.TestCase):
    def setUp(self):
        self.person = dict(id='898', name='Synthetic', role='support', level='mid',
                           roleHistory=[dict(role='sales', **{'from': '1300/01/01'}),
                                        dict(role='support', **{'from': '1405/07/01'})])
        self.full = dict(fy='1405', people=[self.person], targets={'898': [2600]*12})

    def ingest(self, month='1405/01', rows=None):
        return perf.conversion_store(self.full, dict(month=month, source='joolio', rows=rows or [
            dict(name='Synthetic', entered=10, won=4)]), server.joolio_name, 123)

    def read(self, view='summary', **params):
        defaults=dict(tenant='synthetic', person='', unit='', start='1405/01/01', end='1405/07/30', metric='tasks', offset=0, limit=100)
        defaults.update(params)
        calls=[dict(id=d, personId='898', date=d, metric='calls_answered', value=3, source='synthetic')
               for d in ('1405/01/10','1405/07/10')]
        with patch.object(server,'kb_identity',return_value=dict(role='manager',user='test')), \
             patch.object(server,'_tenant_full',return_value=self.full), \
             patch.object(server,'_kb_directory',return_value=({},None)), \
             patch.object(server,'_perf_call_records',return_value=calls), \
             patch.object(server,'_perf_ticket_records',return_value=[]), \
             patch.object(server,'_perf_target_attendance',return_value=({'rows':[], 'coverage':set(), 'available':True},set())):
            return server.performance_read(view,MagicMock(),**defaults)

    def test_store_normalization_unmapped_and_idempotence(self):
        self.person['name']='علي كريمي'
        rows=[dict(name='علی کریمی',entered=10,won=4),dict(name='Unknown',entered=2,won=1)]
        result=self.ingest(rows=rows)
        self.assertEqual(result['unmapped'],['Unknown'])
        self.ingest(rows=rows)
        self.assertEqual(self.full['perfConversion']['1405/01']['898'],dict(entered=10,won=4,at=123))

    def test_invalid_counts_do_not_write(self):
        for entered,won in ((True,0),(-1,0),(1,2),(1.5,1)):
            with self.assertRaises(ValueError): self.ingest(rows=[dict(name='Synthetic',entered=entered,won=won)])
        self.assertNotIn('perfConversion',self.full)

    def test_month_overlap_partial_and_group_sums(self):
        self.ingest(); self.ingest('1405/02')
        other=dict(id='2',name='Other',role='sales')
        self.full['people'].append(other)
        self.ingest(rows=[dict(name='Other',entered=30,won=6)])
        metric=perf.conversion_metric(self.full,self.full['people'],'1405/01/01','1405/01/31')
        self.assertEqual((metric['numerator'],metric['denominator'],metric['value']),(10,40,25))
        self.assertEqual(metric['status'],'valid')
        metric=perf.conversion_metric(self.full,[self.person],'1405/01/15','1405/02/05')
        self.assertEqual((metric['numerator'],metric['denominator']),(8,20))
        self.assertEqual(metric['status'],'partial')
        self.assertIn('بازه ماه را قطع کرده',metric['note'])

    def test_preserve_autosave_and_c1_save(self):
        self.ingest(); incoming={'perfConversion':{}}
        server._preserve_import_history(self.full,incoming)
        self.assertEqual(incoming['perfConversion'],self.full['perfConversion'])
        cx=MagicMock(); cx.cursor.return_value.__enter__.return_value.fetchone.return_value={'payload':json.dumps(self.full)}
        with patch.object(server,'db_conn',return_value=cx): server._c1_save('synthetic',{})
        saved=json.loads(cx.cursor.return_value.__enter__.return_value.execute.call_args.args[1][-1])
        self.assertEqual(saved['perfConversion'],self.full['perfConversion'])

    def test_locked_endpoint_and_denied_roles(self):
        cx=MagicMock(); cur=cx.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value={'payload':json.dumps(self.full)}
        payload=dict(month='1405/01',rows=[dict(name='Synthetic',entered=5,won=2)],source='joolio')
        with patch.object(server,'db_conn',return_value=cx), patch.object(server,'kb_identity',return_value=dict(role='manager')):
            result=server.performance_conversion(MagicMock(headers={}),payload)
        self.assertTrue(result['ok']); self.assertIn('FOR UPDATE',cur.execute.call_args_list[0].args[0]); cx.commit.assert_called_once()
        with patch.object(server,'db_conn') as db, patch.object(server,'kb_identity',return_value=dict(role='support')):
            self.assertEqual(server.performance_conversion(MagicMock(headers={}),payload).status_code,403); db.assert_not_called()

    def test_role_groups_split_calls(self):
        result=self.read()
        self.assertEqual({g['unit']:g['calls']['calls_answered'] for g in result['groups']},{'sales':3,'support':3})
        self.assertEqual([r['unit'] for r in result['people'][0]['rolePeriods']],['sales','support'])
        self.assertEqual(perf.role_at(self.person,'1405/06/31'),'sales')
        self.assertEqual(perf.role_at(self.person,'1405/07/01'),'support')

    def test_absent_history_and_role_change(self):
        old={'people':[dict(id=1,name='Synthetic',role='sales')]}; new=copy.deepcopy(old)
        self.assertEqual(perf.role_at(old['people'][0],'1400/01/01'),'sales')
        new['people'][0]['role']='finance'
        perf.update_role_history(old,new,'1405/07/01',True)
        self.assertEqual(perf.role_at(new['people'][0],'1405/06/31'),'sales')
        self.assertEqual(new['people'][0]['roleHistory'][-1],{'role':'finance','from':'1405/07/01'})

    def test_periods_and_historical_unit_person(self):
        for start,end in [('1405/01/01','1405/01/31'),('1405/01/01','1405/03/31'),
                          ('1405/01/01','1405/12/29'),('1405/01/10','1405/07/10')]:
            with self.subTest(start=start,end=end):
                result=self.read(start=start,end=end)
                groups={g['unit']:g for g in result['groups']}
                self.assertEqual(groups['sales']['calls']['calls_answered'],3)
                self.assertEqual(result['people'][0]['rolePeriods'][0]['unit'],'sales')
        result=self.read(person='898',unit='sales',start='1405/01/01',end='1405/01/31')
        self.assertEqual(result['people'][0]['unit'],'sales')
        activity=next(m for m in result['people'][0]['metrics'] if m['id']=='activity')
        self.assertEqual(activity['value'],3)

    def test_seed_idempotent(self):
        self.person.pop('roleHistory')
        with patch.object(server,'_performance_patch',side_effect=lambda r,p,f:f(self.full)):
            self.assertFalse(server.performance_role_seed(None,{})['unchanged'])
            before=copy.deepcopy(self.full)
            self.assertTrue(server.performance_role_seed(None,{})['unchanged'])
        self.assertEqual(before,self.full)

    def test_daily_tasks_and_attendance_target(self):
        self.person['perf']={'dailyTasks':{'۱۴۰۵/۷/۱':7,'1405/07/02':3}}
        result=self.read('daily',person='898',start='1405/07/01',end='1405/07/30')
        self.assertEqual([d['value'] for d in result['days']],[7,3])
        self.assertAlmostEqual(result['taskTargets']['daily']['1405/07/01'],300/26)
        working=perf.calendar_days('1405/07/01','1405/07/30')
        rows=[dict(personId='898',date=d,dayStatus='present' if i<20 else 'leave') for i,d in enumerate(working)]
        attendance=dict(rows=rows,coverage=set(perf.month_dates(1405,7)),mappedPersons={'898'},available=True)
        targets=perf.task_targets(self.full,self.person,'1405/07/01','1405/07/30',attendance,(),[])
        self.assertEqual(targets['daily']['1405/07/01'],15)
        self.assertEqual(targets['target'],300)

    def test_level_defaults_and_overrides(self):
        history=[dict(metric='contracts',personId='898',date='1405/01/10',value=100)]*10
        self.assertEqual(perf.unit_target(self.full,self.person,'support','1405/01/01','1405/07/30',{},(),history),3)
        self.full['perf']={'levelTargets':{'support':{'mid':{'daily':5}}}}
        target=perf.unit_target(self.full,self.person,'support','1405/07/01','1405/07/30',{},(),history)
        self.assertEqual(target,130)
        result=self.read(start='1405/07/01',end='1405/07/30')
        metrics={m['id']:m for m in result['people'][0]['metrics']}
        self.assertEqual(metrics['tickets']['target'],130)
        self.assertIsNone(metrics['activity']['target'])  # Composite calls + tickets is not a ticket count.


if __name__=='__main__': unittest.main()
