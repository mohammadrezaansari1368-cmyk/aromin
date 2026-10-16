"""Support tickets on the server (WP-4): Joolio ticket export → ticket_logs. Pure functions; server.py does I/O.
Owner decisions (2026-10-14): activity = one per unique ticket number on its registration date;
efficiency = tickets on time for both SLA and OLA ÷ tickets whose SLA and OLA are both known × 100."""
import hashlib
import re

from aromin_attendance import SHA_RE, TooLarge, _clean_text, canonical, norm_date, norm_header, sanitize_row
from aromin_identity import normalize_key

SOURCES = ('import-center',)
LIMITS = dict(rows=20000, raw_keys=300)   # the export has ~106 columns; only picked columns are kept (sanitize_row limits apply after projection)
_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
_DATE = re.compile(r'([0-9]{4}/[0-9]{1,2}/[0-9]{1,2})')
# Header candidates mirror the legacy ticket import (legacy.html pickCol): exact first, then substring.
COLUMNS = {
    'no': (('شماره تیکت', 'تیکت'), ('تیکت',)),
    'date': (('تاریخ ثبت',), ('تاریخ ثبت',)),
    'agent': (('کارشناس', 'آخرین ارجاع به', 'تغییر وضعیت دهنده'), ('کارشناس',)),
    'sla': (('تاخیر SLA',), ('تاخیر sla',)),
    'ola': (('تاخیر OLA',), ('تاخیر ola',)),
    'channel': (('سرشاخه',), ()),
    'subject': (('موضوع اصلی', 'موضوع'), ()),
    'status': (('وضعیت',), ()),
    'company': (('شرکت',), ()),
}
REQUIRED = ('no', 'date', 'agent')
_NOT_NUMBER = ('نحوه', 'نوع', 'عنوان', 'موضوع', 'وضعیت', 'تاریخ', 'توضیح', 'شرح', 'یادداشت', 'متن')   # «نحوه ثبت تیکت», «شرح تیکت» etc. are never the ticket number
CORE = ('date_j', 'agent_name', 'agent_key', 'channel', 'subject', 'status', 'company', 'sla_ok', 'ola_ok')
LABELS = {'date_j': 'تاریخ ثبت', 'agent_name': 'کارشناس', 'agent_key': 'کارشناس', 'channel': 'سرشاخه', 'subject': 'موضوع',
          'status': 'وضعیت', 'company': 'شرکت', 'sla_ok': 'SLA', 'ola_ok': 'OLA'}


