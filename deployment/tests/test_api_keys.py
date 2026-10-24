"""3.9.69: «وب سرویس» — scoped API keys for /api/mcp (hashed, shown once, revocable) and the raw Harikan export on /api/mcp.
SQLite fake; fake password and fake legacy token."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import server  # noqa: E402
from db_fake import Connection, load_schema  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

LEGACY = "L" * 40
USERS = {"boss": {"role": "manager", "pass_hash": server._hash_password("correct-horse")}}
DAY = {"kind": "day", "key": "1405/07/29", "present": ["10001"], "absent": [], "leave": [], "mission": [], "attendance": [{"code": "10001", "in": "08:00", "out": "16:30"}]}


class ApiKeys(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db = os.path.join(tmp.name, "t.db")
        for m in ("006_identity_attendance.sql", "009_batch_rows.sql", "010_harikan_exports.sql", "013_api_keys.sql"):
            load_schema(Path(server.HERE) / "migrations" / m, self.db)
        self.ident = {"user": "boss", "name": "مدیر", "role": "manager", "tenant": "team"}
        self.addCleanup(patch.stopall)
        patch.object(server, "db_conn", side_effect=lambda: Connection(self.db)).start()
        patch.object(server, "kb_identity", side_effect=lambda r, t: self.ident).start()
        patch.object(server, "_kb_directory", return_value=(USERS, [])).start()
        patch.object(server, "_tenant_full", return_value={"people": []}).start()
        patch.object(server, "_mcp_config", return_value={"token": LEGACY, "tenant": "team"}).start()
        patch.dict(server._api_ready, {"ok": True}).start()
        server._w_hits.clear(); server._api_seen.clear()
        self.c = TestClient(server.app)

    def create(self, **b):
        return self.c.post("/api/settings/api-keys", json=dict({"tenant": "team", "name": "پلِ هاریکان", "scopes": ["attendance:write"], "password": "correct-horse"}, **b))

    def mcp(self, key, body):
        return self.c.post("/api/mcp", headers={"Authorization": "Bearer " + key}, json=body)

    def rows(self, sql):
        cx = Connection(self.db)
        try:
            return [tuple(r) for r in cx.connection.execute(sql).fetchall()]
        finally:
            cx.close()

    def test_create_shown_once_hashed_and_listed_without_secret(self):
        self.assertEqual(self.create(password="wrong").status_code, 403)
        self.assertEqual(self.create(scopes=[]).status_code, 400)
        r = self.create()
        self.assertEqual(r.status_code, 200)
        key = r.json()["key"]
        self.assertTrue(key.startswith("ark_"))
        self.assertEqual(r.headers.get("cache-control"), "no-store")
        self.assertNotIn(key, json.dumps(self.rows("SELECT * FROM api_keys"), ensure_ascii=False, default=str))     # only the hash is stored
        lst = self.c.get("/api/settings/api-keys?tenant=team").json()
        self.assertNotIn(key, json.dumps(lst, ensure_ascii=False))
        self.assertEqual((lst["keys"][0]["name"], lst["keys"][0]["scopes"], lst["keys"][0]["prefix"]), ("پلِ هاریکان", ["attendance:write"], key[:12]))
        self.ident = {"user": "s", "role": "sales", "tenant": "team"}
        self.assertEqual(self.c.get("/api/settings/api-keys?tenant=team").status_code, 403)

    def test_scopes_limit_tools_and_revoke_closes_the_key(self):
        key = self.create().json()["key"]
        tools = self.mcp(key, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}).json()["result"]["tools"]
        self.assertEqual([t["name"] for t in tools], ["save_attendance_export"])
        r = self.mcp(key, {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "ask_aromin_agent", "arguments": {"question": "x"}}}).json()
        self.assertEqual(r["error"]["code"], -32001)
        r = self.mcp(key, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "save_attendance_export", "arguments": {"export": DAY}}}).json()
        self.assertEqual(r["result"]["structuredContent"]["status"], "inserted")
        self.assertIsNotNone(self.rows("SELECT last_used_at FROM api_keys")[0][0])
        kid = self.c.get("/api/settings/api-keys?tenant=team").json()["keys"][0]["id"]
        self.assertTrue(self.c.post("/api/settings/api-keys/revoke", json={"tenant": "team", "id": kid}).json()["revoked"])
        self.assertEqual(self.mcp(key, {"jsonrpc": "2.0", "id": 4, "method": "tools/list"}).status_code, 401)
        self.assertEqual(self.mcp("ark_" + "x" * 40, {"jsonrpc": "2.0", "id": 5, "method": "ping"}).status_code, 401)

    def test_raw_harikan_export_and_legacy_token(self):
        r = self.mcp(LEGACY, DAY)                                   # the bridge posts the export itself
        self.assertEqual((r.status_code, r.json()["status"]), (200, "inserted"))
        self.assertEqual(self.rows("SELECT COUNT(*) FROM attendance_days"), [(1,)])
        self.assertEqual(self.mcp(LEGACY, DAY).json()["status"], "unchanged")
        read_only = self.create(name="فقط خواندن", scopes=["attendance:read"]).json()["key"]
        self.assertEqual(self.mcp(read_only, DAY).status_code, 403)    # scope enforced on the raw form too
        self.assertEqual(self.mcp("wrong-token-value-1234567890", DAY).status_code, 401)
        self.assertEqual(self.mcp(LEGACY, {"jsonrpc": "2.0", "id": 9, "method": "tools/list"}).json()["result"]["tools"].__len__(), len(server.MCP_TOOLS))


if __name__ == "__main__":
    unittest.main()
