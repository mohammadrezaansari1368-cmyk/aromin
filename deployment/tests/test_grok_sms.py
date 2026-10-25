import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
import aromin_grok_sms as sms

class GrokSms(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  app=FastAPI();app.include_router(sms.router(lambda r,t:{'role':r.headers.get('x-role','sales')} if r.headers.get('x-user') else None,self.tmp.name))
  self.client=TestClient(app);self.admin={'x-user':'admin','x-role':'manager'}
  self.key='synthetic-provider-key';self.token='synthetic-token-'+'x'*40
  self.settings={'PAYAMRESAN_API_KEY':self.key,'PAYAMRESAN_DEFAULT_SENDER':'30001234','GROK_SMS_API_TOKEN':self.token,'SMS_MAX_RECIPIENTS':100,'SMS_REQUIRE_CONFIRMATION':True}
  self.assertEqual(self.client.post('/api/settings/grok-sms',headers=self.admin,json=self.settings).status_code,200)
  self.auth={'Authorization':'Bearer '+self.token};self.body={'recipients':['09123456789'],'message':'synthetic text','confirmed_by_user':True}
 def send(self,body=None,headers=None):return self.client.post('/api/grok/send-sms',headers=self.auth if headers is None else headers,json=self.body if body is None else body)
 def test_admin_only_all_settings_routes(self):
  for method,path in [('get',''),('post',''),('post','/regenerate'),('post','/test'),('get','/audit'),('get','/schema')]:
   self.assertEqual(getattr(self.client,method)('/api/settings/grok-sms'+path).status_code,403)
 def test_secret_roundtrip_and_private_permissions(self):
  data=self.client.get('/api/settings/grok-sms',headers=self.admin).text
  self.assertNotIn(self.key,data);self.assertNotIn(self.token,data);self.assertNotIn('token_hash',data)
  path=sms.Store(self.tmp.name).path('team');self.assertEqual(os.stat(path).st_mode&0o777,0o600)
  self.assertNotIn(self.token,path.read_text());self.assertIn(hashlib.sha256(self.token.encode()).hexdigest(),path.read_text())
 def test_auth_and_tenant_isolation(self):
  for headers in [{},{'Authorization':'Bearer wrong'},{'Authorization':'Basic '+self.token}]:self.assertEqual(self.send(headers=headers).status_code,401)
  self.assertEqual(self.client.get('/api/grok/health?tenant=other',headers=self.auth).status_code,401)
 def test_validation_never_contacts_provider(self):
  with patch.object(sms,'send_provider') as provider:
   for change in [{'recipients':[]},{'recipients':['123']},{'recipients':['09123456789']*101},{'message':''},{'message':None},{'recipients':[9123456789]},{'send_to_blocked_numbers':'false'},{'confirmed_by_user':'true'},{'sender_number':'bad'}]:
    self.assertEqual(self.send({**self.body,**change}).status_code,400)
   self.assertEqual(self.send({**self.body,'confirmed_by_user':False}).status_code,409)
   provider.assert_not_called()
 def test_explicit_confirmation_optional_only_if_admin_disables(self):
  self.client.post('/api/settings/grok-sms',headers=self.admin,json={'SMS_REQUIRE_CONFIRMATION':False})
  with patch.object(sms,'send_provider',return_value=['123']):self.assertEqual(self.send({**self.body,'confirmed_by_user':False}).status_code,200)
 def test_send_mapping_and_audit_redaction(self):
  with patch.object(sms,'send_provider',return_value=['123','456']) as provider:
   r=self.send({**self.body,'recipients':['+989123456789','۰۹۱۲۳۴۵۶۷۸۹','00989129876543'],'sender_number':'50001'})
   self.assertEqual(r.status_code,200);self.assertEqual(r.json()['message_ids'],['123','456'])
   self.assertEqual(provider.call_args.args[1],{'SenderNumber':'50001','Message':'synthetic text','MobileNumber':['09123456789','09129876543'],'SendToBlocksNumber':False})
  audit=self.client.get('/api/settings/grok-sms/audit',headers=self.admin)
  for secret in [self.key,self.token,self.body['message'],'09123456789']:self.assertNotIn(secret,audit.text)
  self.assertEqual([r['status'] for r in audit.json()['rows']],['pending','success'])
 def test_provider_failure_is_generic_and_audited(self):
  with patch.object(sms,'send_provider',side_effect=RuntimeError(self.key)):
   r=self.send();self.assertEqual(r.status_code,502);self.assertNotIn(self.key,r.text)
  self.assertEqual(self.client.get('/api/settings/grok-sms/audit',headers=self.admin).json()['rows'][-1]['status'],'failed_or_unknown')
 def test_regeneration_revokes_old_token(self):
  r=self.client.post('/api/settings/grok-sms/regenerate',headers=self.admin)
  self.assertEqual(r.headers['cache-control'],'no-store');token=r.json()['token']
  self.assertGreaterEqual(len(token),48);self.assertEqual(self.client.get('/api/grok/health',headers=self.auth).status_code,401)
  self.assertEqual(self.client.get('/api/grok/health',headers={'Authorization':'Bearer '+token}).status_code,200)
  self.assertNotIn(token,self.client.get('/api/settings/grok-sms',headers=self.admin).text)
 def test_blank_secret_preserves_settings_and_safe_test(self):
  self.client.post('/api/settings/grok-sms',headers=self.admin,json={'PAYAMRESAN_API_KEY':'','GROK_SMS_API_TOKEN':''})
  with patch.object(sms,'send_provider') as provider:
   r=self.client.post('/api/settings/grok-sms/test',headers=self.admin);self.assertEqual(r.status_code,200);self.assertFalse(r.json()['provider_verified']);provider.assert_not_called()
  self.assertEqual(self.client.get('/api/grok/health',headers=self.auth).status_code,200)
 def test_invalid_settings_dont_overwrite(self):
  for change in [{'SMS_MAX_RECIPIENTS':True},{'SMS_MAX_RECIPIENTS':0},{'SMS_REQUIRE_CONFIRMATION':'false'},{'GROK_SMS_API_TOKEN':'short'},{'PAYAMRESAN_API_KEY':'key\nheader'}]:
   self.assertEqual(self.client.post('/api/settings/grok-sms',headers=self.admin,json=change).status_code,400)
  self.assertEqual(self.client.get('/api/grok/health',headers=self.auth).status_code,200)
 def test_schema_is_secret_free_and_consequential(self):
  r=self.client.get('/api/settings/grok-sms/schema',headers=self.admin)
  self.assertNotIn(self.token,r.text);self.assertNotIn(self.key,r.text)
  self.assertTrue(r.json()['paths']['/api/grok/send-sms']['post']['x-openai-isConsequential'])
 def test_provider_transport_exact_contract_and_unknown_rejected(self):
  response=MagicMock();response.__enter__.return_value=response
  response.read.return_value=json.dumps({'Success':True,'MessageIds':[123]}).encode()
  opener=MagicMock();opener.open.return_value=response
  body={'SenderNumber':'30001234','Message':'synthetic','MobileNumber':['09123456789'],'SendToBlocksNumber':False}
  with patch.object(sms.urllib.request,'build_opener',return_value=opener):
   self.assertEqual(sms.send_provider(self.settings,body),['123'])
   req=opener.open.call_args.args[0];self.assertEqual(req.full_url,sms.PROVIDER_URL);self.assertEqual(req.get_header('Apikey'),self.key);self.assertEqual(json.loads(req.data),body)
   response.read.return_value=b'{"status":"unknown"}'
   with self.assertRaises(ValueError):sms.send_provider(self.settings,body)
