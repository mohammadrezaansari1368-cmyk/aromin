"""Server calls (WP-C): parsing/dedupe of client-parsed Julio call sheets + daily call stats. Pure: no DB, no FastAPI.
Raw rows are stored unchanged; a person is resolved only at read time from confirmed aliases; nobody is ever guessed or created."""
import datetime
import hashlib
import math
import re

from aromin_attendance import SHA_RE, TooLarge, _clean_text, canonical, norm_date, norm_header, sanitize_row
from aromin_identity import normalize_key, normalize_name
from aromin_stage import _j2g

LIMITS = dict(rows=20000, keys_per_row=40, key_len=64, value_len=300)
SOURCES = ('import-center',)
DIRECTIONS = ('in', 'out')                       # summary upload
LOG_REQUIRED = ('کد کانال', 'تاریخ کانال', 'مبدا تماس', 'مقصد تماس')
SUMMARY_REQUIRED = ('کارشناس', 'داخلی', 'تمامی رکوردها')
SUMMARY_COUNTS = (('total', 'تمامی رکوردها'), ('answered', 'موفق'), ('no_answer', 'بدون‌پاسخ'), ('busy', 'مشغول'), ('failed', 'عدم‌موفقیت'))
SIDE_FIELDS = ('ext', 'julio', 'phone', 'contact')
CORE_FIELDS = ('date_j', 'time_s', 'direction') + tuple(s + '_' + f for s in 'od' for f in SIDE_FIELDS) + (
    'total_sec', 'talk_sec', 'channel_status', 'call_status')
STAT_KEYS = ('in', 'inAnswered', 'inMissed', 'out', 'outAnswered', 'outUnanswered', 'internal', 'answered', 'missed', 'talkSec', 'totalSec', 'afterHours')
METRICS = (('calls_in', 'in', 'تماس'), ('calls_out', 'out', 'تماس'), ('calls_internal', 'internal', 'تماس'),
           ('calls_answered', 'answered', 'تماس'), ('calls_missed', 'missed', 'تماس'), ('talk_seconds', 'talkSec', 'ثانیه'))
CHANNEL = {'موفق': 'success', 'بدونپاسخ': 'no_answer', 'مشغول': 'busy', 'عدمموفقیت': 'failed'}
CALL = {'پاسخدادهشده': 'answered', 'ازدسترفته': 'missed'}
_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
_EXT = re.compile(r'^[1-9][0-9]{1,3}$')
_CLOCK = re.compile(r'\s*(\d{1,2})\D+(\d{2})(?:\D+(\d{2}))?\D*')
_HMS = re.compile(r'(\d{1,3}):([0-5]\d):([0-5]\d)')
_SYNC = re.compile(r'(\d{1,2}:\d{2})\s+(\S+)|(\S+)\s+(\d{1,2}:\d{2})')


