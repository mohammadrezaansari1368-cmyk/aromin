"""WP-01 synthetic HTTP boundaries and transactional password/state regressions."""
import copy
import json
import os
import unittest
from unittest.mock import MagicMock, patch

from starlette.requests import Request
from fastapi.testclient import TestClient
import server
import aromin_sessions as sessions


def request(token=None, tenant=None, legacy=False):
    headers = []
    if token:
        headers.append((b'authorization', ('Bearer ' + token).encode()))
    if tenant:
        headers.append((b'x-aromin-tenant', tenant.encode()))
    if legacy:
        headers.extend([(b'x-aromin-user', b'manager'), (b'x-aromin-pass', b'synthetic-password')])
    return Request({'type': 'http', 'headers': headers, 'path': '/api/state', 'method': 'GET'})


class Completion(unittest.TestCase):
    def setUp(self):
        self.full = {'tenant': 'team', 'users': {
            'manager': {'pass': 'synthetic-password', 'role': 'manager'},
            'sales': {'pass': 'synthetic-password', 'role': 'sales'},
            'default': {'pass': '123', 'role': 'sales'},
            'unset': {'role': 'sales'},
        }, 'people': [], 'tenantInfo': {'name': 'Synthetic'}}
        self.version = 0
        self.db = MagicMock()
        self.cur = self.db.cursor.return_value.__enter__.return_value
        self.cur.execute.side_effect = self.execute
        self.cur.fetchone.side_effect = lambda: {'payload': json.dumps(self.full), 'version': self.version}
        patches = [patch.dict(os.environ, {'AROMIN_SESSION_SECRET': 'synthetic-session-secret-at-least-32'}),
                   patch.object(server, 'db_conn', return_value=self.db),
                   patch.object(server, 'ensure_tenant_table'),
                   patch.object(server, '_tenant_full', side_effect=lambda tenant: copy.deepcopy(self.full) if tenant == 'team' else None),
                   patch.object(server, 'q', side_effect=self.query)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(server.app)
        self.addCleanup(self.client.close)
        self.http = self.client.request


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
        if 'SELECT tenant AS id' in sql:
            return [{'id': 'team', 'name': 'Synthetic'}]
        return []

    def login(self, user='manager', password='synthetic-password'):
        return server.session_login({'tenant': 'team', 'username': user, 'password': password})

    def test_successful_login_migrates_plaintext_and_invalidates_old_token_on_change(self):
        result = self.login()
        rec = self.full['users']['manager']
        self.assertNotIn('pass', rec)
        self.assertTrue(rec['pass_hash'].startswith('$2'))
        self.assertTrue(server._password_matches('synthetic-password', rec['pass_hash']))
        self.assertIsNotNone(server.kb_identity(request(result['token']), 'team'))
        changed = server.change_password(request(result['token']), {'tenant': 'team', 'current': 'synthetic-password', 'next': 'replacement-password'})
        self.assertTrue(changed['ok'])
        self.assertIsNone(server.kb_identity(request(result['token']), 'team'))
        self.assertIsNotNone(server.kb_identity(request(changed['token']), 'team'))
        self.assertEqual(self.login(password='synthetic-password').status_code, 401)

    def test_default_and_unset_only_allow_password_rotation(self):
        for user in ('default', 'unset'):
            with self.subTest(user=user):
                result = self.login(user, '123')
                self.assertTrue(result['session']['must_change_password'])
                token = result['token']
                self.assertIsNone(server.kb_identity(request(token), 'team'))
                for path, method in [('/api/state?tenant=team', 'GET'), ('/api/state?tenant=team', 'POST'),
                                     ('/api/tenants', 'GET'), ('/api/backup', 'POST'), ('/api/health', 'GET')]:
                    response = self.http(method, path, headers={'Authorization': 'Bearer ' + token})
                    self.assertEqual(response.status_code, 403)
                    self.assertTrue(response.json()['must_change_password'])
                invalid = self.http('POST', '/api/auth/change-password', headers={'Authorization': 'Bearer ' + token}, json={'tenant': 'team', 'next': '123'})
                self.assertEqual(invalid.status_code, 422)
                changed = self.http('POST', '/api/auth/change-password', headers={'Authorization': 'Bearer ' + token}, json={'tenant': 'team', 'username': 'manager', 'next': 'replacement-password'})
                self.assertEqual(changed.status_code, 200)
                self.assertFalse(changed.json()['session']['must_change_password'])
                self.assertTrue(server._password_matches('replacement-password', self.full['users'][user]['pass_hash']))
                self.assertIsNone(server.kb_identity(request(token), 'team'))

    def test_state_recursively_removes_password_and_hash_fields(self):
        self.full['nested'] = [{'password': 'secret', 'PASS': 'secret', 'pass_hash': 'secret', 'hash': 'secret', 'safe': 1}]
        tenant_result = server.get_state('team')
        self.assertNotIn('secret', json.dumps(tenant_result))
        self.assertEqual(tenant_result['full']['nested'], [{'safe': 1}])
        with patch.object(server, 'q', side_effect=lambda sql, *args: [{'payload': json.dumps(dict(self.full, people=[{'name': 'Synthetic'}]))}] if 'snapshots' in sql else []):
            self.assertNotIn('secret', json.dumps(server.get_state('')))
        response = self.http('GET', '/api/state?tenant=team')
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_state_requires_bearer_and_preserves_credentials_on_sales_roundtrip(self):
        for req in (request(), request('invalid'), request(legacy=True)):
            self.assertEqual(server.post_state(req, copy.deepcopy(self.full), 'team').status_code, 401)
        result = self.login('sales')
        old = copy.deepcopy(self.full['users'])
        redacted = server.get_state('team')['full']
        redacted['forecast'] = {'synthetic': True}
        self.assertTrue(server.post_state(request(result['token']), redacted, 'team')['ok'])
        self.assertEqual(self.full['users'], old)

    def test_nonmanager_cannot_modify_users_password_roles_tenants_or_access(self):
        token = self.login('sales')['token']
        changes = [lambda s: s['users']['sales'].update(role='manager'),
                   lambda s: s['users']['sales'].update(password='replacement-password'),
                   lambda s: s['users'].pop('manager'),
                   lambda s: s.update(tenant='other'),
                   lambda s: s['tenantInfo'].update(name='changed'),
                   lambda s: s.update(access={'sales': ['all']}),
                   lambda s: s.update(people=[{'name': 'sales', 'role': 'manager'}])]
        for change in changes:
            state = server.get_state('team')['full']
            change(state)
            self.assertEqual(server.post_state(request(token), state, 'team').status_code, 403)

    def test_manager_state_password_reset_is_hashed_and_stale_redacted_save_keeps_it(self):
        token = self.login()['token']
        state = server.get_state('team')['full']
        stale = copy.deepcopy(state)
        state['users']['sales']['pass'] = 'replacement-password'
        self.assertTrue(server.post_state(request(token), state, 'team')['ok'])
        hashed = self.full['users']['sales']['pass_hash']
        self.assertTrue(server._password_matches('replacement-password', hashed))
        self.assertNotIn('pass', self.full['users']['sales'])
        self.assertTrue(server.post_state(request(token), stale, 'team')['ok'])
        self.assertEqual(self.full['users']['sales']['pass_hash'], hashed)

    def test_tenant_management_and_backups_require_manager_session(self):
        for user in ('sales', 'manager'):
            token = self.login(user)['token']
            req = request(token, 'team')
            denied = server._management_guard(req)
            self.assertEqual(denied is None, user == 'manager')
            if user == 'sales':
                self.assertEqual(server.tenants_list(req).status_code, 403)
                self.assertEqual(server.tenants_create(req, {'name': 'Synthetic'}).status_code, 403)
                self.assertEqual(server.tenants_delete(req, 'other').status_code, 403)
                self.assertEqual(server.backup_create(req, {'tenant': 'team'}).status_code, 403)
            else:
                self.assertTrue(server.tenants_list(req)['ok'])
        self.assertEqual(server.tenants_list(request()).status_code, 401)
        self.assertIsNotNone(server._management_guard(request(tenant='team', legacy=True)))

    def test_otp_session_consumes_code_and_is_tenant_bound(self):
        self.full['users']['sales']['mobile'] = '09123456789'
        record = {'code': '123456', 'tenant': 'team', 'exp': server.time.time() + 60, 'tries': 0, 'last': 0}
        with patch.dict(server._otp, {'09123456789': record}, clear=True):
            wrong = server.session_login({'tenant': 'other', 'mobile': '09123456789', 'code': '123456'})
            self.assertFalse(wrong['ok'])
            result = server.session_login({'tenant': 'team', 'mobile': '09123456789', 'code': '123456'})
            self.assertEqual(sessions.verify(result['token'], 'team')['user'], 'sales')
            self.assertFalse(server.session_login({'tenant': 'team', 'mobile': '09123456789', 'code': '123456'})['ok'])

    def test_google_session_enforces_inactive_and_default_password(self):
        self.full['people'] = [{'name': 'Default Person', 'role': 'sales', 'inactive': False}]
        self.full['users']['default'].update(email='synthetic@example.test', person='Default Person')
        with patch.object(server, '_google_verify', return_value=({'email': 'synthetic@example.test'}, None)):
            result = server.session_login({'tenant': 'team', 'credential': 'synthetic-google'})
            self.assertTrue(result['session']['must_change_password'])
            self.full['people'][0]['inactive'] = True
            self.assertEqual(server.session_login({'tenant': 'team', 'credential': 'synthetic-google'}).status_code, 401)

    def test_resume_validates_token_and_live_identity(self):
        token = self.login()['token']
        resumed = server.session_login({'tenant': 'team', 'resume': True}, request(token))
        self.assertTrue(resumed['ok'])
        self.assertEqual(server.session_login({'tenant': 'team', 'resume': True}, request('invalid')).status_code, 401)
        self.full['users']['manager']['role'] = 'sales'
        self.assertEqual(server.session_login({'tenant': 'team', 'resume': True}, request(token))['session']['role'], 'sales')
