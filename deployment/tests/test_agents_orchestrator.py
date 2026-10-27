"""3.9.64: orchestrator + seven specialists — routing, permissions in code, per-agent RAG scope, agent_key on samples.
No network, no DB server: agent_cfg / ai_chat / KB are patched; the training test uses the SQLite fake."""
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
from db_fake import Connection  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

SITE = "8a436154fc045cf1bd45"


def cfg(on=True, **agents):
    """Settings with the global switch `on` and the given agents enabled (value = dict of overrides)."""
    src = {"enabled": on, "agents": {k: dict({"enabled": True}, **v) for k, v in agents.items()}}
    return server.agent_norm(src)


class Route(unittest.TestCase):
    def route(self, c, surface, text, **kw):
        with patch.object(server, "agent_cfg", return_value=c):
            return server.agent_route("team", surface, text, classify=kw.pop("classify", lambda *a: None), **kw)

    def test_switch_off_or_no_agent_means_no_routing(self):
        self.assertIsNone(self.route(cfg(False, sales={}, online_expert={}), "website", "قیمت"))
        self.assertIsNone(self.route(cfg(True), "website", "قیمت"))                 # all seeded disabled
        self.assertTrue(all(not a["enabled"] for a in server.AGENT_DEFAULTS["agents"].values()))

    def test_rules_pick_exactly_one_and_respect_surface_site_role(self):
        c = cfg(True, sales={}, online_expert={}, support={}, coach={}, marketing={})
        r = self.route(c, "website", "قیمتِ صندوق فروشگاهی با اقساط چند است؟")
        self.assertEqual((r["agent"], r["reason"]), ("sales", "rule"))
        r = self.route(c, "website", "خطا دارم در ایمپورت")                      # support is dashboard-only by default
        self.assertNotEqual(r["agent"], "support")
        self.assertEqual(self.route(c, "dashboard", "ایمپورت اکسل خطا می‌دهد")["agent"], "support")
        self.assertNotEqual(self.route(c, "dashboard", "تحلیلِ قیف و نرخ تبدیل", role="sales")["agent"], "coach")   # managers only
        self.assertEqual(self.route(c, "dashboard", "تحلیلِ قیف و نرخ تبدیل", role="manager")["agent"], "coach")
        only_site = cfg(True, sales={"sites": ["othersite01"]}, online_expert={})
        self.assertEqual(self.route(only_site, "website", "قیمت", site_id=SITE)["agent"], "online_expert")
        bad = server.agent_norm({"enabled": True, "agents": {"marketing": {"enabled": True, "surfaces": ["website", "dashboard"]}}})
        self.assertEqual(bad["agents"]["marketing"]["surfaces"], ["dashboard"])   # never customer-facing, even if stored

    def test_fallback_stickiness_handoff_and_llm_only_when_inconclusive(self):
        c = cfg(True, sales={}, online_expert={}, lead_gen={})
        calls = []
        pick = lambda t, cands, text: calls.append(list(cands)) or None
        r = self.route(c, "website", "hmm", classify=pick)                       # no rule hit, no current agent
        self.assertEqual((r["agent"], r["reason"]), ("online_expert", "fallback"))
        self.assertEqual(len(calls), 1)
        r = self.route(c, "website", "hmm", current="sales", classify=pick)       # sticky: no LLM call
        self.assertEqual((r["agent"], r["reason"], r["handoff"]), ("sales", "sticky", False))
        self.assertEqual(len(calls), 1)
        r = self.route(c, "website", "قیمت و تخفیف", current="online_expert", classify=pick)
        self.assertEqual((r["agent"], r["from"], r["handoff"]), ("sales", "online_expert", True))
        self.assertEqual(len(calls), 1)                                            # a clear rule never asks the model
        r = self.route(c, "website", "hmm", classify=lambda *a: "lead_gen")
        self.assertEqual((r["agent"], r["reason"]), ("lead_gen", "llm"))
        r = self.route(c, "website", "hmm", classify=lambda *a: "coach")          # model answers outside the candidates → fallback
        self.assertEqual(r["agent"], "online_expert")
        r = self.route(c, "website", "hmm", current="coach")                       # current not allowed here → not sticky
        self.assertIn(r["agent"], ("online_expert", "sales", "lead_gen"))

    def test_skill_trigger_words_count_as_rules(self):
        c = cfg(True, online_expert={}, after_sales={"surfaces": ["dashboard"], "skills": [{"name": "x", "trigger": "کالیبره، سنجش"}]},
                support={})
        self.assertEqual(self.route(c, "dashboard", "کالیبره کردن ترازو")["agent"], "after_sales")


