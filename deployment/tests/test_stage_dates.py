"""«تغییر مرحله» (پایتون)، اصلاحِ تاریخی بدونِ آپلودِ مجدد، و مسیرِ سروریِ تأیید مالی — آفلاین، بدونِ دیتابیس."""
import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import aromin_stage as stage  # noqa: E402
import fix_stage_dates as fix  # noqa: E402
import server  # noqa: E402

V = json.loads((HERE / "tests/fixtures/stage_change_vectors.json").read_text(encoding="utf-8"))


class SharedVectors(unittest.TestCase):
    def test_same_results_as_typescript(self):
        for c in V["cases"]:
            r = stage.parse_stage_change(c["in"])
            self.assertEqual(r["ok"], c["ok"], c)
            for k in ("date", "time", "fy", "error"):
                if k in c:
                    self.assertEqual(r[k], c[k], c)
        for h in V["headers"]:
            col, err = stage.find_stage_change_column(h["keys"])
            self.assertEqual(bool(err), bool(h.get("error")), h)
            if not h.get("error"):
                self.assertEqual(col, h["col"])


def deal(**o):
    d = dict(id=1, no="4699", name="کافه رشت", month=0, amount="100", funnel="won", stages=["lead", "close"], mgrShare=True)
    d.update(o)
    return d


def blob(deals, extra=None):
    inv = [copy.deepcopy(d) for d in deals]
    full = {"fy": "1405", "years": {"1405": {}, "1404": {}}, "people": [{"id": 1, "name": "سارا", "inv": inv, "invY": {"1405": copy.deepcopy(inv)}}]}
    full.update(extra or {})
    return full


ALLOWED = {"saleDate", "saleTime", "month", "stageChangedAt"}


def protected_view(full):
    """همه‌چیز به‌جز فیلدهای مجازِ اصلاح — برای اثباتِ دست‌نخوردنِ تأیید مالی، حسابدار، مراحل، وزن‌ها و ..."""
    f = copy.deepcopy(full)
    f.pop("saleDates", None)
    f.pop("saleTimes", None)
    for p in f["people"]:
        for arr in [p.get("inv") or []] + list((p.get("invY") or {}).values()):
            for d in arr:
                for k in ALLOWED:
                    d.pop(k, None)
    return f


