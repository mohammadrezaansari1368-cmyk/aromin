"""Tenant-local support interview and pull outbox; no network or model side effects."""
import base64
import datetime
import hashlib
import hmac
import json
import re
import secrets
import time


class SupportError(Exception):
    def __init__(self, code, status=400):
        self.code, self.status = code, status
        super().__init__(code)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def sign(value, key):
    return hmac.new(key.encode(), canonical(value), hashlib.sha256).hexdigest()


def verify_payload(payload, key):
    body = {k: v for k, v in payload.items() if k != 'signature'}
    return hmac.compare_digest(str(payload.get('signature', '')), sign(body, key))


def chunks(state):
    raw = canonical(state).decode('utf-8')
    if len(raw.encode('utf-8')) > 2000000:
        raise SupportError('storage_full', 503)
    parts = [raw[i:i + 200] for i in range(0, len(raw), 200)]
    return {'sup:lock': str(len(parts)), **{'sup:%06d' % i: v for i, v in enumerate(parts)}}


def unchunks(rows):
    if rows.get('sup:lock') in (None, '0'):
        return {}
    try:
        count = int(rows['sup:lock'])
        if not 1 <= count <= 10000:
            raise ValueError()
        result = json.loads(''.join(rows['sup:%06d' % i] for i in range(count)))
        if not isinstance(result, dict):
            raise ValueError()
        return result
    except (ValueError, KeyError, TypeError):
        raise SupportError('storage_corrupt', 503) from None


def utc(stamp):
    return datetime.datetime.fromtimestamp(stamp, datetime.timezone.utc).isoformat().replace('+00:00', 'Z')