class Registry(unittest.TestCase):
    def test_validator_rejects_bad_records(self):
        bad = {"agents": {"sales": {"enabled": "yes", "surfaces": ["sms"], "ragScope": [], "actions": ["publish"], "mood": "x",
                                    "skills": [{"name": ""}], "prompt": "p" * 5000, "sites": ["../x"]},
                          "marketing": {"surfaces": ["website"]}, "ghost": {}, "support": {"surfaces": ["website"], "ragScope": ["dashboard_help"], "actions": []}}}
        errs = server.agent_validate(bad)
        for frag in ("enabled", "سطح فقط", "مجموعهٔ دانش", "کارِ مجاز", "چهره", "نام ندارد", "۴۰۰۰", "سایت‌ها", "فقط در داشبورد", "ناشناخته «ghost»", "راهنمای داخلی"):
            self.assertTrue(any(frag in e for e in errs), frag)
        self.assertEqual(server.agent_validate({"agents": json.loads(json.dumps(server.AGENT_DEFAULTS["agents"]))}), [])

    def test_merge_keeps_owner_edits_and_stamps_versions(self):
        stored = {"agents": {"sales": {"enabled": True, "prompt": "پرامپتِ مالک", "version": 4, "updatedBy": "boss"}}}
        c = server.agent_norm(stored)
        self.assertEqual((c["agents"]["sales"]["prompt"], c["agents"]["sales"]["version"]), ("پرامپتِ مالک", 4))
        self.assertTrue(c["agents"]["support"]["skills"])                            # untouched agents keep defaults
        new = server.agent_norm({"agents": {"sales": {"prompt": "تازه", "version": 99}}}, c)
        server.agent_registry_stamp(c["agents"], new["agents"], "مدیر")
        self.assertEqual((new["agents"]["sales"]["version"], new["agents"]["sales"]["updatedBy"]), (5, "مدیر"))   # client cannot set version
        self.assertEqual(new["agents"]["coach"]["version"], 1)                      # unchanged agent: no bump


class DashboardChat(unittest.TestCase):
    def setUp(self):
        self.ev = []
        self.p = [patch.object(server, "kb_identity", return_value={"user": "s", "role": "sales", "tenant": "team"}),
                  patch.object(server, "assistant_system", return_value="S"), patch.object(server, "assistant_grounding", return_value=""),
                  patch.object(server, "agent_event", side_effect=lambda *a, **k: self.ev.append(a))]
        for x in self.p:
            x.start()
        self.c = TestClient(server.app)

    def tearDown(self):
        for x in reversed(self.p):
            x.stop()

    def ask(self, text, tool, **extra):
        body = dict({"tenant": "team", "mode": "agent", "role": "manager", "messages": [{"role": "user", "content": text}]}, **extra)
        reply = {"ok": True, "text": "```tool\n" + json.dumps({"name": tool, "args": {}}) + "\n```"}
        with patch.object(server, "ai_chat", return_value=reply):
            return self.c.post("/api/ai", json=body).json()

    def test_payload_role_is_ignored_and_disallowed_tool_is_stripped(self):
        with patch.object(server, "agent_enabled", return_value=False):
            out = self.ask("فروش این ماه؟", "fetchAnalytics")
        self.assertNotIn("fetchAnalytics", out["allowedTools"])                      # server role = sales, not the payload's manager
        self.assertNotIn("```tool", out["text"])
        self.assertEqual(self.ev[-1][2], "tool_refused")
        self.assertEqual(self.ev[-1][3]["code"], "fetchAnalytics")

    def test_specialist_actions_bound_the_tools(self):
        c = cfg(True, support={})
        with patch.object(server, "agent_enabled", return_value=True), patch.object(server, "agent_cfg", return_value=c), \
                patch.object(server, "sa_prompt", return_value=""):
            out = self.ask("خطای ایمپورت", "navigateToTab")
            self.assertEqual(out["agent"]["key"], "support")
            self.assertEqual(out["allowedTools"], ["navigateToTab"])
            self.assertIn("```tool", out["text"])                                   # allowed tool passes through to the client
            out = self.ask("خطای ایمپورت", "updateAppTheme")
            self.assertNotIn("```tool", out["text"])
            # tool-result round keeps the same agent without re-routing
            body = {"messages": [{"role": "user", "content": "خطا"}, {"role": "user", "content": "[tool_result navigateToTab] {}"}], "agent": "support"}
            out = self.ask("", "navigateToTab", **body)
            self.assertEqual(out["agent"]["key"], "support")


