"""آزمونِ واقعی روی MariaDB (aromin_dev) و سرورِ واقعی (127.0.0.1:3010) — فقط دادهٔ مصنوعی در tenantِ آزمایشی."""
import copy, json, subprocess, sys, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, sys.argv[1])
import server  # noqa: E402

T, PY, DEPLOY = "stage_fix_test", sys.executable, sys.argv[1]
res = []
ok = lambda n, c, i=None: res.append(("PASS " if c else "FAIL ") + n + ("" if c or i is None else " — " + str(i)[:300]))
deal = lambda **o: dict(dict(id=1, no="4699", name="کافه", month=0, amount="100", funnel="won", stages=["lead", "close"], mgrShare=True), **o)
inv = [deal(id=1, stageChangedAt="16:32:51 1405/06/31"), deal(id=2, no="5000", stageChangedAt="بستن"),
       deal(id=3, no="6000", finState="approved", finApproval={"by": "مالی"}, finBy="نورا", stageChangedAt="12:00:00 1405/03/03")]
full = {"fy": "1405", "years": {"1405": {}}, "gid": 50,
        "users": {"t_admin": {"pass": "local-test-only", "role": "manager"}, "t_fin": {"pass": "local-test-only", "role": "finance", "person": "نورا"},
                  "t_sales": {"pass": "local-test-only", "role": "sales"}},
        "people": [{"id": 1, "name": "سارا", "role": "sales", "inv": copy.deepcopy(inv), "invY": {"1405": copy.deepcopy(inv)}},
                   {"id": 2, "name": "نورا", "role": "finance"}]}
server.ensure_backup_table()
server.q("DELETE FROM tenant_state WHERE tenant=%s", (T,))
server._c1_save(T, full)


def job(*a):
    p = subprocess.run([PY, "fix_stage_dates.py", "--tenant", T, *a], cwd=DEPLOY, capture_output=True, text=True, encoding="utf-8")
    if p.returncode:
        raise SystemExit(p.stderr[-800:])
    return json.loads(p.stdout)


state = lambda: server._tenant_full(T)
backups = lambda: server.q("SELECT COUNT(*) n FROM tenant_backups WHERE tenant=%s", (T,))[0]["n"]
before, b0 = state(), backups()
r = job()
ok("dry-run: report + no data/backup change", r["mode"] == "dry-run" and r["report"]["changed"] == 2 and r["report"]["invalid_source"] == 1 and r["report"]["locked_month_mismatch"] == 1 and state() == before and backups() == b0, r)
r = job("--apply")
s = state()
d1 = [x for x in s["people"][0]["invY"]["1405"] if x["id"] == 1][0]
d1b = [x for x in s["people"][0]["inv"] if x["id"] == 1][0]
ok("apply: date/time/month on both copies, backup taken, run id", r.get("run_id") and backups() == b0 + 1 and (d1["saleDate"], d1["saleTime"], d1["month"]) == ("1405/06/31", "16:32:51", 5) and d1b == d1, r)
locked = [x for x in s["people"][0]["inv"] if x["id"] == 3][0]
ok("locked doc untouched (finState/finApproval/finBy), date only in saleDates map", {k: locked.get(k) for k in ("finState", "finApproval", "finBy", "stages", "mgrShare")} == {"finState": "approved", "finApproval": {"by": "مالی"}, "finBy": "نورا", "stages": ["lead", "close"], "mgrShare": True} and s["saleDates"]["1405"]["1:3"] == "1405/03/03" and "saleDate" not in locked)
ok("invalid source not overwritten", [x for x in s["people"][0]["inv"] if x["id"] == 2][0].get("saleDate") is None)
aud = server.q("SELECT COUNT(*) n FROM data_fix_audit WHERE run_id=%s", (r["run_id"],))[0]["n"]
ok("audit rows recorded before/after", aud == len([1 for _ in range(r["fields_changed"])]), aud)
r2 = job()
ok("re-run idempotent (0 changes, no duplicates)", r2["report"]["changed"] == 0 and r2["fields_changed"] == 0 and len(state()["people"][0]["inv"]) == 3, r2)
rb = job("--rollback", r["run_id"])
s = state()
ok("rollback reverts tool changes", rb["reverted"] == r["fields_changed"] and "saleDate" not in [x for x in s["people"][0]["inv"] if x["id"] == 1][0], rb)


def http(path, body=None, user=None, method="POST"):
    h = {"Content-Type": "application/json"}
    if user:
        h.update({"X-Aromin-User": urllib.parse.quote(user), "X-Aromin-Pass": "local-test-only"})
    req = urllib.request.Request("http://127.0.0.1:3010" + path, data=json.dumps(body, ensure_ascii=False).encode() if body is not None else None, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as x:
            return x.status, json.load(x)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


st, _ = http("/api/c1/finance-by", {"tenant": T, "id": 1, "person": "نورا"})
ok("finance-by without login → 401", st == 401, st)
st, _ = http("/api/c1/finance-by", {"tenant": T, "id": 1, "person": "نورا"}, "t_sales")
ok("finance-by as sales → 403", st == 403, st)
st, b = http("/api/c1/finance-by", {"tenant": T, "id": 1, "person": "نورا"}, "t_fin")
d = [x for x in state()["people"][0]["inv"] if x["id"] == 1][0]
ok("finance sets finBy; audit actor ≠ selected person", st == 200 and d["finBy"] == "نورا" and d["finAudit"][-1]["user"] == "t_fin" and d["finAudit"][-1]["to"] == "نورا", (st, b))
st, _ = http("/api/c1/finance-by", {"tenant": T, "id": 1, "person": ""}, "t_fin")
ok("finance cannot clear existing → 403", st == 403, st)
st, _ = http("/api/c1/finance-by", {"tenant": T, "id": 3, "person": ""}, "t_admin")
ok("locked doc → 409", st == 409, st)
st, _ = http("/api/c1/finance-by", {"tenant": T, "id": 1, "person": ""}, "t_admin")
ok("manager clears → 200", st == 200 and "finBy" not in [x for x in state()["people"][0]["inv"] if x["id"] == 1][0], st)
tampered = state()
for arr in (tampered["people"][0]["inv"], tampered["people"][0]["invY"]["1405"]):
    for x in arr:
        if x["id"] == 1:
            x["finBy"] = "نورا"
st, b = http("/api/state?tenant=" + T, tampered)
ok("/api/state cannot set finBy → 409, data unchanged", st == 409 and "finBy" not in [x for x in state()["people"][0]["inv"] if x["id"] == 1][0], (st, b))
server.ensure_backup_table()
server.q("DELETE FROM tenant_state WHERE tenant=%s", (T,))
print("\n".join(res))
print("mariadb e2e: %d/%d" % (sum(x.startswith("PASS") for x in res), len(res)))
