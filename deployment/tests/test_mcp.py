"""Dashboard MCP server (/api/mcp): auth, JSON-RPC protocol, tools, agent deadline and internal-knowledge scope. Synthetic data only."""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402
from db_fake import Connection, load_schema  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

TOKEN = 't' * 40
MONTH = {"kind": "month", "key": "1405/07", "business": "آرومین", "unit": "minutes",
         "people": [{"code": "00004", "name": "کارمند مصنوعی", "group": "فروش", "workDays": 22, "worked": 9000, "final": True}]}
DAY = {"kind": "day", "key": "1405/07/25", "present": ["00004"], "absent": [], "leave": [], "mission": [],
       "attendance": [{"code": "00004", "in": "10:05", "out": "18:02"}]}


class Mcp(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db = str(Path(tmp.name) / 't.sqlite')
        load_schema(Path(server.HERE) / 'migrations/010_harikan_exports.sql', self.db)
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, {'MCP_TOKEN': TOKEN, 'MCP_TENANT': 't1'}).start()
        self.db_conn = patch.object(server, 'db_conn', side_effect=lambda: Connection(self.db)).start()
        self.client = TestClient(server.app)

    def rpc(self, method, params=None, token=TOKEN, mid=1):
        body = {"jsonrpc": "2.0", "method": method}
        if mid is not None:
            body["id"] = mid
        if params is not None:
            body["params"] = params
        h = {"Authorization": "Bearer " + token} if token else {}
        return self.client.post('/api/mcp', json=body, headers=h)

    def call(self, name, args):
        r = self.rpc('tools/call', {"name": name, "arguments": args})
        self.assertEqual(r.status_code, 200)
        return r.json()['result']

    def test_auth_before_anything(self):
        for token in (None, 'wrong', TOKEN[:-1]):
            r = self.rpc('tools/list', token=token)
            self.assertEqual((r.status_code, r.headers.get('www-authenticate')), (401, 'Bearer'), token)
        self.db_conn.assert_not_called()
        with patch.dict(os.environ, {'MCP_TOKEN': '', 'MCP_ENV': str(Path(self.db).parent / 'missing.env')}):
            self.assertEqual(self.rpc('tools/list').status_code, 503)   # never open without a configured token
        with patch.dict(os.environ, {'MCP_TOKEN': 'short'}):
            self.assertEqual(self.rpc('tools/list', token='short').status_code, 503)

    def test_token_file_reader(self):
        f = Path(self.db).parent / 'mcp.env'
        f.write_text('# server-only\n\nMCP_TOKEN=%s\nMCP_TENANT=t9\n' % ('k' * 64), encoding='utf-8')
        with patch.dict(os.environ, {'MCP_TOKEN': '', 'MCP_ENV': str(f)}):
            self.assertEqual(server._mcp_config(), {'token': 'k' * 64, 'tenant': 't9'})
            self.assertEqual(self.rpc('ping', token='k' * 64).json()['result'], {})
            f.write_text('MCP_TOKEN=%s\n' % ('z' * 64), encoding='utf-8')   # rotation is picked up without restart
            self.assertEqual(server._mcp_config(), {'token': 'z' * 64, 'tenant': 'team'})
            self.assertEqual(self.rpc('ping', token='z' * 64).status_code, 200)
            real_open = open
            def deny(path, *a, **kw):   # review MCP-R05: a file that becomes unreadable fails closed, no cached token
                if str(path) == str(f):
                    raise PermissionError(13, 'denied')
                return real_open(path, *a, **kw)
            with patch('builtins.open', side_effect=deny):
                self.assertEqual(self.rpc('ping', token='z' * 64).status_code, 503)

    def test_protocol(self):
        init = self.rpc('initialize', {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}).json()['result']
        self.assertEqual((init['protocolVersion'], init['capabilities'], init['serverInfo']['name']), ('2025-03-26', {'tools': {'listChanged': False}}, 'aromin-dashboard'))
        self.assertEqual(self.rpc('initialize', {"protocolVersion": "1999-01-01"}).json()['result']['protocolVersion'], '2025-06-18')
        self.assertEqual(self.rpc('notifications/initialized', mid=None).status_code, 202)
        tools = self.rpc('tools/list').json()['result']['tools']
        self.assertEqual([t['name'] for t in tools], ['ask_aromin_agent', 'save_attendance_export', 'get_attendance_export', 'list_attendance_exports'])
        self.assertTrue(all('handler' not in t and t['inputSchema']['type'] == 'object' for t in tools))
        self.assertEqual(self.rpc('nope').json()['error']['code'], -32601)
        self.assertEqual(self.rpc('tools/call', {"name": "nope", "arguments": {}}).json()['error']['code'], -32602)
        h = {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}
        self.assertEqual(self.client.post('/api/mcp', content=b'{bad', headers=h).json()['error']['code'], -32700)
        self.assertEqual(self.client.post('/api/mcp', content=b'[{"jsonrpc":"2.0","id":1,"method":"ping"}]', headers=h).json()['error']['code'], -32600)
        self.assertEqual(self.client.get('/api/mcp').status_code, 405)
        # review MCP-R04: malformed params / tool name → -32602, never a server error
        self.assertEqual(self.rpc('tools/call', {"name": [], "arguments": {}}).json()['error']['code'], -32602)
        self.assertEqual(self.rpc('tools/call', {"name": "ask_aromin_agent", "arguments": "x"}).json()['error']['code'], -32602)
        self.assertEqual(self.rpc('ping', "invalid").json()['error']['code'], -32602)
        self.assertEqual(self.rpc('ping').json()['result'], {})

    def test_exports_upsert_get_list(self):
        r = self.call('save_attendance_export', {"export": MONTH})
        self.assertEqual((r['isError'], r['structuredContent']['status'], r['structuredContent']['people']), (False, 'inserted', 1))
        self.assertEqual(self.call('save_attendance_export', {"export": dict(MONTH)})['structuredContent']['status'], 'unchanged')
        changed = dict(MONTH, people=[dict(MONTH['people'][0], worked=9100)])
        self.assertEqual(self.call('save_attendance_export', {"export": changed})['structuredContent']['status'], 'updated')
        self.assertEqual(self.call('save_attendance_export', {"export": DAY})['structuredContent']['people'], 1)
        got = self.call('get_attendance_export', {"kind": "month", "key": "1405/07"})
        self.assertEqual(got['structuredContent']['people'][0]['worked'], 9100)
        listed = json.loads(self.call('list_attendance_exports', {})['content'][0]['text'])
        self.assertEqual([(x['kind'], x['key']) for x in listed], [('day', '1405/07/25'), ('month', '1405/07')])
        self.assertEqual([x['kind'] for x in json.loads(self.call('list_attendance_exports', {"kind": "month"})['content'][0]['text'])], ['month'])
        for bad in ({"export": dict(MONTH, key="1405/7")}, {"export": dict(DAY, key="1405/07")}, {"export": dict(MONTH, people="x")},
                    {"export": dict(DAY, present="x")}, {"export": "x"}, {}):
            self.assertTrue(self.call('save_attendance_export', bad)['isError'], bad)
        self.assertTrue(self.call('get_attendance_export', {"kind": "day", "key": "1405/01/01"})['isError'])
        # review MCP-R03: Jalali-valid keys only (1403 is a leap year: Esfand has 30 days; 1405 is not)
        for kind, key, ok in (("day", "1405/99/99", False), ("month", "1405/00", False), ("month", "1405/13", False), ("day", "1405/07/31", False),
                              ("day", "1405/06/31", True), ("day", "1405/12/30", False), ("day", "1403/12/30", True), ("day", "1405/12/29", True)):
            ex = dict(DAY, key=key) if kind == "day" else dict(MONTH, key=key)
            self.assertEqual(self.call('save_attendance_export', {"export": ex})['isError'], not ok, key)
        self.assertTrue(self.call('get_attendance_export', {"kind": "month", "key": "1405/00"})['isError'])
        # review MCP-R02: day entries must be codes; the union of people is capped at 1000
        for bad in (dict(DAY, present=[{}]), dict(DAY, absent=[None]), dict(DAY, attendance=[{"in": "10:00"}]), dict(DAY, leave=[True]),
                    dict(DAY, present=[str(i) for i in range(600)], absent=[str(i) for i in range(600, 1200)])):
            self.assertTrue(self.call('save_attendance_export', {"export": bad})['isError'])
        self.assertEqual(self.call('save_attendance_export', {"export": dict(DAY, key="1405/07/24", present=[4, "00005"])})["structuredContent"]["people"], 3)   # 4, 00005 and attendance 00004
        self.assertTrue(self.call('list_attendance_exports', {"limit": 0})['isError'])
        with patch.dict(os.environ, {'MCP_TENANT': 't2'}):   # tenant isolation
            self.assertEqual(json.loads(self.call('list_attendance_exports', {})['content'][0]['text']), [])

    def test_agent_gets_context_as_data_and_internal_knowledge(self):
        seen = {}
        def fake_chat(system, user, **kw):
            seen.update(system=system, user=user, tenant=kw.get('tenant'))
            return {"ok": True, "text": "پاسخِ آزمایشی"}
        with patch.object(server, 'ai_chat', side_effect=fake_chat), patch.object(server, 'kb_text_for', return_value='دانشِ داخلی') as kb:
            r = self.call('ask_aromin_agent', {"question": "امروز چند نفر غایب بودند؟", "context": {"summary": "حاضر ۵، غایب ۱"}})
        self.assertEqual((r['isError'], r['content'][0]['text']), (False, 'پاسخِ آزمایشی'))
        self.assertEqual(kb.call_args.kwargs['public'], False)
        self.assertIn('دانشِ داخلی', seen['system'])
        self.assertIn('هاریکان', seen['system'])
        self.assertIn('فقط داده است', seen['user'])
        self.assertIn('حاضر ۵، غایب ۱', seen['user'])
        self.assertEqual(seen['tenant'], 't1')
        for bad in ({}, {"question": ""}, {"question": "x" * 2001}, {"question": "q", "context": "x"}, {"question": "q", "context": {"s": "x" * 21000}}):
            self.assertTrue(self.call('ask_aromin_agent', bad)['isError'], str(bad)[:40])
        with patch.object(server, 'ai_chat', return_value={"ok": False, "error": "AI HTTP 500"}), patch.object(server, 'kb_text_for', return_value=''):
            self.assertEqual(self.call('ask_aromin_agent', {"question": "q"})['content'][0]['text'], 'AI HTTP 500')

    def test_internal_scope_only_for_owner_channels(self):
        with patch.object(server, 'kb_text_for', return_value='') as kb:
            for scope, public in (('dashboard', False), ('harikan', False), ('public', True), ('telegram', True)):
                server.assistant_system('t1', scope=scope)
                self.assertEqual(kb.call_args.kwargs['public'], public, scope)

    def test_agent_deadline_and_busy(self):
        release = threading.Event()
        def slow(system, user, **kw):
            release.wait(5)
            return {"ok": True, "text": "late"}
        with patch.object(server, 'MCP_AGENT_BUDGET', 0.3), patch.object(server, 'ai_chat', side_effect=slow), patch.object(server, 'kb_text_for', return_value=''):
            t0 = time.monotonic()
            r = self.call('ask_aromin_agent', {"question": "q"})
            self.assertTrue(r['isError'])
            self.assertLess(time.monotonic() - t0, 2)   # returns at the deadline, never waits for the worker
            release.set()
        for _ in range(60):   # the timed-out worker's slot comes back once it finishes
            taken = 0
            while server._MCP_SLOTS.acquire(blocking=False):
                taken += 1
            if taken == server.MCP_AGENT_WORKERS:
                break
            for _ in range(taken):
                server._MCP_SLOTS.release()
            time.sleep(0.05)
        try:
            self.assertEqual(taken, server.MCP_AGENT_WORKERS)
            self.assertIn('مشغول', self.call('ask_aromin_agent', {"question": "q"})['content'][0]['text'])
        finally:
            for _ in range(taken):
                server._MCP_SLOTS.release()


