"""WP-04: optimistic concurrency on tenant_state.payload via If-Match/version, so two editors
saving the same tenant at once don't silently overwrite each other (synthetic fakes only)."""
import copy
import json
import os
import re
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from starlette.requests import Request
import server

MIG = Path(__file__).resolve().parents[1] / 'migrations'
LEGACY = Path(__file__).resolve().parents[1] / 'legacy.html'


class Migration014(unittest.TestCase):
    def test_idempotent_text_and_matching_down_file(self):
        sql = (MIG / '014_tenant_state_version.sql').read_text(encoding='utf-8')
        self.assertIn('CREATE TABLE IF NOT EXISTS tenant_state', sql)
        self.assertIn('ADD COLUMN IF NOT EXISTS version', sql)
        down = (MIG / '014_tenant_state_version.down.sql.txt').read_text(encoding='utf-8')
        self.assertIn('DROP COLUMN IF EXISTS version', down)


class LegacyHtmlNeverAdoptsConflictVersion(unittest.TestCase):
    """legacy.html's inline <script> has no JS test harness (nothing in deployment/tests
    loads/executes it), so this is a static source check: a 409 conflict response must never
    let API.version (or the conflicted flag) be set from that same response's data."""

    def setUp(self):
        self.html = LEGACY.read_text(encoding='utf-8')

    def test_api_save_returns_before_adopting_version_on_409(self):
        m = re.search(r'async save\(state\)\{.*?\n    \},', self.html, re.DOTALL)
        self.assertIsNotNone(m, 'API.save() not found')
        body = m.group(0)
        self.assertIn('if(this.conflicted) return', body,
                      'API.save must refuse to send while a conflict is pending, for callers that skip the check')
        conflict_idx = body.index('status===409')
        return_idx = body.index('return result;', conflict_idx)
        version_idx = body.index('this.version=result.version')
        self.assertLess(conflict_idx, return_idx,
                         '409 branch must return before falling through to the version assignment')
        self.assertLess(return_idx, version_idx,
                         'the 409 branch must return ahead of "this.version=result.version" so a conflict response never adopts the server version')

    def test_mcp_bridge_post_returns_before_adopting_version_on_409(self):
        m = re.search(r'function syncBridgeState\(\)\{.*?\n  \}', self.html, re.DOTALL)
        self.assertIsNotNone(m, 'syncBridgeState() not found')
        body = m.group(0)
        conflict_idx = body.index('status===409')
        return_idx = body.index('return;', conflict_idx)
        version_idx = body.index('API.version=d.version')
        self.assertLess(conflict_idx, return_idx,
                         '409 branch must return before falling through to the version assignment')
        self.assertLess(return_idx, version_idx,
                         'the 409 branch must return ahead of "API.version=d.version" so the fire-and-forget MCP sync never adopts the server version on conflict')

    def test_api_load_clears_conflicted_flag(self):
        m = re.search(r'async load\(\)\{.*?\n    \},', self.html, re.DOTALL)
        self.assertIsNotNone(m, 'API.load() not found')
        self.assertIn('this.conflicted=false', m.group(0),
                       'every fresh API.load() (initial load, tenant switch, __arominReload) must clear a stale conflicted flag')


def request(token=None, if_match=None):
    headers = []
    if token:
        headers.append((b'authorization', ('Bearer ' + token).encode()))
    if if_match is not None:
        headers.append((b'if-match', str(if_match).encode()))
    return Request({'type': 'http', 'headers': headers, 'path': '/api/state', 'method': 'GET'})


