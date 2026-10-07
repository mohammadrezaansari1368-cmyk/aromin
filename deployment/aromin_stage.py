"""ستونِ «تغییر مرحله»ِ Joolio — همتای دقیقِ frontend/src/lib/stage-change.ts (همان بردارهای آزمون:
deployment/tests/fixtures/stage_change_vectors.json). تنها منبعِ سالِ مالی، تاریخِ کاملِ فروش و ساعت؛ بدونِ حدس."""
import re

STAGE_CHANGE_HEADER = "تغییر مرحله"
_LATIN = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_TIME = r"(\d{1,2}):(\d{2})(?::(\d{2}))?"
_DATE = r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})"
_TIME_FIRST = re.compile(r"^%s\s+%s$" % (_TIME, _DATE))
_DATE_FIRST = re.compile(r"^%s(?:\s+%s)?$" % (_DATE, _TIME))


def header_key(s):
    s = re.sub(r"[‌‏‎]", "", str("" if s is None else s))
    s = re.sub(r"\s+", "", s)
    return re.sub("[يیى]", "ی", s).replace("ك", "ک").strip()


def find_stage_change_column(keys):
    """(نامِ ستون, None) یا (None, خطا). فقط هدرِ دقیق؛ نسخه‌های تکراری = چندمعنایی."""
    want = header_key(STAGE_CHANGE_HEADER)
    hits = [k for k in keys if header_key(k) == want or re.sub(r"_\d+$", "", header_key(k)) == want]
    if not hits:
        return None, "ستونِ «%s» پیدا نشد" % STAGE_CHANGE_HEADER
    if len(hits) > 1:
        return None, "ستونِ «%s» چند بار آمده؛ مبهم است" % STAGE_CHANGE_HEADER
    return hits[0], None


def _j2g(jy, jm, jd):
    """همان الگوریتمِ j2gِ frontend/src/lib/jalali.ts و _j2gِ server.py"""
    gy = 621 if jy <= 979 else 1600
    jyy = jy if jy <= 979 else jy - 979
    days = 365 * jyy + (jyy // 33) * 8 + ((jyy % 33) + 3) // 4 + 78 + jd + ((jm - 1) * 31 if jm < 7 else (jm - 7) * 30 + 186)
    gy += 400 * (days // 146097)
    days %= 146097
    if days > 36524:
        days -= 1
        gy += 100 * (days // 36524)
        days %= 36524
        if days >= 365:
            days += 1
    gy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        gy += (days - 1) // 365
        days = (days - 1) % 365
    leap = (gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0
    sal = [0, 31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 1
    while gm <= 12 and days >= sal[gm]:
        days -= sal[gm]
        gm += 1
    return gy, gm, days + 1


def jalali_valid(y, m, d):
    if not (1300 <= y <= 1500 and 1 <= m <= 12 and 1 <= d <= (31 if m <= 6 else 30)):
        return False
    if m == 12 and d == 30 and _j2g(y, 12, 30) == _j2g(y + 1, 1, 1):
        return False
    return True


def parse_stage_change(value):
    """{'ok': True, raw, date, time, fy} یا {'ok': False, raw, error}"""
    if value is None or (isinstance(value, str) and not value.strip()):
        return {"ok": False, "raw": "" if value is None else str(value), "error": "empty"}
    if not isinstance(value, str):
        return {"ok": False, "raw": str(value), "error": "not_text"}
    raw = value
    s = re.sub(r"\s+", " ", value.translate(_LATIN)).strip()
    m = _TIME_FIRST.match(s)
    if m:
        h, mi, se, y, mo, d = m.groups()
    else:
        m = _DATE_FIRST.match(s)
        if not m:
            return {"ok": False, "raw": raw, "error": "bad_format"}
        y, mo, d, h, mi, se = m.groups()
    y, mo, d = int(y), int(mo), int(d)
    if not jalali_valid(y, mo, d):
        return {"ok": False, "raw": raw, "error": "invalid_date"}
    time = ""
    if h is not None:
        if int(h) > 23 or int(mi) > 59 or (se is not None and int(se) > 59):
            return {"ok": False, "raw": raw, "error": "invalid_time"}
        time = "%02d:%02d" % (int(h), int(mi)) + (":%02d" % int(se) if se is not None else "")
    date = "%04d/%02d/%02d" % (y, mo, d)
    return {"ok": True, "raw": raw, "date": date, "time": time, "fy": date[:4]}


def known_fiscal_years(full):
    out = {str(y) for y in ((full or {}).get("years") or {}) if re.fullmatch(r"\d{4}", str(y))}
    fy = str((full or {}).get("fy") or "")
    if re.fullmatch(r"\d{4}", fy):
        out.add(fy)
    return out
