"""Metric issue coverage uses synthetic source records only."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import aromin_performance as p


class IssueScope(unittest.TestCase):
 def setUp(self):
  self.person={'id':1,'name':'Synthetic seller','inv':[{'id':1,'amount':100,'saleDate':'1405/01/02'},
                            {'id':2,'amount':100}]}
  self.rows,self.issues=p.records({'fy':'1405','people':[self.person]},[self.person],lambda ts:None)
  self.rows += [{'metric':m,'value':v,'source':'call_logs'} for m,v in
                [('calls_in',4),('calls_out',6),('calls_answered',8)]]

 def metrics(self,issues):
  return {m['id']:m for m in p.metrics('sales',self.rows,issues,'1405/01/01','1405/01/31',None)}

 def test_contract_issue_does_not_affect_calls(self):
  self.assertEqual(len(self.issues),1)
  self.assertEqual(self.issues[0]['metric'],'contracts')
  metrics=self.metrics(self.issues)
  for key in ('activity','efficiency'):
   self.assertEqual(metrics[key]['status'],'valid')
   self.assertEqual(metrics[key]['coverage']['issues'],0)
  self.assertEqual(metrics['contract_average']['status'],'partial')
  self.assertEqual(metrics['contract_average']['coverage']['issues'],1)

 def test_untagged_issue_keeps_existing_behavior(self):
  metrics=self.metrics([{'personId':'1','reason':'legacy issue'}])
  for key in ('activity','efficiency','contract_average'):
   self.assertEqual(metrics[key]['status'],'partial')
  for metric in metrics.values():
   self.assertEqual(metric['coverage']['issues'],1)
  self.assertEqual(metrics['conversion']['status'],'no_data')

 def test_call_source_issue_affects_both_call_axes_only(self):
  metrics=self.metrics([{'personId':'1','metric':'calls_in','reason':'call issue'}])
  for key in ('activity','efficiency'):
   self.assertEqual(metrics[key]['status'],'partial')
   self.assertEqual(metrics[key]['coverage']['issues'],1)
  self.assertEqual(metrics['contract_average']['coverage']['issues'],0)


if __name__ == '__main__':
 unittest.main()