class StateConcurrency(unittest.TestCase):
    def setUp(self):
        self.full = {'tenant': 'team', 'users': {
            'manager': {'pass_hash': server._hash_password('synthetic-password'), 'role': 'manager'},
        }, 'people': [], 'tenantInfo': {'name': 'Synthetic'}}
        self.version = 0
        self.db = MagicMock()
        self.cur = self.db.cursor.return_value.__enter__.return_value
        self.cur.execute.side_effect = self.execute
        self.cur.fetchone.side_effect = lambda: {'payload': json.dumps(self.full), 'version': self.version}
        patches = [patch.dict(os.environ, {'AROMIN_SESSION_SECRET': 'synthetic-session-secret-at-least-32'}),
                   patch.object(server, 'db_conn', return_value=self.db),
                   patch.object(server, 'ensure_tenant_table'),
                   patch.object(server, 'q', side_effect=self.query)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        result = server.session_login({'tenant': 'team', 'username': 'manager', 'password': 'synthetic-password'})
        self.token = result['token']

    def execute(self, sql, args=()):
        if sql.startswith('UPDATE tenant_state SET payload='):
            self.full = json.loads(args[0])
            self.version += 1
        elif sql.startswith('INSERT INTO tenant_state'):
            has_version_param = len(args) == 5   # POST /api/state's INSERT lists (..., payload, version)
            self.full = json.loads(args[-2] if has_version_param else args[-1])
            if has_version_param:
                self.version = args[-1]
            elif 'version=version+1' in sql:
                self.version += 1

    def query(self, sql, args=()):
        if sql.startswith('SELECT payload') and 'tenant_state' in sql:
            return [{'payload': json.dumps(self.full), 'version': self.version}] if args[0] == 'team' else []
        return []

    def test_get_state_reports_version(self):
        result = server.get_state('team')
        self.assertEqual(result['version'], 0)
        self.version = 5
        self.assertEqual(server.get_state('team')['version'], 5)

    def test_get_state_sets_etag_header(self):
        resp = server.Response()
        server.get_state('team', response=resp)
        self.assertEqual(resp.headers['ETag'], '"0"')

    def test_post_with_matching_if_match_saves_and_bumps_version(self):
        state = copy.deepcopy(self.full)
        state['tenantInfo']['name'] = 'changed'
        result = server.post_state(request(self.token, if_match=0), state, 'team')
        self.assertTrue(result['ok'])
        self.assertEqual(result['version'], 1)
        self.assertEqual(self.full['tenantInfo']['name'], 'changed')
        self.assertEqual(self.version, 1)

    def test_post_with_stale_if_match_rejected_without_writing(self):
        state = copy.deepcopy(self.full)
        state['tenantInfo']['name'] = 'attacker'
        response = server.post_state(request(self.token, if_match=99), state, 'team')
        self.assertEqual(response.status_code, 409)
        body = json.loads(response.body)
        self.assertFalse(body['ok'])
        self.assertTrue(body['conflict'])
        self.assertEqual(body['version'], 0)
        self.assertEqual(self.full['tenantInfo']['name'], 'Synthetic')
        self.assertEqual(self.version, 0)

    def test_post_without_if_match_is_accepted_for_legacy_clients(self):
        state = copy.deepcopy(self.full)
        state['tenantInfo']['name'] = 'legacy-client'
        result = server.post_state(request(self.token), state, 'team')
        self.assertTrue(result['ok'])
        self.assertEqual(result['version'], 1)
        self.assertEqual(self.full['tenantInfo']['name'], 'legacy-client')

    def test_locked_conflict_keeps_distinct_flag_from_version_conflict(self):
        self.full['people'] = [{'id': 1, 'inv': [{'id': 'd1', 'no': 'INV-1', 'settle': 'cash', 'finState': 'submitted'}]}]
        state = copy.deepcopy(self.full)
        state['people'][0]['inv'][0]['settle'] = 'hold'
        response = server.post_state(request(self.token, if_match=0), state, 'team')
        self.assertEqual(response.status_code, 409)
        body = json.loads(response.body)
        self.assertTrue(body.get('locked'))
        self.assertNotIn('conflict', body)

    def test_other_writers_bump_version(self):
        server.import_history_delete(request(self.token), {'tenant': 'team', 'entry': {'ts': 1, 'name': 'x', 'type': 'deal', 'sig': 's'}})
        self.assertEqual(self.version, 1)
        server._c1_save('team', dict(self.full))
        self.assertEqual(self.version, 2)


if __name__ == '__main__':
    unittest.main()
