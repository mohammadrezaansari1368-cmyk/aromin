"""گزارشِ اعتبارسنجیِ دفترِ فروش پس از ایمپورت — فقط خواندن (بدونِ قفل و بدونِ هیچ نوشتنی).

  python validate_ledger.py --tenant team [--fy 1405] [--json FILE]

به تفکیکِ کارشناس و ماه: تعدادِ ردیف، فاکتور و مبلغ؛ و بررسی‌های سلامت:
  duplicate_invoice  شمارهٔ فاکتورِ تکراری میان فاکتورهای (معاملهٔ بسته) کلِ دفتر
  missing_raw        مقدارِ خامِ «تغییر مرحله» (stageChangedAt) ذخیره نشده
  raw_invalid        مقدارِ خام با قاعدهٔ مشترک (aromin_stage) خوانده نمی‌شود
  fy_mismatch        سالِ مقدارِ خام ≠ سالِ دفتر
  date_mismatch      تاریخ/ساعتِ ثبت‌شده ≠ تاریخ/ساعتِ مقدارِ خام
  month_mismatch     ماهِ ردیف ≠ ماهِ مقدارِ خام
  missing_sale_date  تاریخِ فروش ندارد
  inv_copy_mismatch  نسخهٔ inv با invY[fy] یکی نیست
و خلاصهٔ آخرین ایمپورت‌ها از importLog (سال‌های مالیِ فایل، تکراری، تعارض، نامعتبر به تفکیکِ کارشناس).
نامِ مشتری در خروجی نیست؛ فقط شمارهٔ معامله، شناسهٔ ردیف و نامِ کارشناس.
"""
import argparse
import json
import sys
from collections import defaultdict

from aromin_stage import parse_stage_change
from fix_stage_dates import invoice_key, is_won, locked

VERSION = 1
MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]
CHECKS = ("duplicate_invoice", "missing_raw", "raw_invalid", "fy_mismatch", "date_mismatch", "month_mismatch", "missing_sale_date", "inv_copy_mismatch")
SAMPLE = 50


def _amount(v):
    try:
        return float(str(v if v is not None else "").replace(",", "").strip() or 0)
    except ValueError:
        return 0.0


def _month(d):
    m = d.get("month")
    if m is None or m == "":
        return None
    try:
        return int(m)
    except (TypeError, ValueError):
        return None


def validate(full, fy="1405"):
    fy = str(fy)
    dates = ((full.get("saleDates") or {}).get(fy)) or {}
    times = ((full.get("saleTimes") or {}).get(fy)) or {}
    sellers = {}
    issues = {k: [] for k in CHECKS}
    by_key = defaultdict(list)
    tot = dict(rows=0, invoices=0, amount=0.0, locked=0)

    def flag(kind, p, d, **extra):
        issues[kind].append(dict(seller=p.get("name"), id=d.get("id"), no=d.get("no"), **extra))

    for p in full.get("people") or []:
        invy = p.get("invY") if isinstance(p.get("invY"), dict) else {}
        rows = invy.get(fy)
        if not isinstance(rows, list):
            rows = p.get("inv") if str(full.get("fy")) == fy and isinstance(p.get("inv"), list) else []
        elif str(full.get("fy")) == fy and isinstance(p.get("inv"), list) and p.get("inv") != rows:
            flag("inv_copy_mismatch", p, {}, inv=len(p["inv"]), invY=len(rows))
        if not rows:
            continue
        s = sellers.setdefault(p.get("name") or "—", dict(rows=0, invoices=0, amount=0.0, locked=0, months={}, issues=defaultdict(int)))
        for d in rows:
            if not isinstance(d, dict):
                continue
            won = is_won(d.get("funnel"))
            amt = _amount(d.get("amount")) if won else 0.0
            key = "%s:%s" % (p.get("id"), d.get("id"))
            m = _month(d)
            s["rows"] += 1
            tot["rows"] += 1
            if locked(d):
                s["locked"] += 1
                tot["locked"] += 1
            if won:
                s["invoices"] += 1
                s["amount"] += amt
                tot["invoices"] += 1
                tot["amount"] += amt
                k = invoice_key(d.get("no"))
                if k:
                    by_key[k].append((p, d))
            cell = s["months"].setdefault(str(m + 1) if m is not None else "?", dict(rows=0, invoices=0, amount=0.0))
            cell["rows"] += 1
            if won:
                cell["invoices"] += 1
                cell["amount"] += amt
            raw = d.get("stageChangedAt")
            sale_date = d.get("saleDate") or dates.get(key) or ""
            sale_time = d.get("saleTime") or times.get(key) or ""
            sc = parse_stage_change(raw) if raw not in (None, "") else None
            found = []
            if sc is None:
                found.append("missing_raw")
            elif not sc["ok"]:
                found.append("raw_invalid")
            else:
                if sc["fy"] != fy:
                    found.append("fy_mismatch")
                if (sale_date and sale_date != sc["date"]) or (sale_time and sale_time != sc["time"]):
                    found.append("date_mismatch")
                if m is not None and m != int(sc["date"][5:7]) - 1:
                    found.append("month_mismatch")
                sale_date = sale_date or sc["date"]
            if not sale_date:
                found.append("missing_sale_date")
            for kind in found:
                s["issues"][kind] += 1
                flag(kind, p, d)
    for k, hits in by_key.items():
        if len(hits) > 1:
            for p, d in hits:
                sellers[p.get("name") or "—"]["issues"]["duplicate_invoice"] += 1
                flag("duplicate_invoice", p, d, copies=len(hits))
    for s in sellers.values():
        s["issues"] = dict(s["issues"])
    imports = []
    for e in reversed(full.get("importLog") or []):
        if isinstance(e, dict) and e.get("type") == "deal":
            rep = e.get("report") or {}
            flagged = defaultdict(int)
            for x in rep.get("flagged") or []:
                flagged[x.get("st")] += 1
            imports.append(dict(name=e.get("name"), ts=e.get("ts"), rows=e.get("rows"), mode=e.get("mode"), counts=e.get("fy"),
                                by_seller={n: {k: v for k, v in r.items() if k != "months"} for n, r in (rep.get("bySeller") or {}).items()},
                                new_names=rep.get("newNames") or {}, flagged=dict(flagged), flagged_sample=(rep.get("flagged") or [])[:SAMPLE]))
            if len(imports) == 5:
                break
    return dict(version=VERSION, fy=fy, active_fy=str(full.get("fy")), totals=tot, sellers=sellers,
                checks={k: len(v) for k, v in issues.items()}, samples={k: v[:SAMPLE] for k, v in issues.items() if v}, imports=imports)


