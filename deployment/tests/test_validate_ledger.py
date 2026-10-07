"""گزارشِ اعتبارسنجیِ دفتر (validate_ledger) — آفلاین، دادهٔ مصنوعی."""
import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import validate_ledger as vl  # noqa: E402


def deal(**o):
    return dict(dict(id=1, no="5001", name="مشتری", month=5, amount="1000000", funnel="won", stageChangedAt="16:32:51 1405/06/31", saleDate="1405/06/31", saleTime="16:32:51"), **o)


def state(sara, nima=()):
    return {"fy": "1405", "people": [{"id": 1, "name": "سارا", "inv": list(sara), "invY": {"1405": list(sara)}},
                                     {"id": 2, "name": "نیما", "inv": list(nima), "invY": {"1405": list(nima)}}], "importLog": []}


class ValidateLedger(unittest.TestCase):
    def test_clean_ledger_by_seller_and_month(self):
        r = vl.validate(state([deal(), deal(id=2, no="5002", month=4, amount="500", stageChangedAt="09:00:00 1405/05/01", saleDate="1405/05/01", saleTime="09:00:00"),
                               deal(id=3, no="5003", funnel="advance", amount="0")], [deal(id=4, no="5004", finState="approved")]))
        self.assertEqual(r["checks"], {k: 0 for k in vl.CHECKS})
        s = r["sellers"]["سارا"]
        self.assertEqual((s["rows"], s["invoices"], s["amount"]), (3, 2, 1000500.0))
        self.assertEqual(s["months"]["6"], {"rows": 2, "invoices": 1, "amount": 1000000.0})
        self.assertEqual(s["months"]["5"], {"rows": 1, "invoices": 1, "amount": 500.0})
        self.assertEqual((r["totals"]["invoices"], r["totals"]["locked"]), (3, 1))

    def test_every_check_fires(self):
        sara = [deal(), deal(id=2),                                         # duplicate_invoice ×2
                deal(id=3, no="6001", stageChangedAt=None),                  # missing_raw
                deal(id=4, no="6002", stageChangedAt="بستن"),                # raw_invalid
                deal(id=5, no="6003", stageChangedAt="10:00:00 1404/12/01", saleDate="1404/12/01", saleTime="10:00:00", month=11),  # fy_mismatch
                deal(id=6, no="6004", saleDate="1405/06/30"),                # date_mismatch
                deal(id=7, no="6005", month=6),                              # month_mismatch
                deal(id=8, no="6006", stageChangedAt=None, saleDate="", saleTime="")]  # missing_raw + missing_sale_date
        full = state(sara)
        full["people"][0]["inv"] = sara[:2]                                   # inv_copy_mismatch
        r = vl.validate(full)
        self.assertEqual(r["checks"], {"duplicate_invoice": 2, "missing_raw": 2, "raw_invalid": 1, "fy_mismatch": 1, "date_mismatch": 1,
                                       "month_mismatch": 1, "missing_sale_date": 1, "inv_copy_mismatch": 1})
        self.assertEqual(r["samples"]["duplicate_invoice"][0]["copies"], 2)

    def test_sale_dates_map_counts_and_no_customer_names(self):
        d = deal(saleDate=None, saleTime=None)
        full = state([d])
        full["saleDates"] = {"1405": {"1:1": "1405/06/31"}}
        full["saleTimes"] = {"1405": {"1:1": "16:32:51"}}
        full["importLog"] = [{"type": "deal", "name": "joolio.xlsx", "rows": 3, "mode": "append", "fy": {"valid": 1, "previous": 1, "duplicate": 0, "conflict": 1, "invalid": 0, "years": {"1405": 2, "1404": 1}},
                              "report": {"bySeller": {"سارا": {"valid": 1, "conflict": 1, "months": {"6": {"n": 1}}}}, "newNames": {}, "flagged": [{"i": 3, "no": "5009", "rep": "سارا", "st": "conflict", "why": "…"}]}}]
        r = vl.validate(full)
        self.assertEqual(r["checks"]["date_mismatch"] + r["checks"]["missing_sale_date"], 0)
        self.assertEqual(r["imports"][0]["flagged"], {"conflict": 1})
        self.assertEqual(r["imports"][0]["by_seller"]["سارا"], {"valid": 1, "conflict": 1})
        self.assertNotIn("مشتری", json.dumps(r, ensure_ascii=False))
        self.assertIn("آخرین ایمپورت", vl.text(r))

    def test_read_only(self):
        full = state([deal(), deal(id=2)])
        before = copy.deepcopy(full)
        vl.validate(full)
        self.assertEqual(full, before)


if __name__ == "__main__":
    unittest.main()
