"""اصلاحِ تاریخیِ سالِ مالی / تاریخِ فروش / ساعت از «تغییر مرحله» — بدونِ حذف یا آپلودِ مجددِ معاملات.  نسخه: 1

منبعِ هر معامله (به ترتیب):
  1. مقدارِ خامِ ذخیره‌شده روی همان رکورد (stageChangedAt)؛
  2. فایلِ منبعِ استخراج‌شده از خروجی‌های اصلیِ Joolio (tools/extract_stage_source.py) — تطبیق فقط با شمارهٔ معامله
     (invoiceKey) + وضعیتِ قیف + هشِ نامِ مشتری؛ چند مقدارِ متفاوت = مبهم.
فقط saleDate، saleTime، month (مشتقِ تاریخ) و stageChangedAt (فقط اگر خالی) تغییر می‌کنند. سندِ قفل (در انتظار تصویب/
تصویب/بسته) هرگز تغییر نمی‌کند: فقط تاریخ/ساعتِ خالی‌اش در نقشهٔ saleDates/saleTimes تکمیل می‌شود (همان رفتارِ ایمپورت).
وضعیت/تأییدکننده/حسابدار (fin*)، مرحله‌ها، وزن‌ها، مشارکتِ مدیر، مبلغ و ... دست نمی‌خورند. اختلافِ سالِ مالی فقط گزارش می‌شود.

  python fix_stage_dates.py --tenant team [--source stage-source.json]            # dry-run (پیش‌فرض)
  python fix_stage_dates.py --tenant team [--source ...] --apply                  # بکاپ + تراکنش + ممیزی
  python fix_stage_dates.py --tenant team --rollback RUN_ID                       # برگشتِ کنترل‌شده
"""
import argparse
import hashlib
import json
import re
import sys
import time
import uuid

from aromin_stage import parse_stage_change

VERSION = 1
LOCK_STATES = ("submitted", "approved")
PROTECTED = ("finState", "finApproval", "finAudit", "finClosed", "finReopen", "finBy", "stages", "close", "mgrShare",
             "funnel", "amount", "no", "name", "settle", "kind", "channel", "leadGen", "supportGen", "supportSla")
_FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def invoice_key(no):
    """همان invoiceKeyِ frontend/src/engines/commission/index.ts"""
    s = str("" if no is None else no).translate(_FA)
    s = re.sub("[يیى]", "ی", s).replace("ك", "ک")
    return re.sub(r"[\s‌]+", "", s).lower()


def name_hash(v):
    s = re.sub(r"[\s‌]+", " ", str(v or "")).strip()
    s = re.sub("[يیى]", "ی", s).replace("ك", "ک")
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:16] if s else ""


def is_won(funnel):
    return (funnel or "won") == "won"


def locked(d):
    return bool(d.get("finClosed")) or d.get("finState") in LOCK_STATES


def _deal_copies(full):
    """(pid, fy, id) → همهٔ نسخه‌های همان معامله (inv و invY[fy]) تا تغییر روی همه یکسان اعمال شود."""
    out = {}
    active = str(full.get("fy") or "")
    for p in full.get("people") or []:
        if not isinstance(p, dict):
            continue
        seen = {}
        for fy, arr in (p.get("invY") or {}).items():
            for d in arr or []:
                if isinstance(d, dict):
                    seen.setdefault((str(fy), str(d.get("id"))), []).append(d)
        for d in p.get("inv") or []:
            if isinstance(d, dict) and active:
                seen.setdefault((active, str(d.get("id"))), [])
                if not any(x is d for x in seen[(active, str(d.get("id")))]):
                    seen[(active, str(d.get("id")))].append(d)
        for (fy, did), ds in seen.items():
            out[(str(p.get("id")), fy, did)] = ds
    return out


