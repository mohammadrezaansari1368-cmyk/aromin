"""3.9.67: move one month's finance share (finBy) from one finance person to another — admin only, includes approved documents,
keeps the approval record and amounts, audit + backup, dry-run count first."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402

SHAHRIVAR = 5


def full():
    deals = [
        {"id": 1, "no": "901", "month": 5, "funnel": "won", "finBy": "آقای محرمی", "finState": "approved", "finApproval": {"by": "آقای محرمی", "cash": 10}},
        {"id": 2, "no": "902", "month": 5, "funnel": "won", "finApproval": {"by": "آقای محرمی"}, "finState": "approved"},   # historical: owner only in finApproval
        {"id": 3, "no": "903", "month": 5, "funnel": "won", "finBy": "نورا مقدس"},
        {"id": 4, "no": "904", "month": 4, "funnel": "won", "finBy": "آقای محرمی"},                                           # Mordad: untouched
        {"id": 5, "no": "905", "month": 5, "funnel": "lost", "finBy": "آقای محرمی"},                                          # not a sale
    ]
    return {"fy": 1405, "people": [
        {"name": "کارشناس", "role": "sales", "invY": {"1405": deals}},
        {"name": "آقای محرمی", "role": "finance"}, {"name": "نورا مقدس", "role": "finance"}, {"name": "قدیمی", "role": "finance", "inactive": True}]}


class FinanceReassign(unittest.TestCase):
    def call(self, role, body, data):
        ident = {"user": "boss", "role": role}
        with patch.object(server, "_c1_ctx", return_value=("team", ident, data, None)), patch.object(server, "_c1_save") as save, \
                patch.object(server, "_c1_backup") as backup, patch.object(server, "_c1_person_name", return_value="مدیر"):
            r = server.c1_finance_reassign(None, dict({"fy": "1405", "month": SHAHRIVAR, "from": "آقای محرمی", "to": "نورا مقدس"}, **body))
            return r, save, backup

    def test_dry_run_counts_and_changes_nothing(self):
        data = full(); before = copy.deepcopy(data)
        r, save, backup = self.call("manager", {"dry": True}, data)
        self.assertEqual(r, {"ok": True, "dry": True, "count": 2})
        self.assertEqual(data, before); save.assert_not_called(); backup.assert_not_called()

    def test_moves_shahrivar_only_keeps_approval_and_audits(self):
        data = full()
        r, save, backup = self.call("manager", {"reason": "تأییدهای شهریور را نورا انجام داده"}, data)
        self.assertEqual(r, {"ok": True, "moved": 2})
        save.assert_called_once(); backup.assert_called_once()
        d = {x["id"]: x for x in data["people"][0]["invY"]["1405"]}
        self.assertEqual((d[1]["finBy"], d[2]["finBy"]), ("نورا مقدس", "نورا مقدس"))
        self.assertEqual(d[1]["finApproval"], {"by": "آقای محرمی", "cash": 10})          # the approval record is history, not rewritten
        self.assertEqual(d[1]["finState"], "approved")
        self.assertEqual([a["action"] for a in d[1]["finAudit"]], ["fin_reassign", "fin_by"])
        self.assertEqual(d[1]["finAudit"][0]["reason"], "تأییدهای شهریور را نورا انجام داده")
        self.assertEqual(d[4]["finBy"], "آقای محرمی")                                    # other month untouched
        self.assertEqual(d[5]["finBy"], "آقای محرمی")                                    # lost deal untouched

    def test_guards(self):
        for role in ("finance", "sales", "support"):
            self.assertEqual(self.call(role, {"reason": "xxx"}, full())[0].status_code, 403)
        self.assertEqual(self.call("manager", {"reason": "xxx", "to": "قدیمی"}, full())[0].status_code, 400)          # inactive target
        self.assertEqual(self.call("manager", {"reason": "xxx", "month": 12}, full())[0].status_code, 400)
        self.assertEqual(self.call("manager", {"reason": ""}, full())[0].status_code, 400)                            # reason required
        self.assertEqual(self.call("manager", {"reason": "xxx", "to": "آقای محرمی"}, full())[0].status_code, 400)     # from == to


if __name__ == "__main__":
    unittest.main()