def clean(value, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise SupportError('invalid_input')
    return ''.join(c for c in value.strip() if c >= ' ' or c == '\n')


SLOTS = [('name', 'نام شما چیست؟', 120), ('contact', 'شماره تماس یا ایمیل شما چیست؟', 160),
         ('business', 'نام کسب‌وکار و شناسهٔ مرتبط با درخواست را بنویسید؛ رمز یا کد ورود نفرستید.', 200),
         ('requestType', 'نوع درخواست چیست؟ (راهنمایی، خطا، پیگیری، سایر)', 80),
         ('details', 'جزئیات درخواست را بنویسید؛ رمز، توکن و اطلاعات مالی نفرستید.', 1700),
         ('urgency', 'فوریت درخواست چیست؟ (عادی، فوری)', 10),
         ('consent', 'آیا با ارسال نام، تماس و شرح درخواست به پشتیبانی برای اجرای درخواست موافقید؟ بله / خیر', 10)]


class Support:
    def __init__(self, state, tenant, key, clock=time.time):
        self.state, self.tenant, self.key, self.clock = state, tenant, key, clock
        if len(key) < 32:
            raise SupportError('not_configured', 503)
        if not isinstance(tenant, str) or not 1 <= len(tenant) <= 64:
            raise SupportError('invalid_tenant')
        for name, default in [('sessions', {}), ('requests', {}), ('audit', [])]:
            state.setdefault(name, default)
        now = self.clock()
        state['sessions'] = {k: v for k,v in state['sessions'].items() if now - v['at'] < 86400}
        state['requests'] = {k: v for k,v in state['requests'].items() if v['status'] not in ('done','failed') or now - v['updated'] < 30 * 86400}
        state['audit'] = [v for v in state['audit'] if now - v['at'] < 30 * 86400][-2000:]

    def audit(self, event, rid='', actor='customer'):
        # Never store text, contact, credentials or link/session/lease capabilities here.
        self.state['audit'] = self.state['audit'][-1999:]
        self.state['audit'].append({'event': event, 'requestId': rid, 'at': self.clock(), 'actor': actor})

    def admit(self):
        # Reserve 750KB for leases, all terminal notes/timestamps and bounded audit.
        # Admission may fail; already accepted work and link revocation may still progress.
        if len(canonical(self.state)) > 1250000:
            raise SupportError('storage_full', 503)

    def link(self, action):
        if action not in ('generate', 'rotate', 'revoke'):
            raise SupportError('invalid_action')
        if action == 'generate' and self.state.get('linkHash'):
            raise SupportError('already_enabled', 409)
        self.state['linkHash'] = ''
        self.state['sessions'] = {}
        self.audit(action, actor='manager')
        if action == 'revoke':
            return {'ok': True, 'enabled': False}
        locator = base64.urlsafe_b64encode(self.tenant.encode()).decode().rstrip('=')
        body = locator + '.' + secrets.token_urlsafe(32)
        token = body + '.' + hmac.new(self.key.encode(), body.encode(), hashlib.sha256).hexdigest()
        self.state['linkHash'] = digest(token)
        return {'ok': True, 'enabled': True, 'token': token}

    @staticmethod
    def tenant_from(token, key):
        try:
            if not isinstance(token, str) or len(token) > 300:
                raise ValueError()
            locator, random, signature = token.split('.')
            if not re.fullmatch(r'[A-Za-z0-9_-]{43}', random):
                raise ValueError()
            expected = hmac.new(key.encode(), (locator + '.' + random).encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                raise ValueError()
            tenant = base64.urlsafe_b64decode(locator + '=' * (-len(locator) % 4)).decode()
            if not 1 <= len(tenant) <= 64:
                raise ValueError()
            return tenant
        except (ValueError, UnicodeError):
            raise SupportError('link_unavailable', 404) from None

    def check(self, token):
        if self.tenant_from(token, self.key) != self.tenant or not self.state.get('linkHash') or not hmac.compare_digest(digest(token), self.state['linkHash']):
            raise SupportError('link_unavailable', 404)

    def start(self, token, session_id=None):
        self.check(token)
        if session_id:
            session = self.session(token, session_id)
            return self.response(session_id, session)
        if len(self.state['sessions']) >= 100:
            raise SupportError('session_limit', 429)
        sid = secrets.token_urlsafe(24)
        session = {'at': self.clock(), 'values': {}, 'step': 0}
        self.state['sessions'][sid] = session
        self.admit()
        return self.response(sid, session)

    def session(self, token, sid):
        self.check(token)
        if not isinstance(sid, str) or sid not in self.state['sessions']:
            raise SupportError('session_unavailable', 404)
        return self.state['sessions'][sid]

    def response(self, sid, session):
        return {'ok': True, 'sessionId': sid, 'question': SLOTS[session['step']][1] if session['step'] < len(SLOTS) else 'اطلاعات تکمیل شد. برای ثبت، دکمهٔ ارسال درخواست را بزنید.',
                'complete': session['step'] == len(SLOTS), 'reference': session.get('requestId'), 'step': session['step']}

    def message(self, token, sid, text, expected_step=None):
        session = self.session(token, sid)
        if expected_step is not None:
            if type(expected_step) is not int or not isinstance(text, str):
                raise SupportError('invalid_step')
            if expected_step != session['step']:
                if session.get('lastStep') == expected_step and session.get('lastHash') == digest(text):
                    return self.response(sid, session)
                raise SupportError('stale_step', 409)
        if session['step'] >= len(SLOTS):
            raise SupportError('interview_complete', 409)
        slot, _, limit = SLOTS[session['step']]
        text = clean(text, limit)
        if slot == 'contact' and not (re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', text) or re.fullmatch(r'[+\d۰-۹٠-٩ ()-]{7,25}', text)):
            raise SupportError('invalid_contact')
        if slot == 'requestType' and text not in ('راهنمایی', 'خطا', 'پیگیری', 'سایر'):
            raise SupportError('invalid_request_type')
        if slot == 'urgency' and text not in ('عادی', 'فوری'):
            raise SupportError('invalid_urgency')
        if slot == 'consent' and text != 'بله':
            return dict(self.response(sid, session), question='بدون رضایت درخواست ارسال نمی‌شود. برای موافقت «بله» بنویسید یا صفحه را ببندید.')
        session['lastStep'] = session['step']
        session['lastHash'] = digest(text)
        session['values'][slot] = text
        session['step'] += 1
        self.admit()
        return self.response(sid, session)

    def submit(self, token, sid):
        session = self.session(token, sid)
        if session.get('requestId'):
            return {'ok': True, 'reference': session['requestId'], 'status': self.state['requests'][session['requestId']]['status']}
        if session['step'] != len(SLOTS) or session['values'].get('consent') != 'بله':
            raise SupportError('consent_required')
        if len(self.state['requests']) >= 300 or sum(r['status'] not in ('done','failed') for r in self.state['requests'].values()) >= 100:
            raise SupportError('queue_full', 503)
        v, now = session['values'], self.clock()
        rid = secrets.token_urlsafe(16)
        payload = {'schemaVersion': 1, 'requestId': rid, 'tenantId': self.tenant, 'customer': {'name': v['name'], 'contact': v['contact']},
                   'requestType': v['requestType'], 'details': 'کسب‌وکار/شناسه (اظهار مشتری): ' + v['business'] + '\nشرح: ' + v['details'],
                   'chatSummary': 'درخواست ' + v['requestType'] + '؛ فوریت ' + v['urgency'] + '؛ رضایت ثبت شد', 'createdAt': utc(now)}
        payload['signature'] = sign(payload, self.key)
        if len(canonical(payload)) > 8192:
            raise SupportError('payload_too_large', 413)
        self.state['requests'][rid] = {'payload': payload, 'status': 'queued', 'created': now, 'updated': now, 'timestamps': {'queued': utc(now)}, 'attempts': 0, 'nextAt': now, 'resultNote': ''}
        session['requestId'] = rid
        session['values'] = {}  # retain the queue payload once, not a second PII copy
        self.audit('create', rid)
        self.admit()
        return {'ok': True, 'reference': rid, 'status': 'queued'}

    def pull(self, limit):
        if type(limit) is not int or not 1 <= limit <= 10:
            raise SupportError('invalid_limit')
        now, items = self.clock(), []
        for rid, row in self.state['requests'].items():
            eligible = row['status'] == 'queued' and row['nextAt'] <= now or row['status'] in ('delivered','executing') and row['leaseUntil'] <= now
            if not eligible or len(items) >= limit:
                continue
            receipt = secrets.token_urlsafe(32)
            row.update(status='delivered', updated=now, leaseUntil=now + 120, receiptHash=digest(receipt), attempts=row['attempts'] + 1)
            row['timestamps']['delivered'] = utc(now)
            self.audit('deliver', rid, 'soroush')
            items.append({'payload': row['payload'], 'receipt': receipt, 'leaseUntil': utc(now + 120)})
        return {'ok': True, 'items': items}

    def leased(self, rid, receipt):
        row = self.state['requests'].get(rid)
        if not row:
            raise SupportError('request_unavailable', 404)
        if not isinstance(receipt, str) or len(receipt) > 100 or not hmac.compare_digest(row.get('receiptHash', ''), digest(receipt)):
            raise SupportError('stale_lease', 409)
        return row

    def ack(self, rid, receipt, status, note):
        row = self.leased(rid, receipt)
        if status not in ('executing','done','failed') or not isinstance(note, str) or len(note) > 300:
            raise SupportError('invalid_ack')
        if row['status'] in ('done','failed'):
            if row['status'] != status:
                raise SupportError('invalid_transition', 409)
            self.audit('ack:' + status + ':duplicate', rid, 'soroush')
            return {'ok': True, 'status': status}
        if status in ('done','failed') and row['status'] != 'executing':
            raise SupportError('invalid_transition', 409)
        now = self.clock()
        if row['status'] not in ('delivered','executing') or row['leaseUntil'] <= now:
            raise SupportError('stale_lease', 409)
        row.update(status=status, updated=now, resultNote=note, leaseUntil=now + 120)
        row['timestamps'][status] = utc(now)
        self.audit('ack:' + status, rid, 'soroush')
        return {'ok': True, 'status': status}

    def nack(self, rid, receipt):
        row = self.leased(rid, receipt)
        now = self.clock()
        if row['status'] not in ('delivered','executing') or row['leaseUntil'] <= now:
            raise SupportError('stale_lease', 409)
        row.update(status='queued', updated=now, nextAt=now + min(3600, 30 * 2 ** min(row['attempts'], 7)), receiptHash='')
        row['timestamps']['queued'] = utc(now)
        self.audit('nack', rid, 'soroush')
        return {'ok': True, 'status': 'queued'}

    def view(self):
        return {'ok': True, 'enabled': bool(self.state.get('linkHash')), 'requests': [
            {'reference': rid, 'status': r['status'], 'createdAt': utc(r['created']), 'updatedAt': utc(r['updated']), 'timestamps': r['timestamps'], 'resultNote': r['resultNote'], 'attempts': r['attempts']}
            for rid,r in sorted(self.state['requests'].items(), key=lambda item: item[1]['created'], reverse=True)[:30]]}