def _resolve(d, sources):
    """(parsed, origin, reason). origin: raw|file."""
    raw = d.get("stageChangedAt")
    if raw not in (None, ""):
        r = parse_stage_change(raw)
        return (r, "raw", "") if r["ok"] else (None, "raw", "invalid_source")
    rows = sources.get(invoice_key(d.get("no"))) if sources else None
    if not rows:
        return None, "", "no_source"
    rows = [x for x in rows if bool(x.get("won")) == is_won(d.get("funnel"))]
    if not rows:
        return None, "file", "no_source"
    nh = name_hash(d.get("name"))
    if nh and any(x.get("name_h") and nh not in x.get("name_h") for x in rows):
        return None, "file", "ambiguous_name"
    parsed = [parse_stage_change(x.get("raw")) if x.get("raw_type", "str") in ("str", "NoneType") else {"ok": False, "error": "not_text"} for x in rows]
    if any(not p["ok"] for p in parsed):
        return None, "file", "invalid_source"
    ok = {(p["date"], p["time"]): p for p in parsed if p["ok"]}
    if not ok:
        return None, "file", "invalid_source"
    if len(ok) > 1:
        return None, "file", "ambiguous_value"
    return next(iter(ok.values())), "file", ""


def plan_fix(full, sources=None):
    """بدونِ نوشتن: (changes, report). change = {key, fy, target: deal|saleDates|saleTimes, field, before, after}"""
    rep = dict(checked=0, changed=0, unchanged=0, no_source=0, invalid_source=0, ambiguous=0, fy_mismatch=0,
               locked_conflict=0, locked_month_mismatch=0, from_raw=0, from_file=0)
    issues, changes = [], []
    sale_dates, sale_times = full.get("saleDates") or {}, full.get("saleTimes") or {}
    for (pid, fy, did), ds in sorted(_deal_copies(full).items()):
        d = ds[0]
        key = "%s:%s" % (pid, did)
        rep["checked"] += 1
        # Divergent copies cannot share a single before/after audit safely.
        fields = PROTECTED + ("saleDate", "saleTime", "month", "stageChangedAt")
        if any(any(x.get(f) != d.get(f) for f in fields) for x in ds[1:]):
            rep["ambiguous"] += 1
            issues.append(dict(key=key, fy=fy, no=d.get("no"), reason="ambiguous_copies"))
            continue
        sc, origin, why = _resolve(d, sources)
        if not sc:
            bucket = "ambiguous" if why.startswith("ambiguous") else why
            rep[bucket] += 1
            issues.append(dict(key=key, fy=fy, no=d.get("no"), reason=why))
            continue
        rep["from_" + origin] += 1
        if sc["fy"] != fy:
            rep["fy_mismatch"] += 1
            issues.append(dict(key=key, fy=fy, no=d.get("no"), reason="fy_mismatch", source_fy=sc["fy"]))
            continue
        mine = []
        month = int(sc["date"][5:7]) - 1
        if not locked(d):
            if str(d.get("saleDate") or "") != sc["date"]:
                mine.append(("deal", "saleDate", d.get("saleDate"), sc["date"]))
            if sc["time"] and str(d.get("saleTime") or "") != sc["time"]:
                mine.append(("deal", "saleTime", d.get("saleTime"), sc["time"]))
            if d.get("month") in (None, "") or int(d.get("month")) != month:
                mine.append(("deal", "month", d.get("month"), month))
            if origin == "file" and not d.get("stageChangedAt"):
                mine.append(("deal", "stageChangedAt", d.get("stageChangedAt"), sc["raw"]))
        else:
            cur = str(d.get("saleDate") or "")
            map_date = (sale_dates.get(fy) or {}).get(key)
            map_time = (sale_times.get(fy) or {}).get(key)
            time_conflict = sc["time"] and (d.get("saleTime") or map_time) and (d.get("saleTime") or map_time) != sc["time"]
            if (cur and cur != sc["date"]) or (not cur and map_date and map_date != sc["date"]) or time_conflict:
                rep["locked_conflict"] += 1
                issues.append(dict(key=key, fy=fy, no=d.get("no"), reason="locked_conflict"))
                continue
            if not cur and not (sale_dates.get(fy) or {}).get(key):
                mine.append(("saleDates", key, (sale_dates.get(fy) or {}).get(key), sc["date"]))
            if sc["time"] and not d.get("saleTime") and not (sale_times.get(fy) or {}).get(key):
                mine.append(("saleTimes", key, (sale_times.get(fy) or {}).get(key), sc["time"]))
            if d.get("month") not in (None, "") and int(d.get("month")) != month:
                rep["locked_month_mismatch"] += 1
                issues.append(dict(key=key, fy=fy, no=d.get("no"), reason="locked_month_mismatch"))
        if mine:
            rep["changed"] += 1
            changes += [dict(key=key, fy=fy, target=t, field=f, before=b, after=a) for t, f, b, a in mine]
        else:
            rep["unchanged"] += 1
    return changes, rep, issues


