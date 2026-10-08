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
            with patch.object(server, '_c1_ctx', return_value=('test', ident, full, None)), patch.object(server, '_c1_save') as save, patch.object(server, 'send_otp_sms') as sms, patch.object(server, 'tg_api') as tg, patch.dict(server._c1_codes, {'test': {'code':'123456', 'exp':time.time()+300, 'tries':0, 'deal':'1'}}):
                for handler in (server.c1_reopen, server.c1_reopen_code):
                    response = handler(None, {'id':'1', 'reason':'test reason', 'code':'123456'})
                    self.assertEqual(response.status_code, 403)
                save.assert_not_called()
                sms.assert_not_called()
                tg.assert_not_called()
                self.assertEqual(full, original)

    def _ctx(self, role, d):
        ident = {'user': 'test', 'role': role}
        return [patch.object(server, '_c1_ctx', return_value=('test', ident, {}, None)), patch.object(server, '_c1_index', return_value={'1': [d]}),
                patch.object(server, '_c1_person_name', return_value='manager'), patch.object(server, 'tg_configured', return_value=True)]

    def test_managers_reopen_with_telegram_code_backup_and_audit(self):
        """کدِ ۶رقمی به تلگرامِ ادمین می‌رود؛ فقط با همان کد سند بازگشایی می‌شود (بدونِ پیامک)."""
        for role in server.KB_ADMIN_ROLES:
            server._c1_codes.clear()
            d = {'id': 1, 'no': '7001', 'finState': 'approved', 'finApproval': {'by': 'finance'}, 'finBy': 'accountant'}
            sent = []
            ps = self._ctx(role, d) + [patch.object(server, 'tg_api', side_effect=lambda m, f: sent.append((m, f)) or {'ok': True}),
                                       patch.object(server, 'send_otp_sms') , patch.object(server, '_c1_backup'), patch.object(server, '_c1_save'), patch.object(server, '_c1_audit')]
            with ps[0], ps[1], ps[2], ps[3], ps[4], ps[5] as sms, ps[6] as backup, ps[7] as save, ps[8] as audit:
                r = server.c1_reopen_code(None, {'id': '1', 'reason': 'اصلاح مبلغ'})
                self.assertEqual(r, {'ok': True, 'to': 'تلگرام', 'count': 1})
                sms.assert_not_called()
                self.assertEqual(sent[0][0], 'sendMessage')
                self.assertEqual(sent[0][1]['chat_id'], server.TG_ADMIN_ID)
                code = server._c1_codes['test']['code']
                self.assertIn(code.translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')), sent[0][1]['text'])
                # بدونِ کد یا با کدِ اشتباه: رد و بدونِ تغییر
                self.assertEqual(server.c1_reopen(None, {'id': '1', 'reason': 'correction', 'code': '000000' if code != '000000' else '111111'}).status_code, 403)
                self.assertEqual(d['finState'], 'approved')
                save.assert_not_called()
                r = server.c1_reopen(None, {'id': '1', 'reason': 'correction', 'code': code})
                self.assertEqual(r['via'], 'telegram')
                backup.assert_called_once(); save.assert_called_once(); audit.assert_called_once()
                self.assertNotIn('finApproval', d)
                self.assertEqual(d['finBy'], 'accountant')
                self.assertNotIn('test', server._c1_codes)   # کد یک‌بارمصرف

    def test_reopen_without_code_or_telegram_is_refused(self):
        server._c1_codes.clear()
        d = {'id': 1, 'finState': 'approved'}
        ps = self._ctx('manager', d)
        with ps[0], ps[1], ps[2], patch.object(server, 'tg_configured', return_value=False), patch.object(server, 'tg_api') as tg, patch.object(server, '_c1_save') as save:
            self.assertFalse(server.c1_reopen_code(None, {'id': '1'})['ok'])
            tg.assert_not_called()
            self.assertEqual(server.c1_reopen(None, {'id': '1', 'reason': 'correction'}).status_code, 403)
            save.assert_not_called()

    def test_telegram_failure_stores_no_code(self):
        server._c1_codes.clear()
        d = {'id': 1, 'finState': 'approved'}
        ps = self._ctx('manager', d)
        with ps[0], ps[1], ps[2], ps[3], patch.object(server, 'tg_api', side_effect=server.TgError('transient', 'timeout')):
            r = server.c1_reopen_code(None, {'id': '1'})
            self.assertFalse(r['ok'])
            self.assertNotIn('test', server._c1_codes)

    def test_bulk_reopen_one_code_for_exactly_that_group(self):
        """دکمهٔ کلی: یک کدِ تلگرام برای همان گروهِ اسناد؛ فقط تصویب‌شده‌ها برمی‌گردند؛ یک بک‌آپ، ممیزیِ هر سند."""
        server._c1_codes.clear()
        a = {'id': 1, 'no': '7001', 'finState': 'approved', 'finApproval': {'by': 'm'}, 'finBy': 'acc'}
        b = {'id': 2, 'no': '7002', 'finState': 'closed', 'finClosed': {'by': 'm'}}
        c = {'id': 3, 'no': '7003'}
        ident = {'user': 'test', 'role': 'manager'}
        sent = []
        with patch.object(server, '_c1_ctx', return_value=('test', ident, {}, None)), patch.object(server, '_c1_index', return_value={'1': [a], '2': [b], '3': [c]}), \
                patch.object(server, '_c1_person_name', return_value='manager'), patch.object(server, 'tg_configured', return_value=True), \
                patch.object(server, 'tg_api', side_effect=lambda m, f: sent.append(f) or {'ok': True}), patch.object(server, '_c1_backup') as backup, \
                patch.object(server, '_c1_save') as save, patch.object(server, '_c1_audit') as audit:
            r = server.c1_reopen_code(None, {'ids': [3, 2, 1], 'reason': 'اصلاح دوره'})
            self.assertEqual((r['ok'], r['count']), (True, 2))
            self.assertIn('۲ سندِ مالی', sent[0]['text'])
            code = server._c1_codes['test']['code']
            # کد فقط برای همان مجموعه؛ مجموعهٔ دیگر رد می‌شود
            self.assertEqual(server.c1_reopen(None, {'ids': [1], 'reason': 'اصلاح دوره', 'code': code}).status_code, 403)
            save.assert_not_called()
            r = server.c1_reopen(None, {'ids': [1, 2, 3], 'reason': 'اصلاح دوره', 'code': code})
            self.assertEqual((r['via'], r['reopened']), ('telegram', 2))
            backup.assert_called_once(); save.assert_called_once()
            self.assertEqual(audit.call_count, 2)
            self.assertNotIn('finState', a); self.assertNotIn('finClosed', b); self.assertEqual(a['finBy'], 'acc')
            self.assertEqual(c, {'id': 3, 'no': '7003'})


if __name__ == '__main__':
    unittest.main()