def text(r):
    out = ["دفترِ فروش %s (سالِ فعالِ سیستم %s)" % (r["fy"], r["active_fy"]),
           "کل: %d ردیف · %d فاکتور · مبلغ %s · %d سندِ قفل" % (r["totals"]["rows"], r["totals"]["invoices"], format(round(r["totals"]["amount"]), ","), r["totals"]["locked"]), ""]
    for name, s in sorted(r["sellers"].items(), key=lambda x: -x[1]["amount"]):
        months = " · ".join("%s %d" % (MONTHS[int(m) - 1] if m.isdigit() and 1 <= int(m) <= 12 else m, c["invoices"])
                            for m, c in sorted(s["months"].items(), key=lambda x: int(x[0]) if x[0].isdigit() else 99) if c["invoices"])
        out.append("%s: %d ردیف، %d فاکتور، %s%s" % (name, s["rows"], s["invoices"], format(round(s["amount"]), ","), " — قفل %d" % s["locked"] if s["locked"] else ""))
        if months:
            out.append("   فاکتور در ماه: " + months)
        if s["issues"]:
            out.append("   ⚠ " + "، ".join("%s %d" % kv for kv in sorted(s["issues"].items())))
    out += ["", "بررسی‌ها: " + "، ".join("%s=%d" % (k, r["checks"][k]) for k in CHECKS)]
    for e in r["imports"][:1]:
        c = e.get("counts") or {}
        out += ["", "آخرین ایمپورت: %s (%s ردیف، حالت %s)" % (e.get("name"), e.get("rows"), e.get("mode") or "—"),
                "   معتبر %s · سال‌های دیگر %s · تکراری %s · تعارض %s · نامعتبر %s · سال‌ها %s" % (
                    c.get("valid"), c.get("previous"), c.get("duplicate"), c.get("conflict", "—"), c.get("invalid"), json.dumps(c.get("years") or {}, ensure_ascii=False))]
        if e.get("new_names"):
            out.append("   نام‌های تازه: " + "، ".join("%s (%d)" % kv for kv in e["new_names"].items()))
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tenant", default="team")
    ap.add_argument("--fy", default="1405")
    ap.add_argument("--json", help="مسیرِ فایلِ گزارشِ کامل (JSON)")
    a = ap.parse_args(argv)
    import server  # همان پیکربندیِ DBِ سرویس (env)
    rows = server.q("SELECT payload FROM tenant_state WHERE tenant=%s", (a.tenant,))   # فقط خواندن، بدونِ قفل
    if not rows:
        print("کسب‌وکار پیدا نشد:", a.tenant)
        return 2
    r = validate(server.parse(rows[0]["payload"]), a.fy)
    r["tenant"] = a.tenant
    if a.json:
        json.dump(r, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(text(r))
    return 0


if __name__ == "__main__":
    sys.exit(main())