def apply_changes(full, changes):
    copies = _deal_copies(full)
    for c in changes:
        pid, did = c["key"].split(":", 1)
        if c["target"] == "deal":
            for d in copies[(pid, c["fy"], did)]:
                d[c["field"]] = c["after"]
        else:
            full.setdefault(c["target"], {}).setdefault(c["fy"], {})[c["field"]] = c["after"]
    return full


def rollback_changes(full, audit):
    """برگشتِ کنترل‌شده: فقط اگر مقدارِ فعلی هنوز همان «after» باشد؛ ویرایشِ بعدیِ کاربر بازنویسی نمی‌شود."""
    copies, done, skipped = _deal_copies(full), 0, []
    for c in reversed(audit):
        pid, did = c["key"].split(":", 1)
        if c["target"] == "deal":
            ds = copies.get((pid, c["fy"], did)) or []
            if not ds or any(locked(d) or d.get(c["field"]) != c["after"] for d in ds):
                skipped.append(c)
                continue
            for d in ds:
                if c["before"] is None:
                    d.pop(c["field"], None)
                else:
                    d[c["field"]] = c["before"]
        else:
            m = (full.get(c["target"]) or {}).get(c["fy"]) or {}
            if m.get(c["field"]) != c["after"]:
                skipped.append(c)
                continue
            if c["before"] is None:
                m.pop(c["field"], None)
            else:
                m[c["field"]] = c["before"]
        done += 1
    return done, skipped


