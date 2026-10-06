"""Run only against the explicitly configured disposable local database/server."""
import json
import os
import sys
import unittest
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

@unittest.skipUnless(os.environ.get('AROMIN_LOCAL_INTEGRATION') == '1', 'requires disposable local MariaDB')
class LocalIntegration(unittest.TestCase):
    tenant = 'codex_ui_test'
    def setUp(self):
        self.assertEqual(server.CFG_DB['database'], 'aromin_dev')
        server.ensure_tenant_table()
        self.entry = {'ts':123,'name':'test.xlsx','type':'deal','sig':'test','rows':1}
        self.full = {'fy':'1405','people':[{'id':1,'name':'Active','inv':[], 'invY':{'1404':[{'id':2,'no':'OLD','settle':'cash','amount':'100'}],'1405':[]}}], 'users':{'test_admin':{'pass':'local-test-only','role':'manager'},'test_sales':{'pass':'local-test-only','role':'sales'}},'importLog':[self.entry]}
        server.q('DELETE FROM tenant_state WHERE tenant=%s',(self.tenant,))
        server._c1_save(self.tenant,self.full)

    def request(self,path,body=None,user=None):
        headers={'Content-Type':'application/json'}
        if user: headers.update({'X-Aromin-User':user,'X-Aromin-Pass':'local-test-only'})
        req=urllib.request.Request('http://127.0.0.1:3000'+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
        try:
            with urllib.request.urlopen(req) as r: return r.status,json.load(r)
        except urllib.error.HTTPError as e: return e.code,json.load(e)

    def test_authorized_deletion_survives_stale_saves_without_touching_business_data(self):
        body={'tenant':self.tenant,'entry':self.entry}
        self.assertEqual(self.request('/api/import-history/delete',body)[0],401)
        self.assertEqual(self.request('/api/import-history/delete',body,'test_sales')[0],403)
        tampered=dict(self.full,importLog=[],_importDeleted=[server._import_key(self.entry)])
        self.assertEqual(self.request('/api/state?tenant='+self.tenant,tampered)[0],200)
        self.assertEqual(server._tenant_full(self.tenant)['importLog'],[self.entry])
        self.assertEqual(self.request('/api/import-history/delete',body,'test_admin')[0],200)
        self.assertEqual(self.request('/api/state?tenant='+self.tenant,self.full)[0],200)
        stored=server._tenant_full(self.tenant)
        self.assertEqual(stored['importLog'],[])
        self.assertEqual(stored['people'],self.full['people'])

    def test_migrations_repeat_and_collection_enum_is_supported(self):
        self.assertEqual(server.run_migrations(server.CFG_DB),0)
        col=server.q("SHOW COLUMNS FROM deals LIKE 'settle'")[0]
        self.assertIn('cash_after_check',col['Type'])
        good=json.loads(json.dumps(self.full))
        good['people'][0]['inv']=[{'id':3,'settle':'cash_after_check'}]
        self.assertEqual(self.request('/api/state?tenant='+self.tenant,good)[0],200)
        good['people'][0]['inv'][0]['settle']='not_a_status'
        self.assertEqual(self.request('/api/state?tenant='+self.tenant,good)[0],422)

    def test_row_layout_is_not_truncated_to_tile_limit(self):
        order=[str(i) for i in range(120)]
        body={'tenant':self.tenant,'list':'ledger.rows.1405','order':order}
        self.assertEqual(self.request('/api/ui-layout',body)[0],401)
        self.assertEqual(self.request('/api/ui-layout',body,'test_admin')[0],200)
        code,doc=self.request('/api/ui-layout?tenant='+self.tenant+'&list=ledger.rows.1405',user='test_admin')
        self.assertEqual(code,200)
        self.assertEqual(doc['order'],order)

    def test_compensation_http_and_stale_save_protection(self):
        body={'tenant':self.tenant,'pid':1,'comp':'fixed','bonus':{'id':'bonus-test-123','amount':'500','month':6,'fy':'1405','reason':'عملکرد خوب'}}
        self.assertEqual(self.request('/api/c1/compensation',body)[0],401)
        self.assertEqual(self.request('/api/c1/compensation',body,'test_sales')[0],403)
        self.assertEqual(self.request('/api/c1/compensation',body,'test_admin')[0],200)
        self.assertEqual(self.request('/api/c1/compensation',body,'test_admin')[0],200)
        self.assertEqual(self.request('/api/state?tenant='+self.tenant,self.full)[0],200)
        stored=server._tenant_full(self.tenant)['people'][0]
        self.assertEqual(stored['comp'],'fixed');self.assertEqual(len(stored['approvedBonuses']),1)
        self.assertEqual(stored['approvedBonuses'][0]['amount'],500)

    def test_google_routes_precede_static_mount_and_require_auth(self):
        self.assertEqual(self.request('/api/ai/google/settings?tenant='+self.tenant)[0],401)
        self.assertEqual(self.request('/api/ai/google/settings?tenant='+self.tenant,user='test_sales')[0],403)
        status,data=self.request('/api/ai/google/settings?tenant='+self.tenant,user='test_admin')
        self.assertEqual(status,200);self.assertNotIn('key',data)
        self.assertEqual(self.request('/api/ai/google/test',{'tenant':self.tenant},'test_admin')[0],422)

    def tearDown(self):
        server.ensure_ui_layout_table()
        server.q('DELETE FROM ui_layout WHERE tenant=%s',(self.tenant,))
        server.q('DELETE FROM tenant_state WHERE tenant=%s',(self.tenant,))

if __name__ == '__main__': unittest.main()
