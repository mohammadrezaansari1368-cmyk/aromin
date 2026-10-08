"""Only existing manager roles may undo document approval, even with a valid OTP."""
import copy
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

class ReopenPermissions(unittest.TestCase):
    def test_non_managers_cannot_reopen_or_request_code(self):
        for role in ('sales', 'finance', 'online', 'support'):
            full = {'people': []}
            original = copy.deepcopy(full)
            ident = {'user': 'test', 'role': role}
            with patch.object(server, '_c1_ctx', return_value=('test', ident, full, None)), patch.object(server, '_c1_save') as save, patch.object(server, 'send_otp_sms') as sms, patch.dict(server._c1_codes, {'test': {'code':'123456', 'exp':time.time()+300, 'tries':0, 'deal':'1'}}):
                for handler in (server.c1_reopen, server.c1_reopen_code):
                    response = handler(None, {'id':'1', 'reason':'test reason', 'code':'123456'})
                    self.assertEqual(response.status_code, 403)
                save.assert_not_called()
                sms.assert_not_called()
                self.assertEqual(full, original)

    def test_managers_reopen_with_reason_backup_and_audit(self):
        for role in server.KB_ADMIN_ROLES:
            d = {'id':1, 'finState':'approved', 'finApproval':{'by':'finance'}, 'finBy':'accountant'}
            ident = {'user':'test', 'role':role}
            with patch.object(server, '_c1_ctx', return_value=('test', ident, {}, None)), patch.object(server, '_c1_index', return_value={'1':[d]}), patch.object(server, '_c1_person_name', return_value='manager'), patch.object(server, '_c1_backup') as backup, patch.object(server, '_c1_save') as save, patch.object(server, '_c1_audit') as audit:
                self.assertEqual(server.c1_reopen(None, {'id':'1', 'reason':'correction'})['via'], 'manager')
                backup.assert_called_once()
                save.assert_called_once()
                audit.assert_called_once()
                self.assertNotIn('finApproval',d)
                self.assertEqual(d['finBy'],'accountant')