class HistoricalFix(unittest.TestCase):
    def test_raw_value_fixes_date_time_month_and_rerun_is_noop(self):
        full = blob([deal(stageChangedAt="16:32:51 1405/06/31", saleDate="")])
        before = protected_view(full)
        changes, rep, _ = fix.plan_fix(full)
        self.assertEqual((rep["checked"], rep["changed"], rep["from_raw"]), (1, 1, 1))
        fix.apply_changes(full, changes)
        for d in (full["people"][0]["inv"][0], full["people"][0]["invY"]["1405"][0]):   # هر دو نسخه
            self.assertEqual((d["saleDate"], d["saleTime"], d["month"]), ("1405/06/31", "16:32:51", 5))
        self.assertEqual(protected_view(full), before)
        again, rep2, _ = fix.plan_fix(full)
        self.assertEqual((again, rep2["changed"], rep2["unchanged"]), ([], 0, 1))

    def test_file_source_matches_by_deal_number_state_and_name(self):
        src = {"4699": [{"deal": "4699", "raw": "08:00:00 1405/05/14", "won": False, "name_h": [fix.name_hash("کافه رشت")]},
                        {"deal": "4699", "raw": "16:32:51 1405/06/31", "won": True, "name_h": [fix.name_hash("کافه رشت")]}]}
        full = blob([deal()])
        changes, rep, _ = fix.plan_fix(full, src)
        fix.apply_changes(full, changes)
        d = full["people"][0]["inv"][0]
        self.assertEqual((d["saleDate"], d["saleTime"], d["stageChangedAt"], rep["from_file"]), ("1405/06/31", "16:32:51", "16:32:51 1405/06/31", 1))
        self.assertEqual(len(full["people"][0]["inv"]), 1)   # بدونِ رکوردِ تازه/تکراری

    def test_ambiguous_mismatched_or_missing_source_never_overwrites(self):
        cases = {
            "ambiguous_value": {"4699": [{"raw": "10:00:00 1405/06/01", "won": True}, {"raw": "11:00:00 1405/06/02", "won": True}]},
            "ambiguous_name": {"4699": [{"raw": "10:00:00 1405/06/01", "won": True, "name_h": [fix.name_hash("مشتری دیگر")]}]},
            "no_source": {},
            "invalid_source": {"4699": [{"raw": "10:00:00 1405/07/31", "won": True}]},
            "not_text": {"4699": [{"raw": None, "raw_type": "datetime", "won": True}]},
        }
        for why, src in cases.items():
            full = blob([deal(saleDate="1405/01/01", month=0)])
            snap = copy.deepcopy(full)
            changes, rep, issues = fix.plan_fix(full, src)
            self.assertEqual(changes, [], why)
            self.assertEqual(full, snap, why)
            expected = {"not_text": "invalid_source"}.get(why, why)
            self.assertEqual(issues[0]["reason"], expected, why)

    def test_invalid_raw_reported_not_nulled(self):
        full = blob([deal(stageChangedAt="بستن", saleDate="1405/02/02")])
        changes, rep, issues = fix.plan_fix(full)
        self.assertEqual((changes, rep["invalid_source"], issues[0]["reason"]), ([], 1, "invalid_source"))

    def test_locked_documents_untouched_only_empty_map_filled(self):
        approved = deal(id=2, finState="approved", finApproval={"by": "مالی"}, finBy="نورا", stageChangedAt="12:00:00 1405/03/03", saleDate="")
        conflict = deal(id=3, finClosed=True, stageChangedAt="12:00:00 1405/03/03", saleDate="1405/03/09")
        full = blob([approved, conflict])
        before = copy.deepcopy(full["people"])
        changes, rep, issues = fix.plan_fix(full)
        fix.apply_changes(full, changes)
        self.assertEqual(full["people"], before)   # خودِ سندهای قفل حتی یک فیلد هم تغییر نکردند
        self.assertEqual((full["saleDates"]["1405"], full["saleTimes"]["1405"]), ({"1:2": "1405/03/03"}, {"1:2": "12:00:00"}))
        self.assertEqual((rep["locked_conflict"], rep["locked_month_mismatch"]), (1, 1))

    def test_fiscal_year_mismatch_reported_not_moved(self):
        full = blob([deal(stageChangedAt="10:00:00 1404/12/20")])
        snap = copy.deepcopy(full)
        changes, rep, issues = fix.plan_fix(full)
        self.assertEqual((changes, rep["fy_mismatch"], full), ([], 1, snap))

    def test_rollback_reverts_but_never_overwrites_later_user_edits(self):
        full = blob([deal(id=1, stageChangedAt="16:32:51 1405/06/31"), deal(id=2, no="5000", stageChangedAt="09:00:00 1405/02/02")])
        original = copy.deepcopy(full)
        changes, _, _ = fix.plan_fix(full)
        fix.apply_changes(full, changes)
        for arr in (full["people"][0]["inv"], full["people"][0]["invY"]["1405"]):
            arr[1]["saleDate"] = "1405/02/05"   # ویرایشِ بعدیِ کاربر روی معاملهٔ دوم
        done, skipped = fix.rollback_changes(full, changes)
        self.assertEqual(full["people"][0]["inv"][0], original["people"][0]["inv"][0])
        self.assertEqual(full["people"][0]["inv"][1]["saleDate"], "1405/02/05")
        self.assertTrue(skipped and done)


