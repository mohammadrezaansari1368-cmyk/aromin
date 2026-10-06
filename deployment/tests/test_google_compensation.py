import sys, unittest, tempfile, json, os
from pathlib import Path
from unittest.mock import patch, MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class GoogleCompensationTests(unittest.TestCase):
 def test_settings_and_test_require_admin(self):
  for ident, status in [(None,401), ({'role':'sales'},403), ({'role':'finance'},403)]:
   with patch.object(server,'kb_identity',return_value=ident), patch.object(server,'_google_ai_config') as cfg:
    for handler in [server.google_ai_save, server.google_ai_test]:
     self.assertEqual(handler(None, {'tenant':'test'}).status_code,status)
    cfg.assert_not_called()
 def test_private_tenant_isolation_and_no_secret_echo(self):
  with tempfile.TemporaryDirectory() as tmp, patch.object(server,'GOOGLE_SECRET_DIR',tmp), patch.object(server,'kb_identity',return_value={'role':'manager'}):
   key='A'*39
   result=server.google_ai_save(None,{'tenant':'test','key':key,'enabled':True})
   self.assertNotIn(key,json.dumps(result)); self.assertTrue(result['configured'])
   self.assertEqual(os.stat(server._google_ai_path('test')).st_mode & 0o777,0o600)
   self.assertEqual(server._google_ai_config('another'),{})
   result=server.google_ai_save(None,{'tenant':'test','key':'','enabled':False})
   self.assertFalse(result['enabled']); self.assertEqual(server._google_ai_config('test')['key'],key)
 def test_enabled_google_routes_real_ai_adapter_and_error_redacts(self):
  with patch.object(server,'_google_ai_config',return_value={'enabled':True,'key':'secret'}), patch.object(server,'_google_chat',return_value={'ok':True,'text':'ok'}) as google:
   self.assertTrue(server.ai_chat('system','user',tenant='test')['ok']); google.assert_called_once()
  with patch.object(server.urllib.request,'urlopen',side_effect=RuntimeError('secret')):
   result=server._google_chat({'key':'secret'},'s','q'); self.assertNotIn('secret',json.dumps(result))
 def test_generic_state_cannot_forge_compensation(self):
  before={'people':[{'id':1,'comp':'fixed','approvedBonuses':[{'amount':50,'by':'manager'}]}]}
  after={'people':[{'id':1,'comp':'commission','approvedBonuses':[{'amount':999}]}]}
  server._preserve_compensation(before,after); self.assertEqual(after,before)
 def test_compensation_rejects_sales_and_bad_input(self):
  with patch.object(server,'kb_identity',return_value={'role':'sales'}),patch.object(server,'db_conn') as db:
   self.assertEqual(server.compensation_update(None,{'tenant':'test','comp':'hybrid'}).status_code,403); db.assert_not_called()
  with patch.object(server,'kb_identity',return_value={'role':'manager'}),patch.object(server,'db_conn') as db:
   self.assertEqual(server.compensation_update(None,{'tenant':'test','comp':'fixed','bonus':{'amount':'-1'}}).status_code,422);db.assert_not_called()
 def test_manager_bonus_is_idempotent_under_transaction(self):
  full={'people':[{'id':1,'comp':'fixed'}]}
  cursor=MagicMock();cursor.fetchone.side_effect=lambda:{'payload':json.dumps(full)}
  def execute(sql,args):
   if sql.startswith('UPDATE'): full.update(json.loads(args[0]))
  cursor.execute.side_effect=execute
  connection=MagicMock();connection.cursor.return_value.__enter__.return_value=cursor
  payload={'tenant':'test','pid':1,'comp':'fixed','bonus':{'id':'bonus-1234','amount':'500','fy':'1405','month':6,'reason':'عملکرد خوب'}}
  with patch.object(server,'kb_identity',return_value={'role':'manager','user':'admin'}),patch.object(server,'db_conn',return_value=connection):
   server.compensation_update(None,payload);server.compensation_update(None,payload)
  bonuses=full['people'][0]['approvedBonuses'];self.assertEqual(len(bonuses),1);self.assertEqual(bonuses[0]['by'],'admin');self.assertEqual(bonuses[0]['amount'],500)

 def test_financial_approval_attributes_fixed_salary_invoice_and_zeroes_commission(self):
  for batch in (False, True):
   deal={'id':7,'funnel':'won','amount':'100000000'}
   full={'people':[{'id':1,'name':'seller','comp':'fixed','inv':[deal]}],'users':{'finance':{'person':'Financial Expert'}}}
   data={'tenant':'test','id':7,'ids':[7],'cash':'500','pending':'100','regDateJ':'1405/07/13','confirmAccuracy':True,'confirmRegistered':True}
   ident={'user':'finance','role':'finance'}
   with patch.object(server,'_c1_ctx',return_value=('test',ident,full,None)),patch.object(server,'_c1_backup'),patch.object(server,'_c1_save'):
    result=(server.c1_approve_batch if batch else server.c1_approve)(None,data)
   self.assertTrue(result['ok']);self.assertEqual(deal['finBy'],'Financial Expert')
   self.assertEqual(deal['finApproval']['cash'],0);self.assertEqual(deal['finApproval']['pending'],0)
   self.assertEqual(deal['finAudit'][-1]['cash'],0)

 def test_sales_date_enrichment_preserves_locked_invoice_and_stale_saves(self):
  invoice={'id':7,'no':'INV','finState':'approved','amount':999,'fy':'1405'}
  old={'fy':'1405','people':[{'id':1,'invY':{'1405':[invoice]}}],'saleDates':{'1404':{'1:6':'1404/01/01'}}}
  import copy
  new=copy.deepcopy(old);new['saleDates']['1405']={'1:7':'1405/07/05','1:999':'1405/07/05'}
  server._merge_sale_dates(old,new)
  self.assertIsNone(server._c1_lock_violation(old,new));self.assertEqual(new['people'],old['people'])
  self.assertEqual(new['saleDates']['1405'],{'1:7':'1405/07/05'})
  stale=copy.deepcopy(old);server._merge_sale_dates(new,stale)
  self.assertEqual(stale['saleDates'],new['saleDates'])
  change=copy.deepcopy(stale);change['saleDates']['1405']['1:7']='1405/07/06';server._merge_sale_dates(new,change)
  self.assertEqual(change['saleDates'],new['saleDates'])
