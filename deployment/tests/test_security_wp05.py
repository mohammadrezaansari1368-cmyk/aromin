"""WP-05 security boundaries; synthetic inputs only, no external services."""
import asyncio
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deployment'))
import server
import aromin_security as security
from starlette.requests import Request


class SecurityHardening(unittest.TestCase):
    def test_error_response_and_logs_exclude_sensitive_values(self):
        secret = 'synthetic-secret-value'
        request = Request({'type': 'http', 'headers': [
            (name.encode(), secret.encode()) for name in
            ('authorization', 'cookie', 'x-update-token', 'x-telegram-init-data')],
            'path': '/' + secret, 'query_string': secret.encode()})
        try:
            raise RuntimeError('password token initData cookie Authorization ' + secret)
        except RuntimeError as exc:
            with self.assertLogs('aromin.security') as logs:
                response = asyncio.run(server.any_error(request, exc))
        body = json.loads(response.body)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn(secret, response.body.decode())
        self.assertNotIn(secret, '\n'.join(logs.output))
        self.assertIn('test_error_response_and_logs_exclude_sensitive_values', logs.output[0])
        self.assertIn("'authorization': True", logs.output[0])
        self.assertNotIn('RuntimeError', body['error'])
        with self.assertLogs('aromin.security'):
            other = security.public_error(ValueError(secret))
        self.assertNotEqual(body['error'], other)
        self.assertRegex(body['error'], r'[A-Za-z0-9_-]{22}$')

    def test_caught_backend_errors_are_generic(self):
        with patch.object(server, '_s3', side_effect=RuntimeError('synthetic-secret')):
            with self.assertLogs('aromin.security'):
                response = server._kb_fail(RuntimeError('synthetic-secret'))
        self.assertNotIn('synthetic-secret', response.body.decode())
        self.assertIn('شناسه خطا', response.body.decode())

    def test_tenant_creation_uses_crypto_random_id_and_keeps_old_lookup(self):
        with patch.object(server, 'ensure_tenant_table'), patch.object(server, 'q') as query:
            with patch.object(server.secrets, 'token_urlsafe', return_value='random_tenant_id') as random_id:
                result = server.tenants_create({'name': 'Synthetic'})
            random_id.assert_called_once_with(24)
            self.assertEqual(result['tenant']['id'], 'random_tenant_id')
            self.assertEqual(query.call_args.args[1][0], 'random_tenant_id')
            query.return_value = [{'payload': '{}'}]
            server.get_state('b-old-id')
            self.assertEqual(query.call_args.args[1], ('b-old-id',))
        ids = {server.secrets.token_urlsafe(24) for _ in range(100)}
        self.assertEqual(len(ids), 100)
        self.assertTrue(all(len(x) <= 64 for x in ids))

    def test_shared_secret_constant_time_and_unicode_safe(self):
        with patch.object(security.hmac, 'compare_digest', wraps=security.hmac.compare_digest) as compare:
            self.assertTrue(security.secret_matches('توکن', 'توکن'))
            self.assertFalse(security.secret_matches('wrong', 'توکن'))
            self.assertFalse(security.secret_matches('', 'توکن'))
            self.assertEqual(compare.call_count, 3)
            self.assertTrue(all(isinstance(x, bytes) for x in compare.call_args.args))
        source = Path(server.__file__).read_text()
        self.assertEqual(source.count('not secret_matches('), 4)
        self.assertNotIn('!= UPDATE_TOKEN', source)


if __name__ == '__main__':
    unittest.main()