class FinanceAssignee(unittest.TestCase):
    def call(self, role, person, d=None, user="u1"):
        full = blob([d or deal()], {"users": {user: {"person": "کاربر " + role}},
                                    "people": [{"id": 1, "name": "سارا", "role": "sales", "inv": [d or deal()], "invY": {"1405": [d or deal()]}},
                                               {"id": 2, "name": "نورا", "role": "finance"}, {"id": 3, "name": "سابق", "role": "finance", "inactive": True}]})
        saved = []
        ident = {"user": user, "role": role}
        with patch.object(server, "_c1_ctx", return_value=("team", ident, full, None)), patch.object(server, "_c1_save", side_effect=lambda t, f: saved.append(f)):
            res = server.c1_finance_by(None, {"id": 1, "person": person})
        code = getattr(res, "status_code", 200)
        return code, (full if saved else None)

    def test_permissions_validation_and_audit_identity(self):
        self.assertEqual(self.call("sales", "نورا")[0], 403)
        code, full = self.call("finance", "نورا")
        d = full["people"][0]["inv"][0]
        self.assertEqual((code, d["finBy"], full["people"][0]["invY"]["1405"][0]["finBy"]), (200, "نورا", "نورا"))
        audit = d["finAudit"][-1]
        self.assertEqual((audit["action"], audit["user"], audit["by"], audit["to"]), ("fin_by", "u1", "کاربر finance", "نورا"))   # انجام‌دهنده ≠ انتخاب‌شده
        self.assertEqual(self.call("finance", "", deal(finBy="نورا"))[0], 403)          # پس از ثبت فقط مدیر
        code, full = self.call("manager", "", deal(finBy="نورا"))
        self.assertEqual((code, "finBy" in full["people"][0]["inv"][0]), (200, False))   # لغو با مدیر
        self.assertEqual(self.call("manager", "سابق")[0], 400)                          # غیرفعال
        self.assertEqual(self.call("manager", "سارا")[0], 400)                          # نقشِ غیرمالی
        self.assertEqual(self.call("manager", "نورا", deal(finState="approved"))[0], 409)  # سندِ قفل

    def test_state_save_cannot_set_or_change_fin_by(self):
        old = blob([deal()])
        changed = copy.deepcopy(old)
        for arr in (changed["people"][0]["inv"], changed["people"][0]["invY"]["1405"]):
            arr[0]["finBy"] = "نورا"
        self.assertTrue(server._c1_lock_violation(old, changed))
        new_deal = copy.deepcopy(old)
        new_deal["people"][0]["inv"].append(deal(id=9, finBy="نورا"))
        self.assertTrue(server._c1_lock_violation(old, new_deal))
        same = copy.deepcopy(old)
        self.assertIsNone(server._c1_lock_violation(old, same))

    def test_sale_times_merge_is_fill_only_and_validated(self):
        old = blob([deal()], {"saleTimes": {"1405": {"1:1": "10:00:00"}}})
        new = blob([deal(), deal(id=2)], {"saleTimes": {"1405": {"1:1": "11:11:11", "1:2": "25:00", "9:9": "09:00:00"}}})
        server._merge_sale_dates(old, new)
        self.assertEqual(new["saleTimes"], {"1405": {"1:1": "10:00:00"}})
        new2 = blob([deal(), deal(id=2)], {"saleTimes": {"1405": {"1:2": "09:30:00"}}})
        server._merge_sale_dates(old, new2)
        self.assertEqual(new2["saleTimes"]["1405"], {"1:1": "10:00:00", "1:2": "09:30:00"})


class StartupRegression(unittest.TestCase):
    def test_startup_without_telegram_does_not_crash_on_like_query(self):
        """pymysql args=() هم «%» را قالب می‌گیرد؛ با تلگرامِ خاموش، سرور در 3.9.42 بالا نمی‌آمد."""
        def pymysql_like_q(sql, args=None):
            sql % tuple(args or ())   # همان رفتارِ cursor.execute وقتی args برابرِ () است
            return []
        with patch.object(server, "run_migrations", return_value=0), patch.object(server, "tg_configured", return_value=False),              patch.object(server, "_sa_all", return_value={}), patch.object(server, "q", side_effect=pymysql_like_q),              patch.object(server, "sa_start_worker") as worker:
            server._startup()
            worker.assert_not_called()


if __name__ == "__main__":
    unittest.main()

class CorrectionSafety(unittest.TestCase):
    def test_divergent_copies_are_not_rewritten(self):
        for field, value in [('finState', 'approved'), ('saleDate', '1405/01/01'), ('stageChangedAt', '1405/02/02')]:
            full = blob([deal(stageChangedAt='10:00:00 1405/06/31')])
            full['people'][0]['inv'][0][field] = value
            changes, _, issues = fix.plan_fix(full)
            self.assertEqual(changes, [])
            self.assertEqual(issues[0]['reason'], 'ambiguous_copies')

    def test_locked_maps_are_fill_only(self):
        full = blob([deal(finState='approved', stageChangedAt='10:00:00 1405/06/31')],
                    {'saleDates': {'1405': {'1:1': '1405/01/01'}}, 'saleTimes': {'1405': {'1:1': '09:00:00'}}})
        changes, _, _ = fix.plan_fix(full)
        self.assertEqual(changes, [])

    def test_rollback_does_not_edit_newly_locked_document(self):
        full = blob([deal(stageChangedAt='10:00:00 1405/06/31')])
        changes, _, _ = fix.plan_fix(full)
        fix.apply_changes(full, changes)
        full['people'][0]['inv'][0]['finState'] = 'approved'
        done, skipped = fix.rollback_changes(full, changes)
        self.assertEqual(done, 0)
        self.assertEqual(len(skipped), len(changes))

class AmbiguousSourceSafety(unittest.TestCase):
    def test_mixed_invalid_or_conflicting_customer_sources_are_not_guessed(self):
        good = {'raw':'10:00:00 1405/06/31', 'won':True, 'name_h':[fix.name_hash('کافه رشت')]}
        for other in [dict(good,raw='bad'), dict(good,name_h=[fix.name_hash('دیگری')])]:
            changes, _, _ = fix.plan_fix(blob([deal()]), {'4699':[good, other]})
            self.assertEqual(changes, [])
