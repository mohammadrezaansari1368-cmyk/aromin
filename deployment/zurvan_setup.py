"""Tenant-bound proposal state machine. The caller persists state and audit atomically.
Adapters must compare-and-apply atomically and support proposal idempotency keys.
No model or chat text can confirm a proposal.
"""
from copy import deepcopy
from datetime import datetime, timezone
from typing import Protocol
from uuid import uuid4

SETTINGS = {'businessType','headcount','shiftHours','shiftTypes','missions','missionNotifications','leavePolicy','workplace','geofence'}
INTERVIEW = [('businessType','چه محصول یا خدمتی می‌فروشید؟'), ('headcount','چند نفر در مجموعه کار می‌کنند؟'),
             ('shiftHours','ساعت و روزهای کاری چیست؟'),('shiftTypes','شیفت ثابت، چرخشی یا شبانه دارید؟'),
             ('missions','مأموریت دارید؟'),('missionNotifications','اعلان مأموریت برای همهٔ همکاران ارسال شود؟ (بله/خیر)'),('leavePolicy','سیاست مرخصی و تأیید آن چیست؟'),
             ('workplace','چند محل کار دارید؟'),('geofence','محدودهٔ مجاز ثبت حضور هر محل چیست؟')]

class SettingsAdapter(Protocol):
    def read(self, tenant): ...
    def apply(self, tenant, changes, proposal_id): ...

class UnavailableAdapter:
    def read(self, tenant):
        return {}  # Unknown current values are null in the review; never guessed.
    def apply(self, tenant, changes, proposal_id):
        raise NotImplementedError('اتصال امن زروان هنوز پیکربندی نشده است؛ چیزی اعمال نشد.')

class FakeAdapter:
    """Tests only; never wired to production."""
    def __init__(self, settings): self.settings = deepcopy(settings)
    def read(self, tenant): return deepcopy(self.settings[tenant])
    def apply(self, tenant, changes, proposal_id):
        current = self.read(tenant)
        if any(current.get(c['setting']) != c['current'] for c in changes):
            raise ValueError('تنظیمات تغییر کرده است؛ پیشنهاد تازه بسازید.')
        self.settings[tenant].update({c['setting']: deepcopy(c['proposed']) for c in changes})

class SetupService:
    def __init__(self, state, adapter): self.state, self.adapter = state, adapter
    def audit(self, p, event, who):
        self.state['audit'].append({'event':event,'proposalId':p['id'],'tenant':p['tenant'],'who':who,
            'when':datetime.now(timezone.utc).isoformat(),
            'before':{c['setting']:deepcopy(c['current']) for c in p['changes']},
            'after':{c['setting']:deepcopy(c['proposed']) for c in p['changes']}})
    def get(self, tenant, pid):
        p = self.state['proposals'].get(pid)
        if not p or p['tenant'] != tenant: raise PermissionError('پیشنهاد در دسترس نیست.')
        return p
    def propose(self, tenant, who, changes):
        if not isinstance(changes,list) or not 1 <= len(changes) <= len(SETTINGS): raise ValueError('پیشنهاد نامعتبر است.')
        current = self.adapter.read(tenant)
        diff=[]
        for c in changes:
            if not isinstance(c,dict) or c.get('setting') not in SETTINGS or 'proposed' not in c or not str(c.get('why') or '').strip():
                raise ValueError('تنظیم یا دلیل نامعتبر است.')
            if c['setting'] in [d['setting'] for d in diff]: raise ValueError('تنظیم تکراری است.')
            diff.append({'setting':c['setting'],'current':deepcopy(current.get(c['setting'])),'proposed':deepcopy(c['proposed']),'why':str(c['why'])[:500]})
        p={'id':uuid4().hex,'tenant':tenant,'status':'proposed','changes':diff}
        if hasattr(self.adapter, 'propose'):
            p['remoteId'] = self.adapter.propose(tenant, deepcopy(diff))
        self.state['proposals'][p['id']]=p
        self.audit(p,'proposal',who)
        return deepcopy(p)
    def confirm(self, tenant, who, pid, ui_confirm):
        p=self.get(tenant,pid)
        if ui_confirm is not True: raise PermissionError('تأیید صریح دکمه لازم است.')
        if p['status']!='proposed': raise ValueError('پیشنهاد قابل تأیید نیست.')
        p.update(status='confirmed',confirmedBy=who)
        self.audit(p,'confirm',who)
    def apply(self, tenant, who, pid):
        p=self.get(tenant,pid)
        if p['status']=='proposed': raise PermissionError('ابتدا دکمهٔ تأیید را بزنید.')
        if p['status']!='confirmed': raise ValueError('پیشنهاد قابل اعمال نیست.')
        self.adapter.apply(tenant,deepcopy(p['changes']),p.get('remoteId') or pid)
        p['status']='applied'
        self.audit(p,'apply',who)
    def reject(self, tenant, who, pid):
        p=self.get(tenant,pid)
        if p['status'] not in ('proposed','confirmed'): raise ValueError('پیشنهاد بسته شده است.')
        if hasattr(self.adapter, 'reject'):
            self.adapter.reject(tenant, p.get('remoteId') or pid)
        p['status']='rejected'
        self.audit(p,'reject',who)

class RemoteAdapter:
    """Explicit server-only per-tenant connection map; URLs and tokens never reach browser/LLM.
    Mapping values: {url: HTTPS /api/zurvan-agent, businessId: private business id, token: bridge token}.
    No redirects: a redirect must never forward a bridge credential to another host.
    """
    def __init__(self, connections): self.connections = connections
    def request(self, tenant, action, **data):
        import json
        import urllib.request
        from urllib.parse import urlsplit
        c = self.connections.get(tenant)
        if not c: raise NotImplementedError('اتصال این کسب‌وکار پیکربندی نشده است.')
        u = urlsplit(c['url'])
        if u.scheme != 'https' or u.username or u.password or u.query or u.fragment or u.path != '/api/zurvan-agent':
            raise ValueError('نشانی اتصال امن معتبر نیست.')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs): return None
        req=urllib.request.Request(c['url'], data=json.dumps({'businessId':c['businessId'],'action':action,**data}).encode(),
            headers={'Content-Type':'application/json','Authorization':'Bearer '+c['token']},method='POST')
        try:
            with urllib.request.build_opener(NoRedirect).open(req,timeout=15) as response:
                result=json.load(response)
        except Exception:
            raise ValueError('زروان درخواست را نپذیرفت؛ اتصال، مقدار فعلی و تأیید مالک را بررسی کنید.') from None
        if not result.get('ok'): raise ValueError('زروان درخواست را نپذیرفت.')
        return result
    def read(self, tenant): return self.request(tenant,'read')['settings']
    def propose(self, tenant, changes): return self.request(tenant,'propose',changes=changes)['id']
    def apply(self, tenant, changes, proposal_id):
        # The private app independently checks its own owner's UI confirmation.
        status = self.request(tenant,'status',id=proposal_id)
        if status.get('status') == 'applied':
            return status  # Recovery after a local persistence failure; never applies twice.
        return self.request(tenant,'apply',id=proposal_id)
    def reject(self, tenant, proposal_id):
        return self.request(tenant,'reject',id=proposal_id)