class RagScope(unittest.TestCase):
    DOCS = [("price.md", "# قیمت\nقیمت صندوق فروشگاهی سپیدز و شرایط اقساط برای فروشگاه‌ها " * 3, "id-products", ("products",)),
            ("play.md", "# اعتراض\nپاسخ به اعتراض گرانی قیمت صندوق در جلسهٔ فروش " * 3, "id-playbook", ("sales_playbook",)),
            ("gen.md", "# درباره\nآرومین نمایندهٔ سپیدز در گیلان است و صندوق فروشگاهی می‌فروشد " * 3, "id-general", ("general",))]

    def test_agent_never_reads_outside_its_collections_and_ids_are_kept(self):
        with patch.object(server, "_TENANT_RE") as rx, patch.object(server, "_s3_ready", return_value=True), \
                patch.dict(server._kb_docs_cache, {"team|public": (1e18, self.DOCS), "team": (1e18, self.DOCS)}):
            rx.match.return_value = True
            ids = []
            txt = server.kb_context("team", True, "قیمت صندوق اعتراض", scope=["products"], ids=ids)
            self.assertIn("price.md", txt)
            self.assertNotIn("play.md", txt)
            self.assertNotIn("gen.md", txt)
            self.assertEqual(ids, ["id-products"])
            ids = []
            txt = server.kb_context("team", True, "zzzz", scope=["sales_playbook"], ids=ids)   # no hit → whole scope only
            self.assertIn("play.md", txt)
            self.assertNotIn("price.md", txt)
            self.assertEqual(ids, ["id-playbook"])
            self.assertEqual(server.kb_context("team", True, "قیمت", scope=["marketing"]), "")
            pub = server._kb_docs("team", True, ["dashboard_help"])
            self.assertEqual(pub, [])                                               # internal help never reaches the website
            dash = server._kb_docs("team", False, ["dashboard_help"])
            self.assertEqual([d[2] for d in dash], ["builtin:dashboard_help"])
            self.assertIn("پیش‌نویس — نیاز به بازبینی", dash[0][1])

    def test_collections_metadata(self):
        self.assertEqual(server.kb_cols(None), ["general"])
        self.assertEqual(server.kb_cols("products,bogus,support"), ["products", "support"])
        self.assertEqual(server._kb_meta({"id": "x", "collections": ["marketing"]})["collections"], ["marketing"])

    def test_sources_event_carries_ids_only(self):
        seen = []
        with patch.object(server, "agent_tables", return_value=True), patch.object(server, "q", side_effect=lambda sql, a=None: seen.append(a)):
            server.agent_event("team", None, "sources", {"agent": "sales", "ids": ["id-products", "bad id with spaces", "builtin:dashboard_help"]})
        props = json.loads(seen[0][3])
        self.assertEqual(props, {"agent": "sales", "ids": ["id-products", "builtin:dashboard_help"]})


