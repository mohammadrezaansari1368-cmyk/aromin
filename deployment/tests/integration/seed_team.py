"""tenantِ team روی aromin_dev — فقط دادهٔ مصنوعی برای آزمونِ مرورگری."""
import copy, sys
sys.path.insert(0, sys.argv[1])
import server  # noqa: E402

deal = lambda **o: dict(dict(month=6, amount="50000000", funnel="won", stages=["lead", "close"], settle="cash", kind="new", channel="official"), **o)
inv = [deal(id=1, no="7001", name="کافه نمونه", stageChangedAt="16:32:51 1405/07/05"),
       deal(id=2, no="7002", name="رستوران نمونه", finState="approved", finApproval={"by": "مدیر نمونه", "user": "t_admin"}, finBy="نورا آزمون", stageChangedAt="10:00:00 1405/07/02")]
full = {"fy": "1405", "years": {"1405": {}, "1404": {}}, "gid": 100,
        "users": {"t_admin": {"pass": "local-test-only", "role": "manager", "person": "مدیر نمونه"},
                  "t_fin": {"pass": "local-test-only", "role": "finance", "person": "نورا آزمون"},
                  "t_sales": {"pass": "local-test-only", "role": "sales", "person": "سارا آزمون"}},
        "people": [{"id": 1, "name": "سارا آزمون", "role": "sales", "inv": copy.deepcopy(inv), "invY": {"1405": copy.deepcopy(inv)}},
                   {"id": 2, "name": "نورا آزمون", "role": "finance"}, {"id": 3, "name": "مریم آزمون", "role": "finance"}]}
server.q("DELETE FROM tenant_state WHERE tenant='team'")
server._c1_save("team", full)
print("seeded team")
