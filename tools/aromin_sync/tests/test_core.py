import csv
import io
import json
from pathlib import Path
import sys
import uuid
import unittest
import types
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT))
from tools.aromin_sync.core import (parse_table, phone, payload, deals_csv, digest,
                                    State, ContractError, LOG_HEADERS, SUMMARY_HEADERS, DEAL_HEADERS)
from tools.aromin_sync.service import periods, jalali, Service, IRAN
from tools.aromin_sync.windows import crypt
import datetime as dt

FIX = Path(__file__).parent/'fixtures'


def fixture(name):
    return (FIX/(name+'.html')).read_text(encoding='utf-8')


class Parsers(unittest.TestCase):
    def test_calls_attribution(self):
        rows,last = parse_table(fixture('calls'),'calls')
        self.assertEqual(last,3)
        self.assertEqual(len(rows),2)
        expected = ['990000001','1405/08/08',"10:20':30\"",'09120000000','','تماس‌گیرنده','102','25','خانم کارشناس آزمایشی','00:02:10','00:01:50','موفق','پاسخ‌داده‌شده']
        for header,value in zip(LOG_HEADERS,expected):
            with self.subTest(header=header): self.assertEqual(rows[0][header],value)
        self.assertEqual(rows[1]['مبدا تماس-ID'],'30')
        self.assertEqual(rows[1]['مقصد تماس'],'09120000001')

    def test_summary(self):
        rows,last = parse_table(fixture('summary'),'summary')
        self.assertEqual(last,1)
        self.assertEqual(list(rows[0]),list(SUMMARY_HEADERS))
        for k,v in zip(SUMMARY_HEADERS,['کارشناس آزمایشی','102','10','6','2','1','1','00:30:00']):
            self.assertEqual(rows[0][k],v)

    def test_deals(self):
        rows,last = parse_table(fixture('deals'),'deals')
        self.assertEqual(last,1)
        self.assertEqual(list(rows[0]),list(DEAL_HEADERS))
        self.assertEqual(rows[0]['تغییر مرحله'],'12:30:05 1405/08/08')
        self.assertEqual(rows[0]['تاریخ ثبت'],'09:15:00 1405/08/01')
        self.assertEqual(rows[0]['ارزش'],'1000000')
        self.assertEqual(list(csv.DictReader(io.StringIO(deals_csv(rows).decode('utf-8-sig')))),rows)

    def test_contract_errors(self):
        for html,kind in [('', 'calls'),('{"x":1}','summary'),
                          (fixture('calls').replace('990000001','x').replace('990000002','y'),'calls'),
                          (fixture('calls').replace('/users/show/25','/contacts/show/25'),'calls'),
                          (fixture('calls').replace(' ۱۰۲',''),'calls')]:
            with self.subTest(kind=kind,html=html[:30]):
                with self.assertRaises(ContractError): parse_table(html,kind)

    def test_empty(self):
        self.assertEqual(parse_table('<table><tr><td colspan="12">رکوردی یافت نشد</td></tr></table>','calls'),([],1))

    def test_server_compatibility(self):
        sys.path.insert(0,str(ROOT/'deployment'))
        # Only exception types cross this boundary; avoid the optional HTTP stack.
        with patch.dict(sys.modules,aromin_security=types.SimpleNamespace(PublicValidationError=ValueError,PublicPermissionError=PermissionError)):
            import aromin_calls
        rows,_ = parse_table(fixture('calls'),'calls')
        result = aromin_calls.parse_log_payload(payload('team',rows))
        self.assertEqual(result['skipped'],[])
        self.assertEqual(len(result['calls']),2)
        self.assertEqual(result['calls'][0]['d_julio'],'25')
        self.assertEqual(result['calls'][0]['direction'],'in')
        rows,_ = parse_table(fixture('summary'),'summary')
        result = aromin_calls.parse_summary_payload(payload('team',rows,direction='in',period={'month':'1405/08'}))
        self.assertEqual(result['skipped'],[])
        self.assertEqual(result['rows'][0]['talk_sec'],1800)


class Checkpoints(unittest.TestCase):
    def test_ack_only_and_restart(self):
        folder = Path(__file__).parent/('proof-'+uuid.uuid4().hex)
        folder.mkdir()
        try:
            path = Path(folder)/'state.json'
            state = State(path)
            self.assertFalse(state.identical('calls',{'rows':[1]}))
            self.assertFalse(path.exists())
            state.acknowledged('calls',{'rows':[1]},'1405/08/08',3)
            self.assertTrue(State(path).identical('calls',{'rows':[1]}))
            self.assertFalse(State(path).identical('calls',{'rows':[2]}))
            self.assertFalse(State(path).identical('summary',{'rows':[1]}))
            self.assertEqual(state.data['calls']['page'],3)
            self.assertEqual(state.data['calls']['date'],'1405/08/08')
            state.acknowledged('calls',{'rows':[2]},'1405/08/08',3)
            self.assertTrue(State(path).identical('calls',{'rows':[1]}))
            self.assertTrue(State(path).identical('calls',{'rows':[2]}))
        finally:
            for item in folder.iterdir(): item.unlink()
            folder.rmdir()

    def test_payload(self):
        a = payload('team',[{'x':'ی'}])
        self.assertEqual(a['source'],'import-center')
        self.assertEqual(len(a['sha256']),64)
        self.assertEqual(a,payload('team',[{'x':'ی'}]))
        self.assertNotEqual(a['sha256'],payload('other',[{'x':'ی'}])['sha256'])
        self.assertNotEqual(a['sha256'],payload('team',[{'x':'ک'}])['sha256'])
        self.assertEqual(digest({'a':1,'b':2}),digest({'b':2,'a':1}))

    def test_calendar(self):
        now = dt.datetime(2026,10,30,12,tzinfo=IRAN)
        self.assertEqual(jalali(now.date()),'1405/08/08')
        self.assertEqual(periods(now,True),[('1405/08/01','1405/08/30'),('1405/07/01','1405/07/30')])
        self.assertEqual(periods(dt.datetime(2025,3,25,tzinfo=IRAN),True),[('1404/01/01','1404/01/31'),('1403/12/01','1403/12/30')])

    @unittest.skipUnless(sys.platform=='win32','Windows DPAPI only')
    def test_dpapi(self):
        raw=b'synthetic-test-key'
        protected=crypt(raw)
        self.assertNotEqual(protected,raw)
        self.assertEqual(crypt(protected,True),raw)
        with self.assertRaises(OSError): crypt(b'invalid',True)


# Exercise realistic normalization variants as separately reported regression cases.
for i, prefix in enumerate(('0','+98','0098','98','')):
    for j in range(10):
        raw = prefix+'91200000%02d'%j
        expected = '091200000%02d'%j
        def test(self,raw=raw,expected=expected):
            self.assertEqual(phone(raw),expected)
            self.assertEqual(phone(raw.translate(str.maketrans('0123456789','۰۱۲۳۴۵۶۷۸۹'))),expected)
        setattr(Parsers,'test_phone_%d_%d'%(i,j),test)
