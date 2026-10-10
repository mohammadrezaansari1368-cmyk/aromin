"""Identity map (WP-A): alias (card / Julio id / extension / name) -> people[].id. Pure: no DB, no FastAPI.
Never guesses: a card is never auto-confirmed and a first-name conflict is only a review candidate."""
import json
import math
import re

KINDS = ('card', 'julio', 'ext', 'name')
SOURCES = ('attendance', 'tasks', 'calllog', 'callsummary', 'manual', 'migration')
STATUSES = ('confirmed', 'suggested', 'review', 'rejected')
TITLES = ('اقای', 'اقا', 'خانم', 'جناب', 'سرکار', 'مهندس', 'دکتر')   # after normalization (آ→ا)
RANK = {'exact': 3, 'strong': 2, 'weak': 1}
_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
_CHARS = str.maketrans({'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ؤ': 'و',
                        '‌': ' ', ' ': ' ', '‎': ' ', '‏': ' ', 'ـ': ' '})
_DIACRITICS = re.compile('[ً-ْٰ]')


def normalize_name(s):
    if s is None: return ''
    s = _DIACRITICS.sub('', str(s).translate(_CHARS).translate(_DIGITS))
    return re.sub(r'\s+', ' ', s).strip().lower()


def normalize_key(kind, raw):
    """card/julio/ext → ASCII digits without leading zeros ('09', 9.0, '۹ ' → '9'); name → normalize_name; None if invalid."""
    if kind not in KINDS or raw is None or isinstance(raw, bool): return None
    if kind == 'name':
        key = normalize_name(raw)
        return key[:191] if key else None
    if isinstance(raw, float):
        if not math.isfinite(raw) or raw != int(raw) or raw < 0: return None
        raw = int(raw)
    m = re.fullmatch(r'([0-9]{1,32})(?:\.0+)?', str(raw).translate(_DIGITS).strip())
    return (m.group(1).lstrip('0') or '0') if m else None


def strip_titles(s):
    toks = normalize_name(s).split()
    while toks and toks[0] in TITLES: toks.pop(0)
    return ' '.join(toks)


def split_name(s):
    toks = strip_titles(s).split()
    if len(toks) <= 1: return '', toks
    return toks[0], toks[1:]


def people_of(full):
    """[{id(str), name, role, inactive}] from the tenant blob; same id rules as aromin_performance.directory()."""
    people = [p for p in (full or {}).get('people', []) if isinstance(p, dict)]
    if any(p.get('id') is None or not p.get('name') for p in people): raise ValueError('شناسه یا نام شخص ناقص است؛ مدیر نگاشت را اصلاح کند.')
    ids = [str(p['id']) for p in people]
    if len(ids) != len(set(ids)): raise ValueError('شناسه تکراری اشخاص؛ نگاشت باید اصلاح شود.')
    return [{'id': str(p['id']), 'name': str(p['name']), 'role': p.get('role') or '', 'inactive': bool(p.get('inactive'))} for p in people]


def _surname(a, p):
    """'eq' when equal with spaces removed; 'prefix' for a two-part surname (token lists are prefixes, tokens ≥3 letters)."""
    if not a or not p: return None
    if ''.join(a) == ''.join(p): return 'eq'
    short, long_ = (a, p) if len(a) < len(p) else (p, a)
    if len(short) < len(long_) and long_[:len(short)] == short and all(len(t) >= 3 for t in short): return 'prefix'
    return None


def _level(raw_name, person):
    af, al = split_name(raw_name)
    pf, pl = split_name(person['name'])
    sur = _surname(al, pl)
    if not sur: return None, []
    reasons = ['last_name' if sur == 'eq' else 'two_part_surname']
    if af and pf and af == pf:
        level = 'exact' if al == pl else 'strong'
        if level == 'strong' and sur == 'eq': reasons.append('spacing')
    else:
        level = 'weak'
        reasons.append('first_name_conflict' if af and pf else 'first_name_missing')
    if person.get('inactive'): reasons.append('inactive')
    return level, reasons


