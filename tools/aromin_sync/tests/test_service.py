import datetime as dt
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[3]))
from tools.aromin_sync.service import Service, Dashboard, IRAN
from tools.aromin_sync.browser import LoginRequired, Browser
from tools.aromin_sync.core import ContractError


class Scheduling(unittest.TestCase):
    def setUp(self):
        self.s=Service.__new__(Service)
        self.s.config={'tenant':'team','interval_minutes':5}
        self.s.folder=Path('.')
        self.s.runtime={}
        self.s.once=Mock()
        self.s.save=Mock()
        self.now=dt.datetime(2026,10,30,12,tzinfo=IRAN)

    def test_nightly_then_intervals(self):
        self.s.tick(self.now)
        self.assertEqual(self.s.once.call_count,3)
        self.assertTrue(all(c.kwargs['nightly'] for c in self.s.once.call_args_list))
        self.s.tick(self.now+dt.timedelta(minutes=1))
        self.assertEqual(self.s.once.call_count,3)
        self.s.tick(self.now+dt.timedelta(minutes=5))
        self.assertEqual(self.s.once.call_count,4)
        self.assertEqual(self.s.once.call_args.args,('calls',))
        self.assertFalse(self.s.once.call_args.kwargs['nightly'])
        self.assertTrue(self.s.runtime['kpi']['stopped'])

    @patch('tools.aromin_sync.service.Dashboard')
    def test_login_pauses_hourly_and_notifies_once(self,api):
        api.return_value.notify.return_value={'ok':True,'sent':True}
        self.s.once.side_effect=LoginRequired()
        self.s.tick(self.now)
        self.assertEqual(api.return_value.notify.call_count,1)
        self.assertEqual(self.s.once.call_count,3)
        self.s.tick(self.now+dt.timedelta(minutes=59))
        self.assertEqual(self.s.once.call_count,3)
        self.s.tick(self.now+dt.timedelta(hours=1))
        self.assertEqual(self.s.once.call_count,6)
        self.assertEqual(api.return_value.notify.call_count,1)

    @patch('tools.aromin_sync.service.Dashboard')
    def test_five_errors_stop_and_backoff(self,api):
        self.s.once.side_effect=OSError('contains sensitive content')
        for minutes in (0,1,3,7,15): self.s.tick(self.now+dt.timedelta(minutes=minutes))
        self.assertTrue(self.s.runtime['calls']['stopped'])
        self.assertEqual(self.s.runtime['calls']['errors'],5)
        self.assertEqual(self.s.once.call_count,15)
        self.assertEqual(api.return_value.notify.call_count,3)
        self.s.tick(self.now+dt.timedelta(days=1))
        self.assertEqual(self.s.once.call_count,15)
        self.assertNotIn('sensitive',str(self.s.runtime))

    @patch('tools.aromin_sync.service.Dashboard')
    def test_contract_stops_immediately(self,api):
        self.s.once.side_effect=ContractError('changed')
        self.s.tick(self.now)
        self.assertTrue(self.s.runtime['calls']['stopped'])
        self.assertEqual(self.s.runtime['calls']['errors'],1)

    @patch('tools.aromin_sync.service.Browser')
    @patch('tools.aromin_sync.service.Dashboard')
    def test_dry_run_no_writer_or_checkpoint(self,api,browser):
        service=Service.__new__(Service)
        service.folder=Path('.')
        service.config={'tenant':'team'}
        service.state=Mock()
        browser.return_value.__enter__.return_value.rows.return_value=([{'synthetic':1}],2)
        with patch('builtins.print'):
            service.once('calls',dry_run=True)
        api.assert_not_called()
        service.state.acknowledged.assert_not_called()
        browser.return_value.__enter__.return_value.import_deals.assert_not_called()

    @patch('tools.aromin_sync.service.Browser')
    @patch('tools.aromin_sync.service.Dashboard')
    def test_failed_write_never_advances(self,api,browser):
        service=Service.__new__(Service)
        service.folder=Path('.')
        service.config={'tenant':'team'}
        service.state=Mock()
        service.state.identical.return_value=False
        browser.return_value.__enter__.return_value.rows.return_value=([{'synthetic':1}],1)
        api.return_value.post.side_effect=ContractError('rejected')
        with patch('builtins.print'), self.assertRaises(ContractError): service.once('calls')
        service.state.acknowledged.assert_not_called()

    @patch('tools.aromin_sync.browser.time.sleep')
    def test_browser_five_errors_stop_source(self,sleep):
        browser=Browser(Path('.'))
        browser.page=Mock()
        browser.page.evaluate.return_value={'status':503,'text':''}
        with self.assertRaises(ContractError): browser.rows('calls','1405/08/01','1405/08/02')
        self.assertEqual(browser.page.evaluate.call_count,5)

    @patch('tools.aromin_sync.browser.time.sleep')
    def test_browser_login_never_parses(self,sleep):
        browser=Browser(Path('.'))
        browser.page=Mock()
        browser.page.evaluate.return_value={'login':True}
        with self.assertRaises(LoginRequired): browser.rows('calls','1405/08/01','1405/08/02')
        self.assertEqual(browser.page.evaluate.call_count,1)

    def test_deal_preview_blocks_each_risk(self):
        for field in ('conflicts','invalid','newExperts'):
            with self.subTest(field=field):
                browser=Browser(Path('.'))
                browser.page=Mock(url='https://dashboard.arominco.com')
                counts=dict(conflicts=0,invalid=0,newExperts=0)
                counts[field]=1
                preview=browser.page.get_by_role.return_value
                preview.evaluate.return_value=counts
                notify=Mock()
                self.assertFalse(browser.import_deals([],notify))
                notify.assert_called_once()
                preview.locator.return_value.click.assert_not_called()

    def test_deal_safe_preview_commits(self):
        browser=Browser(Path('.'))
        browser.page=Mock(url='https://dashboard.arominco.com')
        preview=browser.page.get_by_role.return_value
        preview.evaluate.return_value=dict(conflicts=0,invalid=0,newExperts=0)
        preview.locator.return_value.is_enabled.return_value=True
        notify=Mock()
        self.assertTrue(browser.import_deals([],notify))
        preview.locator.return_value.click.assert_called_once()
        notify.assert_not_called()


if __name__=='__main__': unittest.main()