class WebsiteTurn(unittest.TestCase):
    site = {"siteId": SITE, "tenant": "team", "name": "آرومین"}

    def turn(self, spec, text):
        ev = []
        with patch.object(server, "sa_products_ctx", return_value=("", None)), patch.object(server, "assistant_system", return_value="S") as sysm, \
                patch.object(server, "assistant_grounding", return_value=""), patch.object(server, "agent_enabled", return_value=True), \
                patch.object(server, "sa_prompt", return_value="PROMPT-OF-SITE"), patch.object(server, "ai_chat", return_value={"ok": True, "text": text}), \
                patch.object(server, "agent_event", side_effect=lambda *a, **k: ev.append(a)), patch.object(server, "sa_create_lead") as lead, \
                patch.object(server, "_w_allow", return_value=True), patch.object(server, "sa_search", return_value=[]), patch("builtins.print"):
            out = server._sa_reply_turn(self.site, [{"role": "user", "content": "من علی هستم 09121234567"}], {}, "c" * 20, "v" * 20, False, spec)
        return out, ev, lead, sysm

    def test_specialist_without_create_lead_cannot_create_one(self):
        c = cfg(True, support={"surfaces": ["website", "dashboard"]})
        with patch.object(server, "agent_cfg", return_value=c):
            spec = server.agent_spec("team", {"agent": "support", "reason": "rule", "from": None, "handoff": False}, [])
        lead_block = '```lead {"name": "علی", "phone": "09121234567"}```'
        out, ev, lead, sysm = self.turn(spec, "ثبت شد " + lead_block)
        lead.assert_not_called()
        self.assertEqual(out["lead"], {"ok": False, "error": "not-allowed"})
        self.assertIn(("team", SITE, "tool_refused", {"agent": "support", "code": "create_lead"}), ev)
        self.assertEqual(sysm.call_args.kwargs["kb_scope"], ["general", "support", "dashboard_help", "smartx"])
        self.assertIn("پشتیبانی", sysm.call_args.kwargs["persona"])

    def test_online_expert_is_the_current_site_assistant(self):
        c = cfg(True, online_expert={})
        with patch.object(server, "agent_cfg", return_value=c), patch.object(server, "sa_prompt", return_value="PROMPT-OF-SITE"):
            spec = server.agent_spec("team", {"agent": "online_expert", "reason": "only", "from": None, "handoff": False}, [])
        self.assertTrue(spec["persona"].startswith("PROMPT-OF-SITE"))                # reuses the existing sales-assistant prompt
        out, ev, lead, sysm = self.turn(spec, 'باشه ```lead {"name": "علی", "phone": "09121234567"}```')
        lead.assert_called_once()
        out, ev, lead, sysm = self.turn(None, "سلام")                                 # no spec → exactly the 3.9.63 path
        self.assertEqual(sysm.call_args.kwargs["persona"], "PROMPT-OF-SITE")
        self.assertIsNone(sysm.call_args.kwargs["kb_scope"])

    def test_public_chat_routes_logs_handoff_and_returns_agent(self):
        c = cfg(True, sales={}, online_expert={})
        ev = []
        body = {"conversationId": "c" * 20, "visitorId": "v" * 20, "agent": "online_expert",
                "messages": [{"role": "user", "content": "سلام"}, {"role": "assistant", "content": "سلام!"}, {"role": "user", "content": "قیمت و تخفیف؟"}]}
        with patch.object(server, "_w_site_for", return_value=(self.site, "https://arominco.com", None)), \
                patch.object(server, "_w_public_cfg", return_value={"enabled": True}), patch.object(server, "agent_enabled", return_value=True), \
                patch.object(server, "agent_cfg", return_value=c), patch.object(server, "sa_enabled", return_value=True), \
                patch.object(server, "_w_allow", return_value=True), patch.object(server, "sa_prompt", return_value=""), \
                patch.object(server, "agent_event", side_effect=lambda *a, **k: ev.append(a)), \
                patch.object(server, "sa_reply", return_value={"ok": True, "text": "x"}) as reply:
            out = TestClient(server.app).post("/api/widget/public/%s/chat" % SITE, json=body).json()
            self.assertEqual(out["agent"], {"key": "sales", "name": "فروش و مذاکره"})
            spec = reply.call_args.args[6]
            self.assertEqual(spec["agent"], "sales")
            self.assertIn("خلاصهٔ پرونده", spec["persona"])
            self.assertIn(("team", SITE, "handoff", {"from": "online_expert", "to": "sales", "reason": "rule"}), ev)
            body["preview"] = True
            ev.clear()
            TestClient(server.app).post("/api/widget/public/%s/chat" % SITE, json=body)
            self.assertEqual(ev, [])                                                 # preview writes nothing


class TrainingAgentKey(unittest.TestCase):
    def test_samples_and_export_carry_agent_key(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "t.db")
            cx = Connection(db)
            cx.connection.execute("CREATE TABLE agent_training (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT, conversation_id TEXT, messages TEXT,"
                                  " approved INTEGER DEFAULT 0, created_at TIMESTAMP, updated_at TIMESTAMP)")
            cx.connection.commit(); cx.close()
            with patch.object(server, "db_conn", lambda: Connection(db)), patch.object(server, "agent_tables", return_value=True):
                hist = [{"role": "user", "content": "قیمت؟"}, {"role": "assistant", "content": "از کارشناس بپرسید."}]
                self.assertTrue(server.agent_training_save("team", "a" * 20, hist, agent_key="sales"))
                self.assertTrue(server.agent_training_save("team", "b" * 20, hist))
                lines = [json.loads(x) for x in server.agent_ft_export("team").splitlines()]
                self.assertEqual([x["agent_key"] for x in lines], ["sales", "online_expert"])
                self.assertTrue(all(m["role"] in ("system", "user", "assistant") for x in lines for m in x["messages"]))   # meta never exported as a message


if __name__ == "__main__":
    unittest.main()
