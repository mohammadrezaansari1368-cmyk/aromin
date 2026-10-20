"""Synthetic session and management boundary tests; no database/network required."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import bcrypt
from starlette.requests import Request
import server
import aromin_sessions as sessions


def request(token=None, user=None, password=None):
    headers = []
    if token:
        headers.append((b'authorization', ('Bearer ' + token).encode()))
    if user:
        import urllib.parse
        headers.extend([(b'x-aromin-user', urllib.parse.quote(user).encode()),
                        (b'x-aromin-pass', urllib.parse.quote(password).encode())])
    return Request({'type': 'http', 'headers': headers})


class Sessions(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'AROMIN_SESSION_SECRET': 'synthetic-session-key-for-tests-32-bytes'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.directory = patch.object(server, '_kb_directory', return_value=(
            {'مدیر': {'pass': 'رمز آزمایشی', 'role': 'manager'},
             'sales': {'pass': 'synthetic-password', 'role': 'sales'}}, []))
        self.directory.start()
        self.addCleanup(self.directory.stop)
        self.full = patch.object(server, '_tenant_full', return_value={'users': {}})
        self.full.start()
        self.addCleanup(self.full.stop)

        migration = patch.object(server, '_store_password', side_effect=lambda tenant, user, password, rec, required=False: dict(rec, pass_hash=server._hash_password(password), must_change_password=required))
        migration.start()
        self.addCleanup(migration.stop)

    def token(self, user='مدیر', tenant='team'):
        return sessions.issue(user, 'manager', tenant)

    def test_plaintext_login_success_failure_and_missing_tenant(self):
        result = server.session_login({'tenant': 'team', 'username': 'مدیر', 'password': 'رمز آزمایشی'})
        self.assertTrue(result['ok'])
        self.assertEqual(sessions.verify(result['token'], 'team')['user'], 'مدیر')
        self.assertNotIn('pass', result['session'])
        for user, password in [('مدیر', 'wrong'), ('unknown', 'wrong'), ('مدیر', '')]:
            response = server.session_login({'tenant': 'team', 'username': user, 'password': password})
            self.assertEqual(response.status_code, 401)
        with patch.object(server, '_tenant_full', return_value=None):
            self.assertEqual(server.session_login({'tenant': 'missing', 'username': 'مدیر', 'password': 'رمز آزمایشی'}).status_code, 401)

    def test_bcrypt_tenant_and_db_login(self):
        hashed = bcrypt.hashpw(b'synthetic-password', bcrypt.gensalt(rounds=4)).decode()
        with patch.object(server, '_kb_directory', return_value=({'test': {'pass': hashed, 'role': 'sales'}}, [])):
            self.assertTrue(server.session_login({'tenant': 'team', 'username': 'test', 'password': 'synthetic-password'})['ok'])
            self.assertEqual(server.session_login({'tenant': 'team', 'username': 'test', 'password': 'wrong'}).status_code, 401)
        with patch.object(server, 'q', return_value=[{'pass_hash': hashed, 'role': 'admin'}]):
            result = server.session_login({'username': 'root', 'password': 'synthetic-password'})
            self.assertTrue(result['ok'])
            self.assertEqual(sessions.verify(result['token'], '')['role'], 'admin')
            self.assertIsNone(sessions.verify(result['token'], 'team'))

    def test_expiry_tamper_and_tenant_binding(self):
        with patch.object(sessions.time, 'time', return_value=1000):
            token = self.token()
            self.assertIsNotNone(sessions.verify(token, 'team'))
        with patch.object(sessions.time, 'time', return_value=4600):
            self.assertIsNone(sessions.verify(token, 'team'))
        for invalid in ['malformed', self.token() + 'x', 'é.é']:
            self.assertIsNone(sessions.verify(invalid, 'team'))
        self.assertIsNone(sessions.verify(self.token(), 'other'))

    def test_bearer_and_unicode_legacy_identity(self):
        self.assertEqual(server.kb_identity(request(self.token()), 'team')['user'], 'مدیر')
        self.assertEqual(server.kb_identity(request(user='مدیر', password='رمز آزمایشی'), 'team')['role'], 'manager')
        self.assertIsNone(server.kb_identity(request('invalid', 'مدیر', 'رمز آزمایشی'), 'team'))
        self.assertIsNone(server.kb_identity(request(self.token()), 'other'))

    def test_live_role_removal_and_inactive_person(self):
        token = self.token()
        with patch.object(server, '_kb_directory', return_value=({'مدیر': {'role': 'sales', 'pass': 'synthetic-password'}}, [])):
            self.assertEqual(server.kb_identity(request(token), 'team')['role'], 'sales')
        for users, people in [({}, []), ({'مدیر': {'person': 'Test'}}, [{'name': 'Test', 'inactive': True}])]:
            with patch.object(server, '_kb_directory', return_value=(users, people)):
                self.assertIsNone(server.kb_identity(request(token), 'team'))

    def test_management_routes_reject_anonymous_before_db(self):
        with patch.object(server, 'q') as query, patch.object(server, 'db_conn') as db:
            for call in [lambda: server.users_upsert(request(), {}),
                         lambda: server.tenants_create(request(), {}),
                         lambda: server.tenants_delete(request(), 'other'),
                         lambda: server.backup_create(request(), {'tenant': 'team'}),
                         lambda: server.backups_list(request(), 'team'),
                         lambda: server.backup_get(request(), 1, 'team')]:
                response = call()
                self.assertEqual(response.status_code, 401)
                self.assertFalse(json.loads(response.body)['ok'])
            query.assert_not_called()
            db.assert_not_called()

    def test_management_roles_and_global_scope(self):
        sales = request(self.token('sales'))
        for call in [lambda: server.backup_create(sales, {'tenant': 'team'}),
                     lambda: server.backups_list(sales, 'team'),
                     lambda: server.backup_get(sales, 1, 'team')]:
            self.assertEqual(call().status_code, 403)
        self.assertEqual(server.tenants_create(request(self.token()), {}).status_code, 401)
        with patch.object(server, 'q', return_value=[{'role': 'sales', 'pass_hash': 'synthetic-password'}]):
            global_sales = request(sessions.issue('db-sales', 'sales', ''))
            self.assertEqual(server.users_upsert(global_sales, {}).status_code, 403)
            self.assertEqual(server.tenants_create(global_sales, {}).status_code, 403)
            self.assertEqual(server.tenants_delete(global_sales, 'other').status_code, 403)

        with patch.object(server, 'q', return_value=[{'role': 'admin', 'pass_hash': 'synthetic-password'}]):
            self.assertIsNone(server._management_guard(request(sessions.issue('db-admin', 'admin', ''))))

    def test_authorized_backup_is_scoped_to_tenant(self):
        with patch.object(server, 'ensure_backup_table'), patch.object(server, 'q', return_value=[{'payload': '{}'}]) as query:
            self.assertTrue(server.backup_get(request(self.token()), 42, 'team')['ok'])
            self.assertEqual(query.call_args.args[1], (42, 'team'))
            self.assertIn('AND tenant=%s', query.call_args.args[0])
        with patch.object(server, 'ensure_backup_table'), patch.object(server, 'q', return_value=[]):
            self.assertTrue(server.backups_list(request(self.token()), 'team')['ok'])
            self.assertTrue(server.backup_create(request(self.token()), {'tenant': 'team', 'payload': {'synthetic': True}})['ok'])

    def test_private_key_persists_and_rejects_unsafe_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'secret.key'
            with patch.dict(os.environ, {'AROMIN_SESSION_SECRET': '', 'AROMIN_SESSION_SECRET_FILE': str(path)}):
                first = sessions.signing_key()
                self.assertTrue(first == sessions.signing_key())
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                path.chmod(0o644)
                with self.assertRaises(RuntimeError):
                    sessions.signing_key()
