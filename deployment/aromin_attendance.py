"""Server attendance (WP-B): validation and parsing of client-parsed device sheets. Pure: no DB, no FastAPI.
Raw rows are stored unchanged (processSheet input); overrides are separate and joined only at read time."""
import hashlib
import json
import math
import re

from aromin_identity import normalize_key

CODES = ('present', 'official_worked', 'friday_worked', 'birthday_worked', 'official_holiday', 'friday', 'birthday',
         'leave', 'sick', 'mission', 'meeting', 'absent')   # performance.ts Code
EDIT_KEYS = {'code', 'entry', 'exit', 'present', 'overtime', 'excuse', 'note'}
DEFAULT_SETTINGS = {'workStart': '10:00', 'workEnd': '18:00', 'dailyWork': '07:30', 'restDuration': 30, 'lateThreshold': 15,
                    'lateDeduct': '08:00', 'meetingDefault': 60, 'taskKeywords': 'حضوری', 'overtimeByLateExit': False}
LIMITS = dict(sheets=200, rows_per_sheet=400, keys_per_row=40, key_len=64, value_len=300)
SOURCES = ('import-center', 'card', 'migration')
SHA_RE = re.compile(r'^[0-9a-f]{64}$')
_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
_HEADER = str.maketrans({'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'أ': 'ا', 'آ': 'ا', '‌': ' ', ' ': ' ', '‎': ' ', '‏': ' '})
_HHMM = re.compile(r'^([0-9]{1,2}):([0-5][0-9])$')


class TooLarge(ValueError):
    """Payload over LIMITS → 413."""


def norm_header(s):
    if s is None: return ''
    return re.sub(r'\s+', ' ', str(s).translate(_HEADER)).strip().lower()


def norm_date(v):
    m = re.fullmatch(r'([0-9]{4})/([0-9]{1,2})/([0-9]{1,2})', str(v if v is not None else '').translate(_DIGITS).strip())
    if not m: return None
    y, mo, d = (int(x) for x in m.groups())
    if not 1 <= mo <= 12 or not 1 <= d <= (31 if mo <= 6 else 30): return None
    return '%04d/%02d/%02d' % (y, mo, d)


def _round(x):
    return int(math.floor(x + 0.5))   # JS Math.round


def to_minutes(v):
    """Port of parseTimeToMinutes (performance.ts): Excel day fraction, 'H:MM[:SS] [AM|PM]'; 00:00 → None."""
    if v is None or v == '' or isinstance(v, bool): return None
    if isinstance(v, (int, float)): return _round(v * 1440) if 0 < v < 1 else None
    m = re.fullmatch(r'([0-9]{1,3}):([0-9]{2})(?::[0-9]{2})?\s*(AM|PM)?', str(v).strip().translate(_DIGITS), re.I)
    if not m: return None
    h, mm = int(m.group(1)), int(m.group(2))
    if h > 23 and not m.group(3): return None
    if m.group(3):
        pm = m.group(3).lower() == 'pm'
        if pm and h < 12: h += 12
        if not pm and h == 12: h = 0
    if h == 0 and mm == 0: return None
    return h * 60 + mm


def canonical(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def sanitize_row(row):
    if not isinstance(row, dict): raise ValueError('ردیف حضور باید شیء باشد.')
    if len(row) > LIMITS['keys_per_row']: raise TooLarge('ستون‌های ردیف بیش از حد مجاز است.')
    out = {}
    for k, v in row.items():
        if not isinstance(k, str) or not k or len(k) > LIMITS['key_len']: raise ValueError('نام ستون نامعتبر است.')
        if isinstance(v, float) and not math.isfinite(v): raise ValueError('مقدار عددی نامعتبر در ستون ' + k)
        if isinstance(v, str) and len(v) > LIMITS['value_len']: raise ValueError('مقدار طولانی در ستون ' + k)
        if v is not None and not isinstance(v, (str, int, float, bool)): raise ValueError('مقدار غیرساده در ستون ' + k)
        out[k] = v
    return out


def _clean_text(v):
    return re.sub(r'\s+', ' ', str(v).replace('ي', 'ی').replace('ك', 'ک').replace(' ', ' ')).strip()


def _note(row, cmap, columns):
    """Port of extractNote: non-time text in the presence/punch/unnamed columns."""
    notes = []
    def push(v):
        if v is None or isinstance(v, (int, float)): return
        s = re.sub(r'\s+', ' ', str(v).replace(' ', ' ')).strip()
        if not s or s in ('nan', '-', '—') or to_minutes(s) is not None or s in notes: return
        notes.append(s)
    cell = lambda name: row.get(cmap[norm_header(name)]) if norm_header(name) in cmap else None
    push(cell('حضور'))
    for i in (1, 2, 3): push(cell('ورود %d' % i)); push(cell('خروج %d' % i))
    for c in columns:
        if c.startswith('__EMPTY') or c.startswith('Unnamed'): push(row.get(c))
    return ' / '.join(notes)


def parse_sheet(name, rows):
    """→ ({card_no, sheet_name, person_name, ignored_rows, days:[...]}, None) or (None, reason)."""
    columns = list(dict.fromkeys(k for r in rows for k in r))
    cmap = {norm_header(c): c for c in columns}
    cell = lambda r, col: r.get(cmap[norm_header(col)]) if norm_header(col) in cmap else None
    dated = [(norm_date(cell(r, 'تاریخ')), r) for r in rows]
    dated = [(d, r) for d, r in dated if d]
    if not dated: return None, 'بدون ستون تاریخ'
    cards = {normalize_key('card', cell(r, 'شماره کارت')) for _, r in dated} - {None}
    if not cards: return None, 'بدون شماره کارت'
    if len(cards) > 1: return None, 'چند شماره کارت در یک شیت'
    first = dated[0][1]
    person = _clean_text(' '.join(str(cell(first, c) or '') for c in ('نام', 'نام خانوادگی')))
    days = {}
    for date, r in dated:
        raw = canonical(r)
        sha = hashlib.sha256(raw.encode('utf-8')).hexdigest()
        if date in days:
            if days[date]['row_sha256'] != sha: return None, 'تاریخ تکراری با محتوای متفاوت'
            continue
        punches = [m for i in (1, 2, 3) for c in ('ورود %d' % i, 'خروج %d' % i) for m in [to_minutes(cell(r, c))] if m is not None]
        present = to_minutes(cell(r, 'حضور'))
        if present is None and len(punches) >= 2 and len(punches) % 2 == 0:
            present = sum(max(0, punches[i + 1] - punches[i]) for i in range(0, len(punches), 2))
        days[date] = {'date_j': date, 'punches': punches, 'present_min': present, 'note': _note(r, cmap, columns)[:300] or None,
                      'raw_json': raw, 'row_sha256': sha}
    return {'card_no': cards.pop(), 'sheet_name': name, 'person_name': person[:200] or None, 'ignored_rows': len(rows) - len(dated),
            'days': [days[d] for d in sorted(days)]}, None


def parse_payload(payload):
    """Body of POST /api/performance/attendance → {file_name, sha256, source, sheets:[parsed], skipped:[{sheet, reason}]}."""
    if not isinstance(payload, dict): raise ValueError('بدنهٔ درخواست نامعتبر است.')
    file_name = str(payload.get('fileName') or '').strip()
    if not file_name or len(file_name) > 255: raise ValueError('نام فایل نامعتبر است.')
    sha = str(payload.get('sha256') or '')
    if not SHA_RE.match(sha): raise ValueError('چکیدهٔ sha256 فایل نامعتبر است.')
    source = payload.get('source') or 'import-center'
    if source not in SOURCES: raise ValueError('منبع فایل نامعتبر است.')
    sheets = payload.get('sheets')
    if not isinstance(sheets, dict) or not sheets: raise ValueError('شیتی ارسال نشده است.')
    if len(sheets) > LIMITS['sheets']: raise TooLarge('تعداد شیت‌ها بیش از حد مجاز است.')
    parsed, skipped, seen = [], [], set()
    for name, rows in sheets.items():
        if not isinstance(name, str) or not name.strip() or len(name) > 100: raise ValueError('نام شیت نامعتبر است.')
        if not isinstance(rows, list): raise ValueError('ردیف‌های شیت باید فهرست باشد.')
        if len(rows) > LIMITS['rows_per_sheet']: raise TooLarge('ردیف‌های شیت «' + name + '» بیش از حد مجاز است.')
        sheet, reason = parse_sheet(name, [sanitize_row(r) for r in rows])
        if sheet and sheet['card_no'] in seen: sheet, reason = None, 'شماره کارت تکراری در چند شیت'
        if sheet:
            seen.add(sheet['card_no']); parsed.append(sheet)
        else:
            skipped.append({'sheet': name, 'reason': reason})
    return {'file_name': file_name, 'sha256': sha, 'source': source, 'sheets': parsed, 'skipped': skipped}


def plan_upsert(existing, days):
    """existing: {(card_no, date_j): row_sha256}; days: [{card_no, date_j, row_sha256, ...}] → insert/update lists + unchanged count."""
    plan = {'insert': [], 'update': [], 'unchanged': 0}
    for d in days:
        old = existing.get((d['card_no'], d['date_j']))
        if old is None: plan['insert'].append(d)
        elif old != d['row_sha256']: plan['update'].append(d)
        else: plan['unchanged'] += 1
    return plan


def _hhmm(v, key):
    if not isinstance(v, str) or not _HHMM.match(v.strip()) or int(v.strip().split(':')[0]) > 23: raise ValueError('ساعت نامعتبر در ' + key + ' (HH:MM)')
    return v.strip()


def validate_override(fields):
    """RowEdit whitelist (performance.ts); None or empty = delete the override."""
    if fields is None: return None
    if not isinstance(fields, dict): raise ValueError('ویرایش ردیف نامعتبر است.')
    unknown = set(fields) - EDIT_KEYS
    if unknown: raise ValueError('فیلد ناشناخته: ' + ', '.join(sorted(map(str, unknown))))
    out = {}
    for k, v in fields.items():
        if v is None or v == '': continue
        if k == 'code':
            if v not in CODES: raise ValueError('کد روز نامعتبر است.')
            out[k] = v
        elif k in ('entry', 'exit', 'present', 'overtime'): out[k] = _hhmm(v, k)
        elif k == 'excuse':
            if not isinstance(v, bool): raise ValueError('بخشودگی باید بله/خیر باشد.')
            out[k] = v
        else:
            if not isinstance(v, str) or len(v) > 300: raise ValueError('یادداشت حداکثر ۳۰۰ نویسه است.')
            out[k] = v
    return out or None


def _int(v, key, hi=600):
    try:
        if isinstance(v, bool): raise ValueError
        n = int(str(v).translate(_DIGITS).strip()) if not isinstance(v, (int, float)) else int(v)
        if isinstance(v, float) and v != n: raise ValueError
    except (TypeError, ValueError):
        raise ValueError('عدد نامعتبر در ' + key) from None
    if not 0 <= n <= hi: raise ValueError('مقدار خارج از بازه در ' + key)
    return n


def validate_settings(s):
    if not isinstance(s, dict): raise ValueError('تنظیمات نامعتبر است.')
    out = dict(DEFAULT_SETTINGS)
    for k in DEFAULT_SETTINGS:
        if k in s and s[k] is not None: out[k] = s[k]
    for k in ('workStart', 'workEnd', 'dailyWork', 'lateDeduct'): out[k] = _hhmm(out[k], k)
    rest = out['restDuration']
    out['restDuration'] = _hhmm(rest, 'restDuration') if isinstance(rest, str) and ':' in rest else _int(rest, 'restDuration')
    for k in ('lateThreshold', 'meetingDefault'): out[k] = _int(out[k], k)
    if not isinstance(out['taskKeywords'], str) or len(out['taskKeywords']) > 300: raise ValueError('کلیدواژه‌ها نامعتبر است.')
    if not isinstance(out['overtimeByLateExit'], bool): raise ValueError('اضافه‌کار از خروج دیرتر باید بله/خیر باشد.')
    if to_minutes(out['workStart']) is None or to_minutes(out['workEnd']) is None or to_minutes(out['workStart']) >= to_minutes(out['workEnd']):
        raise ValueError('ساعت شروع باید پیش از پایان موظفی باشد.')
    return out


def period(days):
    dates = sorted(d['date_j'] for d in days)
    return (dates[0], dates[-1]) if dates else (None, None)


def scope_cards(admin, allowed_ids, aliases):
    """None = all cards (attendance admins); else confirmed card keys of the allowed persons only."""
    if admin: return None
    ids = {str(x) for x in allowed_ids}
    return {a['alias_key'] for a in aliases if a['kind'] == 'card' and a['status'] == 'confirmed' and str(a.get('person_id')) in ids}


def compose(days_rows, override_rows, alias_by_card, people_by_id, admin):
    """GET 'cards' payload: raw rows ordered by date + overrides keyed by date; person only for a confirmed mapping."""
    cards = {}
    for d in sorted(days_rows, key=lambda r: (r['card_no'], r['date_j'])):
        c = cards.setdefault(d['card_no'], {'cardNo': d['card_no'], 'rows': [], 'overrides': {}, '_last': d})
        c['rows'].append(json.loads(d['raw_json']))
        c['_last'] = d
    for o in override_rows:
        if o['card_no'] in cards: cards[o['card_no']]['overrides'][o['date_j']] = json.loads(o['fields'])
    out = []
    for no in sorted(cards, key=lambda k: (len(k), k)):
        c = cards[no]; last = c.pop('_last')
        a = alias_by_card.get(no) or {}
        mapping = a.get('status') if a.get('status') in ('confirmed', 'suggested', 'review') else 'none'
        pid = a.get('person_id') if mapping == 'confirmed' or (admin and mapping == 'suggested') else None
        pid = str(pid) if pid is not None else None
        out.append({'cardNo': no, 'sheetName': last['sheet_name'], 'rawName': last.get('person_name'), 'personId': pid,
                    'personName': (people_by_id.get(pid) or {}).get('name') if pid else None, 'mapping': mapping, 'rows': c['rows'], 'overrides': c['overrides']})
    return out