def _sha(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def digits(v):
    """fa/ar digits → ASCII; int / float x.0 → str; leading zeros kept; None unless all digits."""
    if v is None or isinstance(v, bool): return None
    if isinstance(v, float):
        if not math.isfinite(v) or v != int(v) or v < 0: return None
        v = int(v)
    m = re.fullmatch(r'([0-9]+)(?:\.0+)?', str(v).translate(_DIGITS).strip())
    return m.group(1) if m else None


def classify_party(id_raw, number_raw, name_raw):
    """{type: ext|external|unknown, ext, julio, phone, contact, name}. The ID's meaning (Julio user vs contact) comes only
    from this side's number: the two ID spaces overlap."""
    out = dict(type='unknown', ext=None, julio=None, phone=None, contact=None, name=None)
    n = digits(number_raw)
    if n is not None and ((isinstance(number_raw, str) and number_raw.translate(_DIGITS).strip().startswith('0')) or len(n) >= 5):
        if not isinstance(number_raw, str) and len(n) == 10 and n[0] == '9': n = '0' + n   # Excel turned 0911… into a number
        out.update(type='external', phone=n, contact=normalize_key('julio', id_raw))
    elif n is not None and _EXT.match(n):
        out.update(type='ext', ext=n, julio=normalize_key('julio', id_raw))
    name = _clean_text(name_raw)[:200] if name_raw is not None else ''
    if name and name not in (n, str(number_raw).strip()): out['name'] = name
    return out


def direction_of(o, d):
    if o['type'] == 'ext': return 'internal' if d['type'] == 'ext' else 'out'
    return 'in' if d['type'] == 'ext' else 'unknown'


def parse_clock(v):
    """"18:13':14\"", "18:13:14", "18:13", Excel day fraction → seconds since midnight; None if unparsable."""
    if v is None or isinstance(v, bool): return None
    if isinstance(v, (int, float)):
        return int(math.floor(v * 86400 + 0.5)) if math.isfinite(v) and 0 <= v < 1 else None
    m = _CLOCK.fullmatch(str(v).translate(_DIGITS))
    if not m: return None
    h, mi, s = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    return h * 3600 + mi * 60 + s if h <= 23 and mi <= 59 and s <= 59 else None


def _hms(v, cap=None):
    m = _HMS.fullmatch(str(v).translate(_DIGITS).strip()) if isinstance(v, str) else None
    if not m: return None
    n = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    return n if cap is None or n <= cap else None


def parse_duration(sec_v, hms_v):
    """Seconds column first (an integer 0..86400), else "HH:MM:SS"; anything else → None."""
    if sec_v is not None and sec_v != '':
        if isinstance(sec_v, bool): return None
        if isinstance(sec_v, float):
            if not math.isfinite(sec_v) or sec_v != int(sec_v): return None
            sec_v = int(sec_v)
        n = digits(sec_v) if not isinstance(sec_v, int) else (str(sec_v) if sec_v >= 0 else None)
        return int(n) if n is not None and int(n) <= 86400 else None
    return _hms(hms_v, 86400)


def parse_sync(v):
    """"18:13 1405/06/20" or "1405/06/20 18:13" → "1405/06/20 18:13"; None if invalid."""
    if not isinstance(v, str): return None
    m = _SYNC.fullmatch(re.sub(r'\s+', ' ', v.translate(_DIGITS)).strip())
    if not m: return None
    clock, date = (m.group(1), m.group(2)) if m.group(1) else (m.group(4), m.group(3))
    date, sec = norm_date(date), parse_clock(clock)
    return '%s %02d:%02d' % (date, sec // 3600, sec % 3600 // 60) if date and sec is not None else None


def _status_key(v):
    return normalize_name(v).replace(' ', '') if v is not None else ''


def norm_status(channel_v, call_v):
    """→ (channel_status, call_status); call_status falls back to the channel status when empty/unknown."""
    channel = CHANNEL.get(_status_key(channel_v), 'other')
    call = CALL.get(_status_key(call_v))
    if call is None:
        call = 'answered' if channel == 'success' else 'missed' if channel in ('no_answer', 'busy', 'failed') else 'other'
    return channel, call


def _cell(row, cmap, name):
    k = cmap.get(norm_header(name))
    return row.get(k) if k is not None else None


def parse_call_row(row, cmap):
    """(call, None) | (None, reason). cmap: {norm_header(column): column}; row already sanitized."""
    cell = lambda name: _cell(row, cmap, name)
    code = normalize_key('julio', digits(cell('کد کانال')))
    if not code: return None, 'بدون کد کانال'
    date = norm_date(cell('تاریخ کانال'))
    if not date: return None, 'تاریخ نامعتبر'
    o = classify_party(cell('مبدا تماس-ID'), cell('مبدا تماس'), cell('نام مبدا'))
    d = classify_party(cell('مقصد تماس-ID'), cell('مقصد تماس'), cell('نام مقصد'))
    channel, status = norm_status(cell('وضعیت کانال'), cell('وضعیت تماس'))
    call = {'channel_code': code, 'date_j': date, 'time_s': parse_clock(cell('ساعت')), 'direction': direction_of(o, d)}
    for side, p in (('o', o), ('d', d)):
        for f in SIDE_FIELDS + ('name',): call[side + '_' + f] = p[f]
    call.update(total_sec=parse_duration(cell('زمان کل (ثانیه)'), cell('زمان کل')),
                talk_sec=parse_duration(cell('مدت مکالمه (ثانیه)'), cell('مدت مکالمه')),
                channel_status=channel, call_status=status, sync_at=parse_sync(cell('تاریخ همگام‌سازی')))
    call['raw_json'] = canonical(row)
    call['row_sha256'] = _sha(call['raw_json'])
    call['core_sha256'] = _sha(canonical({k: call[k] for k in CORE_FIELDS}))
    return call, None


def _envelope(payload):
    if not isinstance(payload, dict): raise ValueError('بدنهٔ درخواست نامعتبر است.')
    file_name = str(payload.get('fileName') or '').strip()
    if not file_name or len(file_name) > 255: raise ValueError('نام فایل نامعتبر است.')
    sha = str(payload.get('sha256') or '')
    if not SHA_RE.match(sha): raise ValueError('چکیدهٔ sha256 فایل نامعتبر است.')
    source = payload.get('source') or 'import-center'
    if source not in SOURCES: raise ValueError('منبع فایل نامعتبر است.')
    return file_name, sha, source


def _rows(payload, required):
    rows = payload.get('rows')
    if not isinstance(rows, list) or not rows: raise ValueError('ردیفی ارسال نشده است.')
    if len(rows) > LIMITS['rows']: raise TooLarge('تعداد ردیف‌ها بیش از حد مجاز است.')
    rows = [sanitize_row(r) for r in rows]
    cmap = {}
    for r in rows:
        for c in r: cmap.setdefault(norm_header(c), c)
    missing = [c for c in required if norm_header(c) not in cmap]
    if missing: raise ValueError('ستون «' + '»، «'.join(missing) + '» در فایل نیست.')
    return rows, cmap


def parse_log_payload(payload):
    """Body of POST …/calls/log → {file_name, sha256, source, calls, skipped:[{row, reason}], in_file_conflicts:[{key, reason, rows}]}.
    row = 1-based index in payload.rows. A code repeated with different content drops every copy (never picks one)."""
    file_name, sha, source = _envelope(payload)
    rows, cmap = _rows(payload, LOG_REQUIRED)
    by_code, order, skipped = {}, [], []
    for i, r in enumerate(rows, 1):
        call, reason = parse_call_row(r, cmap)
        if reason:
            skipped.append({'row': i, 'reason': reason}); continue
        seen = by_code.get(call['channel_code'])
        if seen is None:
            by_code[call['channel_code']] = [(i, call)]; order.append(call['channel_code'])
        elif all(c['row_sha256'] == call['row_sha256'] for _, c in seen):
            skipped.append({'row': i, 'reason': 'تکراری در فایل'})
        else:
            seen.append((i, call))
    calls, conflicts = [], []
    for code in order:
        group = by_code[code]
        if len(group) == 1: calls.append(group[0][1])
        else: conflicts.append({'key': code, 'reason': 'in_file', 'rows': [i for i, _ in group]})
    return {'file_name': file_name, 'sha256': sha, 'source': source, 'calls': calls, 'skipped': skipped, 'in_file_conflicts': conflicts}


def plan_calls(existing, calls):
    """existing: {code: {row_sha256, core_sha256, sync_at, [core columns…]}} → {insert:[call], update:[{key, reason, fields, call}],
    unchanged:int, conflicts:[{key, reason, fields}]}. fields = changed core columns, when existing carries them."""
    plan = {'insert': [], 'update': [], 'unchanged': 0, 'conflicts': []}
    for c in calls:
        old = existing.get(c['channel_code'])
        if old is None:
            plan['insert'].append(c); continue
        if old.get('row_sha256') == c['row_sha256']:
            plan['unchanged'] += 1; continue
        fields = [k for k in CORE_FIELDS if k in old and old[k] != c[k]]
        if old.get('core_sha256') == c['core_sha256']:
            if c.get('sync_at') and old.get('sync_at') and c['sync_at'] < old['sync_at']:
                plan['unchanged'] += 1; continue   # an older export never moves sync_at backwards
            plan['update'].append({'key': c['channel_code'], 'reason': 'meta', 'fields': [], 'call': c})
        elif c.get('sync_at') and old.get('sync_at') and c['sync_at'] > old['sync_at']:
            plan['update'].append({'key': c['channel_code'], 'reason': 'newer_sync', 'fields': fields, 'call': c})
        else:
            reason = 'older_or_same_sync' if c.get('sync_at') and old.get('sync_at') else 'no_sync'
            plan['conflicts'].append({'key': c['channel_code'], 'reason': reason, 'fields': fields})
    return plan


def _ordinal(date_j):
    y, m, d = (int(x) for x in date_j.split('/'))
    return datetime.date(*_j2g(y, m, d)).toordinal()


def parse_period(p):
    """{month:'1405/06'} | {from, to} → (from, to), both inclusive; ValueError when invalid or over 366 days."""
    if not isinstance(p, dict): raise ValueError('جهت و دوره را انتخاب کنید.')
    if p.get('month') is not None:
        m = re.fullmatch(r'([0-9]{4})/([0-9]{1,2})', str(p['month']).translate(_DIGITS).strip())
        if not m or not 1 <= int(m.group(2)) <= 12: raise ValueError('ماه نامعتبر است.')
        y, mo = int(m.group(1)), int(m.group(2))
        return '%04d/%02d/01' % (y, mo), '%04d/%02d/%02d' % (y, mo, 31 if mo <= 6 else 30)
    start, end = norm_date(p.get('from')), norm_date(p.get('to'))
    if not start or not end: raise ValueError('تاریخ دوره نامعتبر است.')
    if start > end: raise ValueError('آغاز دوره پس از پایان آن است.')
    if _ordinal(end) - _ordinal(start) + 1 > 366: raise ValueError('دوره بیش از ۳۶۶ روز است.')
    return start, end


def _count(v):
    """Empty → 0; else an integer 0..100000; None if invalid."""
    if v is None or v == '': return 0
    n = digits(v)
    return int(n) if n is not None and int(n) <= 100000 else None


def parse_summary_payload(payload):
    """Body of POST …/calls/summary → {file_name, sha256, source, direction, period_from, period_to,
    rows:[{ext, agent_name, total, answered, no_answer, busy, failed, talk_sec, raw_json, row_sha256}], skipped:[{row, reason}], warnings:[str]}."""
    file_name, sha, source = _envelope(payload)
    direction = payload.get('direction')
    if direction not in DIRECTIONS or payload.get('period') is None: raise ValueError('جهت و دوره را انتخاب کنید.')
    start, end = parse_period(payload['period'])
    rows, cmap = _rows(payload, SUMMARY_REQUIRED)
    by_ext, order, skipped, warnings = {}, [], [], []
    for i, r in enumerate(rows, 1):
        cell = lambda name: _cell(r, cmap, name)
        ext = digits(cell('داخلی'))
        if not ext or not _EXT.match(ext):
            skipped.append({'row': i, 'reason': 'داخلی نامعتبر'}); continue
        counts = {k: _count(cell(col)) for k, col in SUMMARY_COUNTS}
        bad = [col for k, col in SUMMARY_COUNTS if counts[k] is None]
        talk = cell('مدت مکالمه')
        talk = 0 if talk is None or talk == '' else _hms(talk)
        if bad or talk is None:
            skipped.append({'row': i, 'reason': 'مقدار نامعتبر در ستون ' + (bad[0] if bad else 'مدت مکالمه')}); continue
        name = _clean_text(cell('کارشناس') or '')[:200] or None
        raw = canonical(r)
        row = dict(counts, ext=ext, agent_name=name, talk_sec=talk, raw_json=raw, row_sha256=_sha(raw))
        seen = by_ext.get(ext)
        if seen is None:
            by_ext[ext] = [(i, row)]; order.append(ext)
        elif all(x['row_sha256'] == row['row_sha256'] for _, x in seen):
            skipped.append({'row': i, 'reason': 'تکراری در فایل'})
        else:
            seen.append((i, row))
    out = []
    for ext in order:
        group = by_ext[ext]
        if len(group) > 1:
            skipped.extend({'row': i, 'reason': 'داخلیِ تکراری با محتوای متفاوت'} for i, _ in group); continue
        row = group[0][1]
        if row['answered'] + row['no_answer'] + row['busy'] + row['failed'] != row['total']:
            warnings.append('جمعِ وضعیت‌ها با کل نمی‌خواند (داخلی %s)' % ext)
        out.append(row)
    skipped.sort(key=lambda s: s['row'])
    return {'file_name': file_name, 'sha256': sha, 'source': source, 'direction': direction, 'period_from': start, 'period_to': end,
            'rows': out, 'skipped': skipped, 'warnings': warnings}


def plan_summary(existing, rows):
    """existing: {ext: row_sha256} → {insert:[row], update:[row], unchanged:int}."""
    plan = {'insert': [], 'update': [], 'unchanged': 0}
    for r in rows:
        old = existing.get(r['ext'])
        if old is None: plan['insert'].append(r)
        elif old != r['row_sha256']: plan['update'].append(r)
        else: plan['unchanged'] += 1
    return plan


def confirmed_index(aliases):
    """identity_aliases rows → {(kind, key): personId} of confirmed julio/ext aliases only."""
    return {(a['kind'], a['alias_key']): str(a['person_id']) for a in aliases
            if a.get('kind') in ('julio', 'ext') and a.get('status') == 'confirmed' and a.get('person_id') is not None}


def resolve_party(ext, julio, aliases):
    """(personId, None) | (None, 'julio_ext_conflict' | 'unmapped'). Confirmed aliases only; julio wins (extensions move).
    aliases: identity_aliases rows or a confirmed_index()."""
    idx = aliases if isinstance(aliases, dict) else confirmed_index(aliases)
    pj = idx.get(('julio', julio)) if julio else None
    pe = idx.get(('ext', ext)) if ext else None
    if pj and pe and pj != pe: return None, 'julio_ext_conflict'
    if pj or pe: return pj or pe, None
    return None, 'unmapped'


def _day(date):
    return dict({k: 0 for k in STAT_KEYS}, date=date)


def daily_stats(calls, aliases, start, end, work=(600, 1080)):
    """§8. calls: parsed calls / call_logs rows; start/end inclusive 'YYYY/MM/DD'; work = (start, end) minutes since midnight.
    → {people:[{personId, days:[DayStat], totals}], queues:[{ext, date, in, inAnswered, inMissed, talkSec, totalSec, afterHours}],
       unassigned:[{date, in, inMissed, out, internal, unknown}], issues:[{kind, key, raw, reason, calls}]}.
    An inbound call to an extension without a Julio user (shared queue / shared extension) is counted only in queues,
    never for a person — not even the extension's confirmed owner."""
    idx = confirmed_index(aliases)
    ws, we = work[0] * 60, work[1] * 60
    people, queues, unassigned, issues = {}, {}, {}, {}

    def side(c, s):
        return c[s + '_ext'], c[s + '_julio'], c.get(s + '_name')

    def issue(ext, julio, name, reason):
        kind, key = ('julio', julio) if julio else ('ext', ext)
        i = issues.setdefault((kind, key, reason), {'kind': kind, 'key': key, 'raw': name or key, 'reason': reason, 'calls': 0})
        i['calls'] += 1

    def lost(date, field, missed=False):
        u = unassigned.setdefault(date, {'date': date, 'in': 0, 'inMissed': 0, 'out': 0, 'internal': 0, 'unknown': 0})
        u[field] += 1
        if missed: u['inMissed'] += 1

    for c in calls:
        date = c['date_j']
        if not start <= date <= end: continue
        talk, total, t = c.get('talk_sec') or 0, c.get('total_sec') or 0, c.get('time_s')
        after = int(t is not None and not ws <= t < we)
        answered, missed = c['call_status'] == 'answered', c['call_status'] == 'missed'

        def add(pid, **inc):
            st = people.setdefault(pid, {}).setdefault(date, _day(date))
            for k, v in dict(inc, talkSec=talk, totalSec=total, afterHours=after).items(): st[k] += v

        direction = c['direction']
        if direction == 'in':
            ext, julio, name = side(c, 'd')
            if not julio:
                q = queues.setdefault((date, ext), {'ext': ext, 'date': date, 'in': 0, 'inAnswered': 0, 'inMissed': 0, 'talkSec': 0, 'totalSec': 0, 'afterHours': 0})
                for k, v in (('in', 1), ('inAnswered', int(answered)), ('inMissed', int(missed)), ('talkSec', talk), ('totalSec', total), ('afterHours', after)):
                    q[k] += v
                continue
            pid, why = resolve_party(ext, julio, idx)
            if pid: add(pid, **{'in': 1, 'inAnswered': int(answered), 'inMissed': int(missed), 'answered': int(answered), 'missed': int(missed)})
            else: issue(ext, julio, name, why); lost(date, 'in', missed)
        elif direction == 'out':
            ext, julio, name = side(c, 'o')
            pid, why = resolve_party(ext, julio, idx)
            if pid: add(pid, out=1, outAnswered=int(answered), outUnanswered=int(missed), answered=int(answered))
            else: issue(ext, julio, name, why); lost(date, 'out')
        elif direction == 'internal':
            pids, unresolved = [], False
            for s in ('o', 'd'):
                ext, julio, name = side(c, s)
                pid, why = resolve_party(ext, julio, idx)
                if pid:
                    if pid not in pids: pids.append(pid)
                else: issue(ext, julio, name, why); unresolved = True
            for pid in pids: add(pid, internal=1)
            if unresolved: lost(date, 'internal')
        else:
            lost(date, 'unknown')

    out = []
    for pid in sorted(people, key=lambda p: (len(p), p)):
        days = [people[pid][d] for d in sorted(people[pid])]
        totals = _day(None)
        for d in days:
            for k in STAT_KEYS: totals[k] += d[k]
        out.append({'personId': pid, 'days': days, 'totals': totals})
    return {'people': out, 'queues': [queues[k] for k in sorted(queues)], 'unassigned': [unassigned[d] for d in sorted(unassigned)],
            'issues': sorted(issues.values(), key=lambda i: (-i['calls'], i['kind'], i['key'], i['reason']))}


def daily_records(stats):
    """daily_stats → records()-shaped rows (people only; queues/unassigned never become a person's record); zeros skipped."""
    out = []
    for p in stats['people']:
        for d in p['days']:
            for metric, key, unit in METRICS:
                if d[key]:
                    out.append({'id': 'calls:%s:%s:%s' % (p['personId'], d['date'], metric), 'personId': p['personId'], 'date': d['date'],
                                'metric': metric, 'value': d[key], 'unit': unit, 'source': 'call_logs',
                                'note': 'تجمیع روزانهٔ ریز تماس؛ تماسِ صف/داخلیِ مشترک و تماسِ بی‌نگاشت شمرده نشده است.'})
    return out
