import datetime as dt
import json
import time
from pathlib import Path

from .browser import Browser, LoginRequired
from .core import State, ContractError, atomic_json, payload
from .windows import crypt

IRAN = dt.timezone(dt.timedelta(hours=3, minutes=30))


def jalali(date):
    # Reuse the repository's date conversion; never infer deal dates.
    import sys
    folder = str(Path(__file__).resolve().parents[2] / 'deployment')
    if folder not in sys.path:
        sys.path.insert(0, folder)
    from aromin_stage import _jalali
    return '%04d/%02d/%02d' % _jalali(date.year, date.month, date.day)


def periods(now, nightly=False):
    current = jalali(now.date())[:7]
    y, m = map(int, current.split('/'))
    months = [current]
    if nightly:
        months.append('%04d/%02d' % (y-(m==1), 12 if m==1 else m-1))
    # Use the existing calendar implementation (including leap years).
    from aromin_stage import _j2g
    result = []
    for month in months:
        y, m = map(int, month.split('/'))
        following = dt.date(*_j2g(y+(m==12), m%12+1, 1))
        result.append((month+'/01', jalali(following-dt.timedelta(days=1))))
    return result


class Dashboard:
    def __init__(self, folder, config):
        self.key = crypt((folder/'secret.bin').read_bytes(), decrypt=True).decode()
        self.tenant = config['tenant']

    def post(self, endpoint, body):
        import requests
        response = requests.post('https://dashboard.arominco.com'+endpoint,
                                 params={'tenant':self.tenant}, json=body,
                                 headers={'x-api-key':self.key}, timeout=60, allow_redirects=False)
        if response.status_code not in (200,201):
            raise ContractError('داشبورد پاسخ مورد انتظار نداد؛ منبع متوقف شد.')
        try:
            result = response.json()
        except ValueError:
            raise ContractError('پاسخ داشبورد JSON نیست.') from None
        if result.get('ok') is not True:
            raise ContractError('داشبورد انتقال را تأیید نکرد.')
        return result

    def notify(self, text):
        return self.post('/api/sync/notify', {'text':text[:500]})


class Service:
    def __init__(self, folder):
        self.folder = folder
        self.config = json.loads((folder/'config.json').read_text(encoding='utf-8'))
        interval = self.config.get('interval_minutes',5)
        if type(interval) is not int or interval < 1:
            raise ValueError('فاصلهٔ اجرا باید عدد صحیح مثبت باشد.')
        self.state = State(folder/'state.json')
        self.runtime_path = folder/'runtime.json'
        self.runtime = json.loads(self.runtime_path.read_text(encoding='utf-8')) if self.runtime_path.exists() else {}

    def save(self):
        atomic_json(self.runtime_path,self.runtime)

    def once(self, source, dry_run=False, nightly=False):
        if source in ('kpi','snapshot','conversion'):
            raise ContractError('ساختار پاسخ KPI و نگاشت مراحل تأیید نشده؛ گزارش روزانه و تبدیل مسدود است.')
        now = dt.datetime.now(IRAN)
        ranges = periods(now,nightly)
        if source == 'calls' and not nightly:
            ranges = [(jalali(now.date()-dt.timedelta(days=1)),jalali(now.date()))]
        api = None if dry_run else Dashboard(self.folder,self.config)
        with Browser(self.folder) as browser:
            for start, end in ranges:
                for direction in (('in','out') if source == 'summary' else (None,)):
                    rows, last = browser.rows(source,start,end,direction)
                    print('منبع: %s؛ تعداد: %d؛ صفحه: %d' % (source,len(rows),last))
                    if dry_run or not rows:
                        continue
                    extra = dict(direction=direction,period={'from':start,'to':end}) if source == 'summary' else {}
                    body = payload(self.config['tenant'],rows,**extra)
                    key = ':'.join((source,start,end,direction or ''))
                    if self.state.identical(key,body):
                        continue
                    if source == 'deals':
                        if not browser.import_deals(rows,api.notify):
                            continue
                    else:
                        reply = api.post('/api/performance/calls/'+('log' if source=='calls' else 'summary'),body)
                        batch = reply.get('batch',{})
                        if batch.get('conflicts') or batch.get('skipped'):
                            raise ContractError('داشبورد برخی ردیف‌ها را نپذیرفت؛ نشانگر جلو نرفت.')
                    self.state.acknowledged(key,body,end,last)

    def tick(self, now=None):
        now = now or dt.datetime.now(IRAN)
        clock = now.timestamp()
        day = now.date().isoformat()
        for source, interval in (('calls',self.config.get('interval_minutes',5)*60),('summary',3600),('deals',3600)):
            state = self.runtime.setdefault(source,{})
            night = now.hour >= 2 and state.get('night') != day
            if state.get('stopped') or clock < state.get('retry_at',0):
                continue
            if not night and clock-state.get('last',0) < interval:
                continue
            try:
                self.once(source,nightly=night)
                state.update(last=clock, errors=0,retry_at=0)
                if night:
                    state['night'] = day
            except LoginRequired:
                if not self.runtime.get('_login_notified'):
                    try:
                        self.runtime['_login_notified'] = Dashboard(self.folder,self.config).notify('نشستِ جولیو تمام شد؛ یک بار وارد شوید').get('sent') is True
                    except Exception:
                        pass
                state['retry_at'] = clock+3600
            except Exception as exc:
                state['errors'] = state.get('errors',0)+1
                state['retry_at'] = clock+min(3600,60*2**(state['errors']-1))
                state['stopped'] = isinstance(exc,ContractError) or state['errors'] >= 5
                state['error'] = 'ساختار منبع نیازمند بررسی است.' if isinstance(exc,ContractError) else 'خواندن منبع ناموفق بود.'
                if state['stopped']:
                    try:
                        Dashboard(self.folder,self.config).notify('آرومین‌سینک: منبع '+source+' متوقف شد؛ بررسی کنید.')
                    except Exception:
                        pass
            self.save()
        # KPI remains visibly blocked until the real response contract is supplied.
        self.runtime['kpi'] = {'stopped':True,'error':'ساختار پاسخ KPI تأیید نشده؛ گزارش و تبدیل ارسال نمی‌شود.'}
        self.save()

    def serve(self):
        while True:
            self.tick()
            time.sleep(30)
