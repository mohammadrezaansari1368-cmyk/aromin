"""WP-02: every API route must be explicitly classified; unauthenticated calls to non-public routes must not succeed."""
import os
import re
import unittest
from unittest.mock import patch

os.environ.setdefault('AROMIN_SESSION_SECRET', 'synthetic-session-key-for-tests-32-bytes')
from fastapi.testclient import TestClient
import server

# Deliberately public (no session): health/ping, login flows, public widget, media, docs.
PUBLIC = {
    ('GET', '/api/health'), ('GET', '/api/ai/ping'), ('GET', '/api/app-update/ping'),
    ('GET', '/api/spa-deploy/ping'), ('GET', '/api/release/status'), ('GET', '/api/auth/google/config'),
    ('POST', '/api/auth/google'), ('POST', '/api/otp/request'), ('POST', '/api/otp/verify'),
    ('POST', '/api/auth/session'), ('POST', '/api/login'), ('GET', '/api/state'),
    ('GET', '/api/pub-media/{sha256}.jpg'), ('GET', '/api/widget/public/{site_id}/config'),
    ('POST', '/api/widget/public/{site_id}/chat'),
}
# Protected by a shared secret header/token rather than a user session.
SECRET = {('POST', '/api/app-update'), ('POST', '/api/spa-deploy'), ('POST', '/api/release/chunk'),
          ('POST', '/api/purge-cache'), ('POST', '/api/telegram/webhook'),
          ('POST', '/api/mcp'), ('GET', '/api/mcp'), ('DELETE', '/api/mcp')}


def api_routes():
    for r in server.app.routes:
        methods = getattr(r, 'methods', None) or set()
        if not r.path.startswith('/api/'):
            continue
        for m in sorted(methods - {'HEAD', 'OPTIONS'}):
            yield m, r.path


class RouteInventory(unittest.TestCase):
    def test_public_and_secret_lists_are_real_routes(self):
        routes = set(api_routes())
        self.assertFalse((PUBLIC | SECRET) - routes, 'stale classification entries')

    def test_unauthenticated_session_routes_are_rejected(self):
        client = TestClient(server.app, raise_server_exceptions=False)
        leaks = []
        with patch.object(server, '_kb_directory', return_value=({}, [])), \
             patch.object(server, '_tenant_full', return_value={'users': {}}):
            for m, path in api_routes():
                if (m, path) in PUBLIC or (m, path) in SECRET:
                    continue
                url = re.sub(r'\{[^}]+\}', '1', path)
                status = client.request(m, url, params={'tenant': 'team'}, json={'tenant': 'team'}).status_code
                if 200 <= status < 300:
                    leaks.append(f'{m} {path} -> {status}')
        self.assertEqual(leaks, [], 'unauthenticated access succeeded')

    def test_ai_proxy_requires_session(self):
        client = TestClient(server.app, raise_server_exceptions=False)
        with patch.object(server, 'ai_chat', side_effect=AssertionError('model must not be called')):
            r = client.post('/api/ai', json={'mode': 'copilot', 'tenant': 'team', 'question': 'x'})
        self.assertEqual(r.status_code, 401)

    def test_signup_requests_require_manager(self):
        client = TestClient(server.app, raise_server_exceptions=False)
        with patch.object(server, 'q', side_effect=AssertionError('db must not be touched')), \
             patch.object(server, '_ensure_signup_table', side_effect=AssertionError('db must not be touched')):
            self.assertEqual(client.get('/api/auth/signup-requests?tenant=team').status_code, 401)
            self.assertEqual(client.post('/api/auth/signup-requests/1?tenant=team', json={'status': 'approved'}).status_code, 401)
        with patch.object(server, 'kb_identity', return_value={'user': 's', 'role': 'sales', 'tenant': 'team'}), \
             patch.object(server, 'q', side_effect=AssertionError('db must not be touched')):
            self.assertEqual(client.get('/api/auth/signup-requests?tenant=team').status_code, 403)


if __name__ == '__main__':
    unittest.main()
