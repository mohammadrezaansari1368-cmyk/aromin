"""Synthetic browser fixture. Run locally only; never mount in production."""
import sys, urllib.parse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_performance_workspace import Performance
t=Performance();t.setUp()
t.full['people'][0]['name']='الف'
users={**t.users,'test':{'person':'','role':'manager'},'unit':{'person':'','role':'salesmgr'}}
roles={'test':'manager','a':'sales','b':'sales','f':'finance','unit':'salesmgr'}
def identity(request,tenant):
 user=urllib.parse.unquote(request.headers.get('x-aromin-user',''))
 if tenant!='team' or request.headers.get('x-aromin-pass')!='test-only' or user not in roles:return None
 return {'user':user,'role':roles[user]}
server.kb_identity=identity
server._tenant_full=lambda tenant:t.full
server._kb_directory=lambda tenant:(users,t.full['people'])
from fastapi import FastAPI
app=FastAPI()
app.get('/api/performance/{view}')(server.performance_read)
