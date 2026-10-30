"""All Joolio reads run in the dedicated authenticated Chromium page."""
import time
from .core import ContractError, parse_table, deals_csv


class LoginRequired(Exception):
    pass


FETCH = r"""async ({path, form, fields, method}) => {
 const token = document.querySelector('meta[name="csrf-token"]')?.content;
 if (!token || location.pathname.includes('login')) return {login:true};
 const node = form ? document.querySelector(form) : null;
 if (form && !node) return {contract:true};
 const params = node ? new URLSearchParams(new FormData(node)) : new URLSearchParams();
 for (const [k,v] of Object.entries(fields)) params.set(k,String(v));
 const headers = {'X-CSRF-TOKEN':token,'X-Requested-With':'XMLHttpRequest'};
 const url = method === 'GET' ? path+'?'+params : path;
 const response = await fetch(url,{method,headers,credentials:'same-origin', ...(method==='POST'?{body:params}:{})});
 const text = await response.text();
 if ([401,419].includes(response.status) || response.url.includes('/login') || /type=["']password["']/.test(text)) return {login:true};
 return {status:response.status,text};
}"""


KEY_SCOPES = ('calls:write', 'joolio:write', 'conversion:write', 'sync:notify')

MINT = r"""async ({tenant, password, name, scopes}) => {
 const raw = localStorage.getItem('aromin-session:' + tenant);
 if (!raw) return {ok:false, error:'ابتدا در داشبورد وارد شوید.'};
 let token = raw; try { const s = JSON.parse(raw); token = s.token || s } catch (e) {}
 const response = await fetch('/api/settings/api-keys', {method:'POST', credentials:'same-origin',
   headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token},
   body: JSON.stringify({tenant, name, scopes, password})});
 const data = await response.json().catch(() => ({}));
 return {ok: response.ok && !!data.ok, key: data.key, error: data.error};
}"""


class Browser:
    def __init__(self, folder, visible=False):
        self.folder, self.visible, self.last = folder, visible, 0

    def __enter__(self):
        from playwright.sync_api import sync_playwright
        self.pw = sync_playwright().start()
        # The Playwright CDN refuses Iran, so the system Edge/Chrome is used (still with its own dedicated profile).
        last = None
        for channel in ('msedge', 'chrome', None):
            try:
                self.context = self.pw.chromium.launch_persistent_context(str(self.folder/'joolio-profile'), headless=not self.visible, **({'channel': channel} if channel else {}))
                break
            except Exception as error:
                last = error
        else:
            raise last
        self.page = self.context.new_page()
        return self

    def __exit__(self, *args):
        self.context.close()
        self.pw.stop()

    def login(self):
        for url in ('https://crm.arominco.com','https://dashboard.arominco.com'):
            self.page.goto(url)
            input('در پنجره وارد شوید؛ «مرا به خاطر بسپار» را بزنید؛ سپس Enter: ')

    def mint_key(self, tenant, password, name):
        """Create this machine's scoped dashboard key with the owner's live session; the key never reaches the screen or logs."""
        self.page.goto('https://dashboard.arominco.com')
        result = self.page.evaluate(MINT, dict(tenant=tenant, password=password, name=name, scopes=list(KEY_SCOPES)))
        if not result.get('ok') or not str(result.get('key') or '').startswith('ark_'):
            raise ValueError(result.get('error') or 'ساختِ کلید ناموفق بود؛ ابتدا در داشبورد وارد شوید.')
        return result['key']

    def rows(self, kind, start, end, direction=None):
        if kind == 'calls':
            landing, path, form, method = '/call-reports/all', '/call-reports/all/filter', '#call-reports-search-form', 'POST'
            extra = dict(search_date_radio='',join_related_records=1)
        elif kind == 'summary':
            # The XHR path itself has no CSRF meta (it answers JSON), so land on the overview page.
            landing, path = '/call-reports/overview', '/call-reports/overview/external_' + ('incoming' if direction == 'in' else 'outgoing')
            form, method = None, 'GET'
            extra = dict(data_type='', sort_export='ext_number_unsigned', order_export='desc', date_type='created_at', search_date_radio=end,
                         time_from='00:00', time_to='23:59', department_id='all', group_id='all', keyword='')
        elif kind == 'deals':
            landing, path, form, method, extra = '/deals', '/deals/filter', '#search-form', 'POST', dict(date_type='last_state')
        else:
            raise ContractError('ساختار پاسخ KPI تأیید نشده است؛ منبع متوقف است.')
        self.page.goto('https://crm.arominco.com'+landing)
        all_rows, page, last, signatures = [], 1, 1, set()
        while page <= last:
            fields = dict(date_from=start,date_to=end,page=page,**extra)
            for attempt in range(5):
                time.sleep(max(0, .3-(time.monotonic()-self.last)))
                self.last = time.monotonic()
                response = self.page.evaluate(FETCH, dict(path=path,form=form,fields=fields,method=method))
                if response.get('login'):
                    raise LoginRequired()
                if response.get('contract'):
                    raise ContractError('فرم جولیو تغییر کرده است.')
                if response['status'] == 200:
                    break
                if response['status'] != 429 and response['status'] < 500:
                    raise ContractError('پاسخ پیش‌بینی‌نشده از جولیو؛ انتقال متوقف شد.')
                if attempt == 4:
                    raise ContractError('پنج خطای متوالی از جولیو؛ منبع متوقف شد.')
                time.sleep(2**attempt)
            rows, last = parse_table(response['text'], kind)
            from .core import digest
            signature = digest(rows)
            if rows and signature in signatures:
                raise ContractError('صفحه‌بندی جولیو تکرار شده است.')
            signatures.add(signature)
            if last > 10000:
                raise ContractError('صفحه‌بندی غیرمنتظره است.')
            all_rows.extend(rows)
            page += 1
        return all_rows, page-1

    def import_deals(self, rows, notify):
        self.page.goto('https://dashboard.arominco.com/?panel=import')
        if 'login' in self.page.url:
            raise LoginRequired()
        self.page.locator('input[type=file]').set_input_files(dict(name='aromin-sync.csv',mimeType='text/csv',buffer=deals_csv(rows)))
        self.page.get_by_role('button',name='ورودِ',exact=False).click(timeout=60000)
        preview = self.page.get_by_role('region',name='پیش‌نمایشِ ایمپورتِ معاملات')
        # section has an accessible region role because it is named.
        preview.wait_for(timeout=60000)
        preview.locator('input[name=dimode][value=append]').check()
        preview.get_by_label('مبالغِ فایل ریال است (÷۱۰)',exact=True).check()
        self.page.locator('section[data-sync-ready="true"]').wait_for(timeout=60000)
        counts = preview.evaluate('(e)=>({conflicts:Number(e.dataset.syncConflicts),invalid:Number(e.dataset.syncInvalid),newExperts:Number(e.dataset.syncNewExperts)})')
        if any(not isinstance(n, (int,float)) or n < 0 for n in counts.values()):
            raise ContractError('شمارنده‌های پیش‌نمایش معتبر نیستند.')
        if any(counts.values()):
            notify('پیش‌نمایش معاملات: تعارض %(conflicts)s، نامعتبر %(invalid)s، کارشناس تازه %(newExperts)s؛ ثبت متوقف شد.' % counts)
            return False
        button = preview.locator('button[data-sync-commit]')
        if not button.is_enabled():
            # An entirely duplicate file has no valid rows to write.
            if preview.locator('[role=alert]').count():
                raise ContractError('ثبت معاملات آماده نیست.')
            return True
        button.click()
        preview.wait_for(state='detached',timeout=60000)
        return True
