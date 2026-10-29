"""Allow-listed, read-only handlers. No credentials in queued payloads."""
from datetime import datetime
from zoneinfo import ZoneInfo

from aromin_security import PublicPermissionError
import aromin_performance as perf


def execute(job):
    import server
    import validate_ledger
    from aromin_jobs import validate

    payload = validate(job['kind'], job['payload'])
    tenant = job['tenant']
    full = server._tenant_full(tenant)
    users, _ = server._kb_directory(tenant)
    rec = users.get(job['requested_by']) or {}
    if not full or rec.get('role') != 'manager' or server._must_change(rec):
        raise PublicPermissionError('دسترسی درخواست‌کننده دیگر معتبر نیست.')
    if rec.get('person') and any(p.get('name') == rec['person'] and p.get('inactive') for p in full.get('people', []) if isinstance(p, dict)):
        raise PublicPermissionError('حساب درخواست‌کننده غیرفعال است.')
    if job['kind'] == 'ledger_audit':
        return validate_ledger.validate(full, payload['fy'])
    people = perf.select(perf.directory(full, {'user': job['requested_by'], 'role': 'manager'}, users), payload['person'], payload['unit'])
    start, end = payload['start'], payload['end']

    def stamp_to_j(stamp):
        dt = datetime.fromtimestamp(float(stamp) / 1000, ZoneInfo('Asia/Tehran'))
        return '%04d/%02d/%02d' % tuple(server._jalali(dt.year, dt.month, dt.day))

    rows, issues = perf.records(full, people, stamp_to_j)
    ids = {str(p['id']) for p in people}
    calls = server._perf_call_records(tenant, start, end, ids)
    tickets = server._perf_ticket_records(tenant, start, end, ids)
    rows = perf.in_period(rows + (calls or []) + (tickets or []), start, end)
    result = []
    for person in people:
        pid = str(person['id'])
        warnings = [i for i in issues if i['personId'] == pid]
        if calls is None:
            warnings.append({'personId': pid, 'metric': list(perf.CALL_METRICS) + ['support_activity'], 'reason': 'منبع تماس در دسترس نیست.'})
        if tickets is None:
            warnings.append({'personId': pid, 'metric': ['tickets', 'support_activity'], 'reason': 'منبع تیکت در دسترس نیست.'})
        result.append({**perf.public_person(person), 'metrics': perf.metrics(perf.UNITS.get(person.get('role'), 'other'),
                      [r for r in rows if r['personId'] == pid], warnings, start, end, full.get('ts'))})
    return {'period': {'from': start, 'to': end}, 'people': result, 'sources': {'calls': calls is not None, 'tickets': tickets is not None},
            'generatedAt': datetime.now(ZoneInfo('Asia/Tehran')).isoformat(),
            'notes': ['نقش فعلی؛ تاریخچهٔ انتقال نقش هنوز در این گزارش اعمال نشده است.',
                      'موفقیت اجرای کار به معنای کامل‌بودن دادهٔ منابع نیست.']}