def match(raw_name, people):
    """{confidence: exact|strong|weak|ambiguous|none, candidates:[{personId, confidence, reasons}] (best first, max 5)}."""
    ids = [str(p['id']) for p in people]
    if len(ids) != len(set(ids)): raise ValueError('شناسه تکراری اشخاص؛ نگاشت باید اصلاح شود.')
    found = []
    for p in people:
        level, reasons = _level(raw_name, p)
        if level: found.append({'personId': str(p['id']), 'confidence': level, 'reasons': reasons})
    found.sort(key=lambda c: (-RANK[c['confidence']], c['personId']))
    if not found: return {'confidence': 'none', 'candidates': []}
    best = [c for c in found if c['confidence'] == found[0]['confidence']]
    return {'confidence': found[0]['confidence'] if len(best) == 1 else 'ambiguous', 'candidates': found[:5]}


def auto_status(kind, m):
    """(status, person_id): only julio/ext/name with a unique exact match auto-confirm; a card at most becomes 'suggested'."""
    conf = m.get('confidence')
    pid = m['candidates'][0]['personId'] if conf in ('exact', 'strong') else None
    if conf == 'exact': return ('suggested' if kind == 'card' else 'confirmed'), pid
    if conf == 'strong': return 'suggested', pid
    return 'review', None


def merge_alias(existing, kind, key, raw, source, m, hint=None, now=None):
    """Row to write, or None when untouched. A human confirm/reject is never overwritten; a stale auto-confirm is demoted.
    hint = personId of a local manual link (migration): stored as 'suggested' with reason local_manual_link, never confirmed."""
    if existing and existing.get('status') in ('confirmed', 'rejected') and existing.get('decided_by') != 'auto': return None
    status, pid = auto_status(kind, m)
    cands = [dict(c) for c in m.get('candidates') or []]
    if hint is not None and status != 'confirmed':
        hint = str(hint)
        c = next((c for c in cands if c['personId'] == hint), None)
        if c is None:
            c = {'personId': hint, 'confidence': 'none', 'reasons': []}
            cands.insert(0, c)
        c['reasons'] = c['reasons'] + ['local_manual_link']
        status, pid = 'suggested', hint
    if existing and existing.get('status') == 'confirmed' and status != 'confirmed': status, pid = 'review', None
    row = {'kind': kind, 'alias_key': key, 'raw_value': str(raw or key)[:255], 'source': source, 'person_id': pid, 'status': status,
           'confidence': m.get('confidence') or 'none', 'candidates': json.dumps(cands[:5], ensure_ascii=False, sort_keys=True),
           'decided_by': 'auto' if status == 'confirmed' else None}
    if existing and all(existing.get(k) == v for k, v in row.items() if k != 'source'): return None
    row['decided_at'] = (existing.get('decided_at') if existing and existing.get('decided_by') == 'auto' else now) if status == 'confirmed' else None
    return row


def _iso(v):
    return v.isoformat() if hasattr(v, 'isoformat') else v


def public_alias(row, people_by_id):
    try: cands = json.loads(row.get('candidates') or '[]')
    except ValueError: cands = []
    name = lambda pid: (people_by_id.get(str(pid)) or {}).get('name') if pid is not None else None
    return {'id': row.get('id'), 'kind': row['kind'], 'key': row['alias_key'], 'raw': row['raw_value'], 'source': row['source'],
            'personId': row.get('person_id'), 'personName': name(row.get('person_id')), 'status': row['status'], 'confidence': row['confidence'],
            'candidates': [dict(c, personName=name(c.get('personId'))) for c in cands], 'decidedBy': row.get('decided_by'),
            'decidedAt': _iso(row.get('decided_at')), 'updatedAt': _iso(row.get('updated_at'))}
