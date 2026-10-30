"""Pure tabular Islamic holidays; observation corrections are explicit configuration."""
from datetime import date, timedelta
from aromin_stage import _j2g, _jalali, parse_stage_change

SOLAR = {
    '01/01':'نوروز', '01/02':'نوروز', '01/03':'نوروز', '01/04':'نوروز',
    '01/12':'روز جمهوری اسلامی', '01/13':'روز طبیعت', '03/14':'رحلت امام خمینی',
    '03/15':'قیام پانزده خرداد', '11/22':'پیروزی انقلاب اسلامی', '12/29':'ملی شدن صنعت نفت',
}
LUNAR = (
    (1,9,'تاسوعا'), (1,10,'عاشورا'), (2,20,'اربعین'),
    (2,28,'رحلت پیامبر و شهادت امام حسن'), (2,0,'شهادت امام رضا'),
    (3,8,'شهادت امام حسن عسکری'), (3,17,'میلاد پیامبر و امام صادق'),
    (6,3,'شهادت حضرت فاطمه'), (7,13,'ولادت امام علی'), (7,27,'مبعث'),
    (8,15,'نیمه شعبان'), (9,21,'شهادت امام علی'), (10,1,'عید فطر'),
    (10,2,'تعطیل عید فطر'), (10,25,'شهادت امام صادق'),
    (12,10,'عید قربان'), (12,18,'عید غدیر'),
)


def hijri_to_gregorian(year, month, day):
    """Civil tabular epoch: 1 Muharram 1 = Gregorian 622-07-19."""
    days = (year-1)*354 + (3+11*year)//30 + 29*(month-1) + month//2 + day-1
    return date(622,7,19) + timedelta(days=days)


def _valid(raw):
    parsed = parse_stage_change(raw)
    return parsed.get('date') if parsed.get('ok') else None


def _range(start, end):
    if _valid(start) != start or _valid(end) != end or start > end:
        raise ValueError('Invalid Jalali range')
    return date(*_j2g(*map(int,start.split('/')))), date(*_j2g(*map(int,end.split('/'))))


def _add(out, day, name):
    out[day] = out[day] + ' / ' + name if day in out else name


def official_holidays_named(start, end):
    first, last = _range(start,end)
    out = {}
    for year in range(int(start[:4]),int(end[:4])+1):
        for md, name in SOLAR.items():
            key = f'{year:04d}/{md}'
            if start <= key <= end: _add(out,key,name)
    # Conservative year bounds include both adjacent Hijri years.
    lo = max(1, (first-date(622,7,19)).days//355)
    hi = (last-date(622,7,19)).days//354+2
    for year in range(lo,hi+1):
        for month, day, name in LUNAR:
            g = (hijri_to_gregorian(year,month+1,1)-timedelta(days=1)
                 if day == 0 else hijri_to_gregorian(year,month,day))
            if first <= g <= last:
                _add(out,'%04d/%02d/%02d' % _jalali(g.year,g.month,g.day),name)
    return dict(sorted(out.items()))


def official_holidays(start_j, end_j):
    return set(official_holidays_named(start_j,end_j))


def effective_holidays_named(start, end, cfg=None, attendance=()):
    """Adjust computed dates simultaneously, then union independent closures.

    Attendance/extra closures survive cancellation of an official holiday.
    Sources outside the queried range may move into it.
    """
    cfg = cfg or {}
    adjustments = cfg.get('holidayAdjust') or {}
    valid = {s:t for s,t in adjustments.items() if _valid(s) == s and (t is None or _valid(t) == t)}
    sources = official_holidays_named(min([start]+list(valid)),max([end]+list(valid)))
    out = {}
    for source, name in sources.items():
        target = valid.get(source,source)
        if target is not None and start <= target <= end: _add(out,target,name)
    for raw in list(attendance)+list(cfg.get('extraHolidays') or [])+list(cfg.get('holidays') or []):
        day = _valid(raw)
        if day and start <= day <= end and day not in out: out[day] = 'تعطیلی موردی'
    return dict(sorted(out.items()))