def _sha(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def pick_columns(headers):
    """{field: original header}. Exact (normalized) match first, then substring; the ticket number never takes a descriptive column."""
    norm = [(norm_header(h), h) for h in headers]
    out = {}
    for field, (exact, partial) in COLUMNS.items():
        hit = next((h for cand in exact for n, h in norm if n == norm_header(cand)), None)
        if hit is None:
            for cand in partial:
                c = norm_header(cand)
                hit = next((h for n, h in norm if c in n and not (field == 'no' and any(w in n for w in _NOT_NUMBER))), None)
                if hit is not None: break
        if hit is not None: out[field] = hit
    return out


def on_time(v):
    """«عدم تاخیر» → 1; any other non-empty text → 0; empty → None (unknown, never guessed)."""
    s = re.sub(r'\s|‌', '', _clean_text(v)) if v is not None else ''
    if not s: return None
    return 1 if 'عدمتاخیر' in s.replace('أ', 'ا') else 0


def ticket_no(v):
    if v is None or isinstance(v, bool): return None
    if isinstance(v, float):
        if v != v or v != int(v) or v < 0: return None
        v = int(v)
    m = re.fullmatch(r'#?\s*([0-9]{1,32})(?:\.0+)?', str(v).translate(_DIGITS).strip())
    return m.group(1) if m else None


def reg_date(v):
    m = _DATE.search(str(v if v is not None else '').translate(_DIGITS))
    return norm_date(m.group(1)) if m else None


def _text(v, n):
    s = _clean_text(v) if v is not None else ''
    return s[:n] or None


def parse_row(row, cols):
    """(ticket, None) | (None, reason). row already sanitized."""
    cell = lambda f: row.get(cols[f]) if f in cols else None
    no = ticket_no(cell('no'))
    if not no: return None, 'شماره تیکت نامعتبر'
    date = reg_date(cell('date'))
    if not date: return None, 'تاریخ ثبت نامعتبر'
    agent = _text(cell('agent'), 200)
    t = {'ticket_no': no, 'date_j': date, 'agent_name': agent, 'agent_key': normalize_key('name', agent) if agent else None,
         'channel': _text(cell('channel'), 20), 'subject': _text(cell('subject'), 100), 'status': _text(cell('status'), 60),
         'company': _text(cell('company'), 255), 'sla_ok': on_time(cell('sla')), 'ola_ok': on_time(cell('ola'))}
    t['raw_json'] = canonical(row)
    t['row_sha256'] = _sha(t['raw_json'])
    return t, None


def parse_payload(payload):
    """Body of POST …/tickets → {file_name, sha256, source, tickets, skipped:[{row, reason}], in_file_conflicts:[{key, reason, rows}]}.
    A number repeated with different content drops every copy (never picks one)."""
    if not isinstance(payload, dict): raise ValueError('بدنهٔ درخواست نامعتبر است.')
    file_name = str(payload.get('fileName') or '').strip()
    if not file_name or len(file_name) > 255: raise ValueError('نام فایل نامعتبر است.')
    sha = str(payload.get('sha256') or '')
    if not SHA_RE.match(sha): raise ValueError('چکیدهٔ sha256 فایل نامعتبر است.')
    source = payload.get('source') or 'import-center'
    if source not in SOURCES: raise ValueError('منبع فایل نامعتبر است.')
    rows = payload.get('rows')
    if not isinstance(rows, list) or not rows: raise ValueError('ردیفی ارسال نشده است.')
    if len(rows) > LIMITS['rows']: raise TooLarge('تعداد ردیف‌ها بیش از حد مجاز است.')
    if any(not isinstance(r, dict) for r in rows): raise ValueError('ردیف تیکت باید شیء باشد.')
    if any(len(r) > LIMITS['raw_keys'] for r in rows): raise TooLarge('ستون‌های ردیف بیش از حد مجاز است.')
    headers = list(dict.fromkeys(c for r in rows for c in r if isinstance(c, str)))
    cols = pick_columns(headers)
    missing = [{'no': 'شماره تیکت', 'date': 'تاریخ ثبت', 'agent': 'کارشناس'}[f] for f in REQUIRED if f not in cols]
    if missing: raise ValueError('ستون «' + '»، «'.join(missing) + '» در فایل نیست.')
    keep = sorted(set(cols.values()))   # history/description columns are never stored
    rows = [sanitize_row({k: r[k] for k in keep if k in r}) for r in rows]
    by_no, order, skipped = {}, [], []
    for i, r in enumerate(rows, 1):
        t, reason = parse_row(r, cols)
        if reason:
            skipped.append({'row': i, 'reason': reason}); continue
        seen = by_no.get(t['ticket_no'])
        if seen is None:
            by_no[t['ticket_no']] = [(i, t)]; order.append(t['ticket_no'])
        elif all(x['row_sha256'] == t['row_sha256'] for _, x in seen):
            skipped.append({'row': i, 'reason': 'تکراری در فایل'})
        else:
            seen.append((i, t))
    tickets, conflicts = [], []
    for no in order:
        group = by_no[no]
        if len(group) == 1: tickets.append(group[0][1])
        else: conflicts.append({'key': no, 'reason': 'in_file', 'rows': [i for i, _ in group]})
    return {'file_name': file_name, 'sha256': sha, 'source': source, 'tickets': tickets, 'skipped': skipped,
            'in_file_conflicts': conflicts, 'columns': cols}


def plan(existing, tickets):
    """existing: {no: {row_sha256, [CORE…]}} → {insert:[t], update:[{key, fields, ticket}], unchanged:int}.
    A later export of the same ticket replaces it (status/SLA evolve); every replaced field is reported."""
    out = {'insert': [], 'update': [], 'unchanged': 0}
    for t in tickets:
        old = existing.get(t['ticket_no'])
        if old is None: out['insert'].append(t)
        elif old.get('row_sha256') == t['row_sha256']: out['unchanged'] += 1
        else: out['update'].append({'key': t['ticket_no'], 'fields': [k for k in CORE if k in old and old[k] != t[k]], 'ticket': t})
    return out


def records(rows, aliases):
    """ticket_logs rows + identity_aliases → (records()-shaped rows, issues). Confirmed name aliases only; never guessed.
    One record per ticket: metric 'tickets', value 1, onTime = 1/0 when SLA and OLA are both known, else None."""
    idx = {a['alias_key']: str(a['person_id']) for a in aliases
           if a.get('kind') == 'name' and a.get('status') == 'confirmed' and a.get('person_id') is not None}
    out, issues = [], {}
    for r in rows:
        pid = idx.get(r.get('agent_key')) if r.get('agent_key') else None
        if not pid:
            k = r.get('agent_key') or ''
            issues.setdefault(k, {'kind': 'name', 'key': k, 'raw': r.get('agent_name'), 'reason': 'unmapped' if k else 'no_agent', 'tickets': 0})
            issues[k]['tickets'] += 1
            continue
        known = r.get('sla_ok') is not None and r.get('ola_ok') is not None
        out.append({'id': 'ticket:' + r['ticket_no'], 'personId': pid, 'date': r['date_j'], 'metric': 'tickets', 'value': 1, 'unit': 'تیکت',
                    'source': 'ticket_logs', 'onTime': (1 if r['sla_ok'] and r['ola_ok'] else 0) if known else None,
                    'note': 'تیکت یکتا به تاریخ ثبت؛ به‌موقع = SLA و OLA هر دو «عدم تاخیر».'})
    return out, [issues[k] for k in sorted(issues)]
