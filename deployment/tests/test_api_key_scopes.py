"""Exercise the actual server functions offline, without importing startup/DB drivers."""
import ast
from pathlib import Path
import time
import functools
import hashlib
import types
import unittest
from unittest.mock import Mock, patch

SERVER = Path(__file__).resolve().parents[1]/'server.py'


class Response:
    def __init__(self, body, status_code=200, **kwargs):
        self.body, self.status_code = body, status_code


@functools.lru_cache(maxsize=1)
def compiled_functions():
    tree = ast.parse(SERVER.read_text(encoding='utf-8'))
    names = {'_sync_auth','sync_notify','calls_log_upload','calls_summary_upload','joolio_snapshot_post','performance_conversion','_performance_patch'}
    selected = []
    for node in tree.body:
        if isinstance(node,ast.FunctionDef) and node.name in names:
            node.decorator_list=[]
            selected.append(node)
    return compile(ast.Module(body=selected,type_ignores=[]),str(SERVER),'exec')


def load_functions():
    env = dict(Request=object,Body=lambda **kw:None,Query=lambda **kw:None,
               JSONResponse=Response,KB_ADMIN_ROLES=('manager','salesmgr','accmgr'),ATT_ADMIN_ROLES=('manager','salesmgr','accmgr','finance'),
               _att_deny=lambda status,msg:Response({'error':msg},status),time=time,hashlib=hashlib)
    exec(compiled_functions(),env)
    return env


class ScopeChecks(unittest.TestCase):
    def setUp(self):
        self.env=load_functions()
        self.env['api_key_lookup']=Mock(return_value=dict(id=9,name='test',tenant='team',scopes=['calls:write']))
        self.env['kb_identity']=Mock(return_value={'role':'manager','user':'owner'})

    def test_bad_key_never_falls_back(self):
        self.env['api_key_lookup'].return_value=None
        ident,err=self.env['_sync_auth'](Mock(headers={'x-api-key':'bad'}),'team','calls:write')
        self.assertIsNone(ident)
        self.assertEqual(err.status_code,401)
        self.env['kb_identity'].assert_not_called()

    def test_sessions(self):
        for role in ('manager','salesmgr','accmgr','finance','sales',None):
            self.env['kb_identity'].return_value={'role':role,'user':'test'} if role else None
            ident,err=self.env['_sync_auth'](Mock(headers={}),'team','calls:write')
            self.assertEqual(err is None,role in ('manager','salesmgr','accmgr'))

    def test_endpoint_scope_wiring(self):
        for name,scope in [('calls_log_upload','calls:write'),('calls_summary_upload','calls:write'),('joolio_snapshot_post','joolio:write'),('sync_notify','sync:notify')]:
            denied=Response({},403)
            guard=Mock(return_value=(None,denied))
            self.env['_sync_auth']=guard
            fn=self.env[name]
            result=fn(Mock(headers={}),{'tenant':'team'},tenant='team') if name in ('joolio_snapshot_post','sync_notify') else fn(Mock(headers={}),{'tenant':'team'})
            self.assertIs(result,denied)
            self.assertEqual(guard.call_args.args[1:3],('team',scope))
        self.env['_performance_patch']=Mock(return_value='ok')
        # conversion imports a pure module, not server startup.
        import sys
        sys.path.insert(0,str(SERVER.parent))
        with patch.dict(sys.modules,aromin_performance=types.SimpleNamespace()):
            self.env['performance_conversion'](Mock(),{'tenant':'team'})
        self.assertEqual(self.env['_performance_patch'].call_args.kwargs['sync_scope'],'conversion:write')

    def test_notify_validation(self):
        self.env['_sync_auth']=Mock(return_value=({'key_id':9},None))
        for text in ('',None,1,'x'*501,'bad\x00'):
            result=self.env['sync_notify'](Mock(),{'text':text},tenant='team')
            self.assertEqual(result.status_code,400)

    def test_conversion_patch_checks_key(self):
        denied=Response({},403)
        self.env['_sync_auth']=Mock(return_value=(None,denied))
        result=self.env['_performance_patch'](Mock(),{'tenant':'team'},Mock(),sync_scope='conversion:write')
        self.assertIs(result,denied)
        self.env['_sync_auth'].assert_called_once()

    def test_call_context_preserves_people_loading(self):
        class ReachedParser(Exception): pass
        self.env.update(_tenant_full=Mock(return_value={'people':[]}),idmap=Mock(),
                        calls=Mock(),att=types.SimpleNamespace(TooLarge=type('TooLarge',(Exception,),{})))
        self.env['calls'].parse_log_payload.side_effect=ReachedParser()
        self.env['calls'].parse_summary_payload.side_effect=ReachedParser()
        req=Mock(headers={'x-api-key':'synthetic'})
        for fn in ('calls_log_upload','calls_summary_upload'):
            with self.assertRaises(ReachedParser): self.env[fn](req,{'tenant':'team'})
        self.assertEqual(self.env['idmap'].people_of.call_count,2)

    def test_notify_persistent_limit_and_fallback(self):
        stored={}
        class Tx:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def x(self,sql,args):
                if sql.startswith('UPDATE'): stored[(args[1],args[2])]=args[0]
            def one(self,sql,args): return {'v':stored.get(tuple(args),'0')}
        self.env.update(_SaTx=Tx,sa_manager=Mock(return_value={'id':1}),
                        lead_chat_id=Mock(side_effect=lambda tenant,pid,ch:'chat'),
                        lead_send=Mock(side_effect=[RuntimeError('synthetic'),True]),
                        time=Mock(time=Mock(return_value=10000)))
        req=Mock(headers={'x-api-key':'synthetic'})
        self.env['api_key_lookup'].return_value['scopes']=['sync:notify']
        result=self.env['sync_notify'](req,{'text':'test'},tenant='team')
        self.assertEqual(result,{'ok':True,'sent':True})
        self.assertEqual(self.env['lead_send'].call_args_list[0].args[0],'bale')
        self.assertEqual(self.env['lead_send'].call_args_list[1].args[0],'tg')
        denied=self.env['sync_notify'](req,{'text':'test'},tenant='team')
        self.assertEqual(denied.status_code,429)
        self.assertEqual(self.env['lead_send'].call_count,2)
        self.env['time'].time.return_value=10600
        self.env['lead_send'].side_effect=None
        self.assertTrue(self.env['sync_notify'](req,{'text':'test'},tenant='team')['sent'])


for scope in ('calls:write','joolio:write','conversion:write','sync:notify'):
    for requested in ('calls:write','joolio:write','conversion:write','sync:notify'):
        for tenant in ('team','other'):
            def test(self,scope=scope,requested=requested,tenant=tenant):
                self.env['api_key_lookup'].return_value['scopes']=[scope]
                ident,err=self.env['_sync_auth'](Mock(headers={'x-api-key':'synthetic'}),tenant,requested)
                allowed=scope==requested and tenant=='team'
                self.assertEqual(err is None,allowed)
                self.assertEqual(ident is not None,allowed)
                if not allowed: self.assertEqual(err.status_code,403)
            setattr(ScopeChecks,'test_key_'+scope.replace(':','_')+'_'+requested.replace(':','_')+'_'+tenant,test)


if __name__ == '__main__': unittest.main()