# ---------------- اجرا روی MariaDB (همان اتصالِ server.py) ----------------
AUDIT_DDL = """CREATE TABLE IF NOT EXISTS data_fix_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, run_id VARCHAR(40) NOT NULL, tool VARCHAR(40) NOT NULL, tenant VARCHAR(64) NOT NULL,
    deal_key VARCHAR(80) NOT NULL, fy VARCHAR(8) NOT NULL, target VARCHAR(16) NOT NULL, field VARCHAR(80) NOT NULL,
    before_v TEXT NULL, after_v TEXT NULL, at DATETIME NOT NULL, rolled_back DATETIME NULL,
    KEY ix_dfa_run (run_id), KEY ix_dfa_tenant (tenant, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""


def _load_sources(path):
    if not path:
        return None
    data = json.load(open(path, encoding="utf-8"))
    out = {}
    for r in data.get("rows") or []:
        out.setdefault(invoice_key(r.get("deal")), []).append(r)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tenant", default="team")
    ap.add_argument("--source", help="JSONِ استخراج‌شده از خروجی‌های اصلیِ Joolio")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="اجرای واقعی (پیش‌فرض: dry-run)")
    mode.add_argument("--rollback", metavar="RUN_ID")
    ap.add_argument("--report", help="مسیرِ فایلِ گزارشِ JSON")
    a = ap.parse_args(argv)
    import server  # همان پیکربندیِ DBِ سرویس (env)
    cx = server.db_conn()
    cx.autocommit(False)
    try:
        with cx.cursor() as cur:
            if a.apply or a.rollback:
                # DDL before the row lock; backup failures must abort, never be swallowed.
                cur.execute(AUDIT_DDL)
                server.ensure_backup_table()
            cur.execute("SELECT payload FROM tenant_state WHERE tenant=%s" + (" FOR UPDATE" if a.apply or a.rollback else ""), (a.tenant,))   # کنترلِ هم‌زمانی
            row = cur.fetchone()
            if not row:
                print("کسب‌وکار پیدا نشد:", a.tenant)
                return 2
            full = server.parse(row["payload"])
            if a.rollback:
                cur.execute("SELECT id, deal_key, fy, target, field, before_v, after_v FROM data_fix_audit WHERE run_id=%s AND tenant=%s AND rolled_back IS NULL ORDER BY id", (a.rollback, a.tenant))
                audit = [dict(audit_id=r["id"], key=r["deal_key"], fy=r["fy"], target=r["target"], field=r["field"],
                              before=json.loads(r["before_v"]) if r["before_v"] is not None else None,
                              after=json.loads(r["after_v"]) if r["after_v"] is not None else None) for r in cur.fetchall()]
                cur.execute("INSERT INTO tenant_backups (tenant, tag, payload) VALUES (%s,%s,%s)", (a.tenant, "pre-rollback-" + a.rollback[:20], server.j(full)))
                done, skipped = rollback_changes(full, audit)
                cur.execute("UPDATE tenant_state SET payload=%s WHERE tenant=%s", (server.j(full), a.tenant))
                for c in audit:
                    if c not in skipped:
                        cur.execute("UPDATE data_fix_audit SET rolled_back=NOW() WHERE id=%s AND tenant=%s", (c["audit_id"], a.tenant))
                cx.commit()
                print(json.dumps({"rollback": a.rollback, "reverted": done, "skipped_changed_since": len(skipped)}, ensure_ascii=False))
                return 0
            changes, rep, issues = plan_fix(full, _load_sources(a.source))
            out = {"version": VERSION, "tenant": a.tenant, "mode": "apply" if a.apply else "dry-run", "report": rep,
                   "fields_changed": len(changes), "issues_sample": issues[:50]}
            if a.apply and changes:
                run = "stage-%s-%s" % (time.strftime("%Y%m%d%H%M%S"), uuid.uuid4().hex[:6])
                cur.execute("INSERT INTO tenant_backups (tenant, tag, payload) VALUES (%s,%s,%s)", (a.tenant, "pre-" + run[:40], server.j(full)))
                for i in range(0, len(changes), 500):   # پیشرفت به‌صورتِ دسته‌ای
                    for c in changes[i:i + 500]:
                        cur.execute("INSERT INTO data_fix_audit (run_id, tool, tenant, deal_key, fy, target, field, before_v, after_v, at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())",
                                    (run, "fix_stage_dates.v%d" % VERSION, a.tenant, c["key"], c["fy"], c["target"], c["field"],
                                     json.dumps(c["before"], ensure_ascii=False) if c["before"] is not None else None,
                                     json.dumps(c["after"], ensure_ascii=False)))
                    print("  … %d/%d" % (min(i + 500, len(changes)), len(changes)), file=sys.stderr)
                apply_changes(full, changes)
                full["ts"] = int(time.time() * 1000)
                cur.execute("UPDATE tenant_state SET payload=%s WHERE tenant=%s", (server.j(full), a.tenant))
                out["run_id"] = run
            cx.commit()
            if a.report:
                json.dump(dict(out, issues=issues, changes=changes), open(a.report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print(json.dumps(out, ensure_ascii=False, indent=1))
            return 0
    except Exception:
        cx.rollback()
        raise
    finally:
        cx.close()


if __name__ == "__main__":
    sys.exit(main())
