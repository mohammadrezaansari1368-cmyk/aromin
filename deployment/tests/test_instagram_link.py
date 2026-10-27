import json
import os
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

class InstagramLink(unittest.TestCase):
    def test_key_errors(self):
        for prefix in ['ck_', 'ak_']:
            for code in [401, 403, 500]:
                with self.subTest(prefix=prefix, code=code), patch.object(server.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('https://fake', code, 'private', {}, None)):
                    with self.assertRaises(RuntimeError) as caught:
                        server._composio_req('GET', '/fake', key=prefix+'synthetic')
                    message = str(caught.exception)
                    self.assertNotIn('synthetic', message)
                    self.assertIn('Consumer' if prefix == 'ck_' and code != 500 else ('کلید' if code == 401 else 'دسترسی' if code == 403 else 'Composio 500'), message)
    def test_discovery_user_filter(self):
        with patch.dict(os.environ, COMPOSIO_IG_USER_ID='user a'), patch.object(server, '_composio_req', return_value={'items': []}) as req:
            server.ig_discover()
            self.assertIn('user_ids=user+a', req.call_args.args[1])
    def link(self, env, response):
        with patch.dict(os.environ, env), patch.object(server, '_kb_guard', return_value=({'user':'boss'}, None)), patch.object(server, '_reauth_ok', return_value=True), patch.object(server, '_composio_req', return_value=response) as req:
            result = server.ig_link(None, {'password':'fake'}, 'team')
            return result, req
    def test_link(self):
        result, req = self.link({'COMPOSIO_IG_AUTH_CONFIG':'ac_fake', 'COMPOSIO_IG_USER_ID':'test-user'}, {'redirect_url':'https://example.com/oauth'})
        self.assertEqual(result, {'ok':True, 'url':'https://example.com/oauth'})
        self.assertEqual(req.call_args.args[:2], ('POST', '/connected_accounts/link'))
        self.assertEqual(req.call_args.args[2], {'toolkit_slug':'INSTAGRAM', 'auth_config_id':'ac_fake', 'user_id':'test-user'})
    def test_missing_config_and_bad_url(self):
        result, req = self.link({'COMPOSIO_IG_AUTH_CONFIG':''}, {})
        self.assertIn('COMPOSIO_IG_AUTH_CONFIG', json.loads(result.body)['error']); req.assert_not_called()
        result, _ = self.link({'COMPOSIO_IG_AUTH_CONFIG':'ac_fake'}, {'redirect_url':'javascript:alert(1)'})
        self.assertFalse(json.loads(result.body)['ok'])
    def test_link_requires_reauth(self):
        with patch.object(server, '_kb_guard', return_value=({}, None)), patch.object(server, '_reauth_ok', return_value=False), patch.object(server, '_composio_req') as req:
            self.assertEqual(server.ig_link(None, {}, 'team').status_code, 403); req.assert_not_called()

    def test_link_wire_request(self):
        with patch.dict(os.environ, COMPOSIO_IG_AUTH_CONFIG='ac_fake', COMPOSIO_IG_USER_ID='', COMPOSIO_USER_ID=''), patch.object(server, '_kb_guard', return_value=({}, None)), patch.object(server, '_reauth_ok', return_value=True), patch.object(server, 'secret_get', return_value='ak_synthetic'), patch.object(server.urllib.request, 'urlopen') as call:
            call.return_value.__enter__.return_value.read.return_value = b'{"redirect_url":"https://example.com/oauth"}'
            self.assertTrue(server.ig_link(None, {'password':'fake'}, 'demo')['ok'])
            request = call.call_args.args[0]
            self.assertEqual(request.get_header('X-api-key'), 'ak_synthetic')
            self.assertEqual(json.loads(request.data)['user_id'], 'aromin-demo')
            self.assertTrue(request.full_url.endswith('/connected_accounts/link'))
    def test_no_active_account_guidance(self):
        with patch.object(server, '_kb_guard', return_value=({}, None)), patch.object(server, '_reauth_ok', return_value=True), patch.object(server, 'ig_discover', return_value=''):
            response = server.ig_connect(None, {'password':'fake'}, 'team')
            message = json.loads(response.body)['error']
            for word in ['Consumer', 'Business/Creator', 'Facebook Page', 'ساخت لینکِ اتصال', 'همان پروژه']:
                self.assertIn(word, message)