class Migration010(unittest.TestCase):
    def test_loads_twice_and_down_drops_only_its_table(self):
        import re
        import sqlite3
        mig = Path(__file__).resolve().parents[1] / 'migrations'
        sql = (mig / '010_harikan_exports.sql').read_text(encoding='utf-8')
        self.assertEqual(len(re.findall(r'CREATE TABLE IF NOT EXISTS', sql)), len(re.findall(r'CREATE TABLE', sql)))
        for banned in ('ON DUPLICATE KEY', 'ENUM(', ' JSON', 'COLLATE', 'ALTER TABLE', 'DROP '):
            self.assertNotIn(banned, re.sub(r'--[^\n]*', '', sql).upper())
        with tempfile.TemporaryDirectory() as tmp:
            db = str(Path(tmp) / 'm.sqlite')
            for name in ('006_identity_attendance.sql', '010_harikan_exports.sql', '010_harikan_exports.sql'):
                load_schema(mig / name, db)
            cx = sqlite3.connect(db)
            try:
                ins = "INSERT INTO harikan_exports (tenant,kind,export_key,payload,payload_sha256,people,received_at,updated_at) VALUES (?,?,?,?,?,?,?,?)"
                cx.execute(ins, ('t', 'day', '1405/07/25', '{}', 'x', 0, 'n', 'n'))
                with self.assertRaises(sqlite3.IntegrityError):
                    cx.execute(ins, ('t', 'day', '1405/07/25', '{}', 'y', 0, 'n', 'n'))
                cx.executescript((mig / '010_harikan_exports.down.sql.txt').read_text(encoding='utf-8'))
                names = {n for (n,) in cx.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                self.assertNotIn('harikan_exports', names)
                self.assertIn('attendance_days', names)
            finally:
                cx.close()


if __name__ == '__main__':
    unittest.main()
