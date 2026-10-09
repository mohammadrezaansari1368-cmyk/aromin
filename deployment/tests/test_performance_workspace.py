"""Scoped projections use synthetic data, never production state."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
import aromin_performance as p

class Performance(unittest.TestCase):
 def setUp(self):
  self.full={'fy':'1405','people':[{'id':1,'name':'الف','role':'sales','perf':{'dailyTasks':{'1405/07/01':0,'1405/07/02':3}},'invY':{'1405':[{'id':10,'funnel':'won','amount':'100','saleDate':'1405/07/02','finBy':'مالی','finAudit':[{'action':'fin_by','to':'مالی','ts':1790899200000}]}]}},{'id':2,'name':'ب','role':'sales','perf':{'dailyTasks':{'1405/07/02':9}}},{'id':3,'name':'مالی','role':'finance'},{'id':4,'name':'پشتیبان','role':'support','inactive':True}]}
  self.users={'a':{'person':'الف'},'b':{'person':'ب'},'f':{'personId':3}}
 def call(self,view,role='sales',user='a',**extra):
  args=dict(tenant='team',person='',unit='',start='1405/07/01',end='1405/07/30',metric='tasks',offset=0,limit=100);args.update(extra)
  with patch.object(server,'kb_identity',return_value={'user':user,'role':role}),patch.object(server,'_tenant_full',return_value=self.full),patch.object(server,'_kb_directory',return_value=(self.users,self.full['people'])):
   return server.performance_read(view,None,**args)
 def test_employee_summary_and_details_scope(self):
  self.assertEqual([x['id'] for x in self.call('summary')['people']],['1'])
  for view in ['summary','daily','details']:
   self.assertEqual(self.call(view,person='2').status_code,403)
  self.assertEqual(self.call('details')['total'],2)
  self.assertEqual(sum(r['value'] for r in self.call('details')['rows']),3)
  self.assertEqual(self.call('summary')['people'][0]['tasks'],3)
 def test_managers_are_unit_scoped_and_unmapped_accounts_fail_closed(self):
  self.assertEqual({x['unit'] for x in self.call('directory',role='salesmgr')['people']},{'sales'})
  self.assertEqual(self.call('summary',role='salesmgr',unit='finance').status_code,403)
  self.assertEqual(self.call('details',role='salesmgr',person='3').status_code,403)
  self.assertEqual(self.call('directory',user='unknown').status_code,403)
  self.assertEqual(len(self.call('directory',role='manager')['people']),4)
 def test_zero_missing_and_empty_are_distinct(self):
  daily=self.call('daily',person='1')['days'];self.assertEqual(daily[0]['value'],0)
  self.assertEqual(len(daily),2)
  self.assertIsNone(self.call('summary',start='1405/06/01',end='1405/06/31')['people'][0]['tasks'])
  self.assertIsNone(self.call('summary')['people'][0]['metrics'][2]['value'])
 def test_calendar_period_not_fiscal_year_inference(self):
  self.full['people'][0]['invY']['1404']=self.full['people'][0]['invY'].pop('1405')
  detail=self.call('details',metric='contracts')['rows'][0]
  self.assertEqual(detail['fiscalYear'],'1404');self.assertEqual(detail['date'],'1405/07/02')
 def test_weighted_mean_and_dedup(self):
  d=self.full['people'][0]['invY']['1405'][0];self.full['people'][0]['invY']['1405'].append(copy.deepcopy(d))
  self.full['people'][1]['invY']={'1405':[dict(d,id=11,amount='300'),dict(d,id=12,amount='500')]}
  metrics=self.call('summary',role='manager',unit='sales')['groups'][0]['metrics']
  self.assertEqual(metrics[-1]['value'],300);self.assertEqual(metrics[-1]['denominator'],3)
 def test_finance_owner_is_not_event_actor(self):
  out=self.call('details',role='finance',user='f',metric='finance_documents')['rows']
  self.assertEqual(len(out),1);self.assertEqual(out[0]['personId'],'3')
 def test_undated_finance_and_invalid_amount_not_guessed(self):
  d=self.full['people'][0]['invY']['1405'][0];d['finAudit']=[];d['amount']='bad'
  data=self.call('summary',role='manager');self.assertEqual(len(data['issues']),2)
  self.assertEqual(self.call('details',role='manager',metric='finance_documents')['rows'],[])
 def test_pagination_has_no_sensitive_customer_fields(self):
  out=self.call('details',limit=1);self.assertEqual(len(out['rows']),1);self.assertEqual(out['total'],2)
  self.assertNotIn('customer',str(out));self.assertNotIn('pass',str(out))
 def test_invalid_dates_and_duplicate_ids_rejected(self):
  self.assertEqual(self.call('summary',start='1405/12/30').status_code,400)
  self.full['people'][1]['id']=1
  self.assertEqual(self.call('directory').status_code,400)

 def test_ambiguous_task_dates_and_documents_are_excluded(self):
  self.full['people'][0]['perf']['dailyTasks']['1405/7/2']=3
  self.assertEqual(self.call('details')['total'],1)
  d=self.full['people'][0]['invY']['1405'][0]
  self.full['people'][0]['invY']['1405'].append(dict(d,amount=999))
  self.assertEqual(self.call('details',metric='contracts')['total'],0)
 def test_source_whitelist_and_unauthenticated_request(self):
  self.full['people'][0]['perf']['secret']='hidden'
  source=self.call('source')['full']
  self.assertEqual(len(source['people']),1)
  self.assertNotIn('secret',str(source));self.assertNotIn('invY',str(source))
  with patch.object(server,'kb_identity',return_value=None):
   self.assertEqual(server.performance_read('summary',None,tenant='team').status_code,401)
