"""Offline policy and lifecycle proofs. SQLite is a test fake, never a runtime backend."""
import datetime as dt
import io
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import aromin_publish as pub
import server

PRODUCT = dict(url="https://arominco.com/product/test", name="صندوق فروشگاهی", title="صندوق",
               description="نمایشگر لمسی برای فروشگاه", image="https://cdnfa.com/product.jpg",
               brand="آرومین", availability="InStock", priceMin=1200000, priceMax=1400000,
               currency="IRT", priceExpired=False, priceValidUntil="2030-01-01")
COPY = dict(problem="مدیریت فروش فروشگاه", product="صندوق فروشگاهی با نمایشگر لمسی",
            value="نظم در فروش", cta="برای مشاوره تماس بگیرید", features=["نمایشگر لمسی"])
ENV = dict(COMPOSIO_API_KEY="fake-key", COMPOSIO_TG_ACCOUNT="fake-account", TELEGRAM_CHANNEL="-1001",
           TELEGRAM_ADMIN_ID="42", BALE_BOT_TOKEN="fake-bale", BALE_CHANNEL_ID="-1002",
           COMPOSIO_IG_ACCOUNT="platform-account", INSTAGRAM_IG_USER_ID="ig-user", COMPOSIO_USER_ID="platform-user")


def config(**extra):
    value = dict(enabled=True, preparation_time="09:00", publishing_time="10:00", destinations=["telegram"])
    value.update(extra)
    return pub.settings(value, ENV)


class Cursor:
    def __init__(self, connection):
        self.cursor = connection.cursor()

    def execute(self, sql, args=()):
        sql = sql.replace("%s", "?").replace(" FOR UPDATE", "").replace("INSERT IGNORE", "INSERT OR IGNORE")
        sql = sql.replace("UPDATE pub_deliveries d SET", "UPDATE pub_deliveries AS d SET")
        try:
            self.cursor.execute(sql, args)
        except sqlite3.IntegrityError as error:
            raise server.pymysql.err.IntegrityError(1062, "duplicate") from error
        return self.cursor.rowcount

    @property
    def rowcount(self):
        return self.cursor.rowcount

    @property
    def lastrowid(self):
        return self.cursor.lastrowid

    def fetchone(self):
        row = self.cursor.fetchone()
        return dict(row) if row else None

    def fetchall(self):
        return [dict(row) for row in self.cursor.fetchall()]

    def close(self):
        self.cursor.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class Connection:
    def __init__(self, path):
        self.connection = sqlite3.connect(path, isolation_level=None, detect_types=sqlite3.PARSE_DECLTYPES)
        self.connection.row_factory = sqlite3.Row

    def cursor(self):
        return Cursor(self.connection)

    def begin(self):
        self.connection.execute("BEGIN IMMEDIATE")

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()


class PolicyTests(unittest.TestCase):
    def test_settings_disabled_and_configuration_required(self):
        self.assertFalse(pub.settings()["enabled"])
        for value in (dict(enabled=True), dict(enabled=True, preparation_time="11:00", publishing_time="10:00", destinations=["telegram"]),
                      dict(enabled=True, preparation_time="09:00", publishing_time="10:00", destinations=["bale"])):
            with self.assertRaises(ValueError):
                pub.settings(value, {})
        self.assertEqual(pub.settings(dict(enabled=True, preparation_time="09:00", publishing_time="10:00", destinations=["whatsapp_channel"], approval_mode="automatic"), {})["approval_mode"], "automatic")
        for limits in (dict(max_ai_calls_per_run=3), dict(max_image_api_calls_per_run=1)):
            with self.assertRaises(ValueError):
                pub.settings(dict(cost_limits=limits))

    def test_tehran_window_and_no_backfill(self):
        c = config()
        day = dt.date(2026, 10, 7)
        self.assertEqual(pub.slot_time(day, "10:00"), dt.datetime(2026, 10, 7, 6, 30))
        self.assertIsNone(pub.daily_slot(dt.datetime(2026, 10, 7, 5, 29), c))
        self.assertEqual(pub.daily_slot(dt.datetime(2026, 10, 7, 5, 30), c)[0], day)
        self.assertIsNone(pub.daily_slot(dt.datetime(2026, 10, 7, 6, 30), c))
        self.assertIsNone(pub.daily_slot(dt.datetime(2026, 10, 12, 12), c))

    def test_copy_rejects_invented_numbers_prices_links_and_features(self):
        self.assertEqual(pub.validate_copy(COPY, PRODUCT), COPY)
        for text in ("قیمت مناسب", "۱۲۰۰ تومان", "#محصول", "https://example.org", "تلفن ۰۹۱۲۳۴۵۶۷۸۹", "نمایشگر ۹۹ اینچ"):
            with self.assertRaises(ValueError):
                pub.validate_copy(dict(COPY, product=text), PRODUCT)
        for features in (["الف"] * 4, ["الف" * 46], "bad"):
            with self.assertRaises(ValueError):
                pub.validate_copy(dict(COPY, features=features), PRODUCT)

    def test_fingerprint_all_source_fields_and_optional_price(self):
        for field in ("name", "title", "description", "brand", "image", "availability"):
            self.assertNotEqual(pub.fingerprint(PRODUCT), pub.fingerprint(dict(PRODUCT, **{field: "changed"})))
        changed = dict(PRODUCT, priceMax=1900000)
        self.assertEqual(pub.fingerprint(PRODUCT), pub.fingerprint(changed))
        self.assertNotEqual(pub.fingerprint(PRODUCT, True), pub.fingerprint(changed, True))
        self.assertEqual(pub.digest(dict(a=1, b=2)), pub.digest(dict(b=2, a=1)))

    def test_rotation_priority_cooldown_exclusions_and_stock(self):
        r = pub.settings()["rotation"]
        r.update(priority_urls=["b"], exclude_urls=["c"], exclude_keywords=["نامناسب"])
        self.assertEqual(pub.candidates(["a", "b", "c", "d"], r, {"a"}), ["b", "d"])
        self.assertFalse(pub.eligible(dict(PRODUCT, availability="OutOfStock"), r))
        self.assertFalse(pub.eligible(dict(PRODUCT, description="نامناسب"), r))
        self.assertFalse(pub.eligible(dict(PRODUCT, image=""), r))

    def test_ambiguous_network_errors_never_retry(self):
        for error in (TimeoutError(), OSError(), urllib.error.URLError(TimeoutError()), urllib.error.URLError("SSL failure"),
                      urllib.error.HTTPError("https://fake", 503, "bad", {}, None)):
            self.assertEqual(pub.error_kind(error), "uncertain")
        for error in (socket.gaierror(), ConnectionRefusedError(), urllib.error.URLError(socket.gaierror()),
                      urllib.error.HTTPError("https://fake", 429, "rate", {}, None)):
            self.assertEqual(pub.error_kind(error), "retry")

    def test_render_jpeg_safe_geometry_aspect_and_verified_price(self):
        from PIL import Image
        photo = io.BytesIO()
        Image.new("RGB", (400, 200), "red").save(photo, "PNG")
        channel, story, boxes = pub.render(PRODUCT, COPY, photo.getvalue(), Path(server.HERE) / "assets", show_price=True)
        for data, size in ((channel, (1080, 1080)), (story, (1080, 1920))):
            image = Image.open(io.BytesIO(data))
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.size, size)
        self.assertTrue(all(x0 >= 120 and x1 <= 960 and y0 >= 250 and y1 <= 1670 for x0, y0, x1, y1 in boxes))
        image = Image.open(io.BytesIO(story))
        # Contain scales the 2:1 photo to 840x420, centered in the 840x540 region.
        self.assertGreater(image.getpixel((130, 650))[0], 220)
        self.assertLess(image.getpixel((130, 650))[1], 30)
        self.assertGreater(image.getpixel((130, 590))[1], 220)
        self.assertIn("۱٬۲۰۰٬۰۰۰", pub.price_text(PRODUCT))
        with self.assertRaises(ValueError):
            pub.price_text(dict(PRODUCT, priceExpired=True))


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = str(Path(self.temp.name) / "test.sqlite")
        schema = (Path(server.HERE) / "migrations/005_publishing.sql").read_text()
        schema = schema.replace("BIGINT AUTO_INCREMENT PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
        schema = re.sub(r"UNIQUE KEY \w+", "UNIQUE", schema)
        schema = re.sub(r", KEY pub_work \([^)]*\)", "", schema)
        schema = schema.replace("ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", "").replace("DATETIME", "TIMESTAMP")
        cx = sqlite3.connect(self.database)
        cx.executescript(schema)
        cx.execute("CREATE TABLE tg_posts(product_url TEXT,tenant TEXT,status TEXT,created_at TIMESTAMP)")
        cx.close()
        self.addCleanup(patch.stopall)
        patch.object(server, "db_conn", side_effect=lambda: Connection(self.database)).start()
        patch.object(server, "sa_start_worker").start()
        patch.object(server, "_sa_kick").start()
        patch.object(server, "_tg_try").start()
        patch.object(server, "pub_notify").start()
        patch.object(server, "pub_env", return_value=ENV).start()
        patch.object(server.urllib.request, "urlopen", side_effect=AssertionError("network forbidden in proof")).start()
        self.now = dt.datetime(2026, 10, 7, 5, 45)
        patch.object(server, "pub_now", side_effect=lambda: self.now).start()
        self.cfg = config()

    def draft(self, **extra):
        job_id = server.pub_reserve_daily("test", self.cfg, self.now)
        token = "lease"
        server._tg_exec("UPDATE pub_jobs SET product_json=%s,product_url=%s,source_fingerprint=%s,lease_token=%s,lease_until=%s WHERE id=%s",
                        (pub.canonical(PRODUCT), PRODUCT["url"], pub.fingerprint(PRODUCT), token, self.now + dt.timedelta(minutes=10), job_id))
        for key, value in extra.items():
            server._tg_exec("UPDATE pub_jobs SET " + key + "=%s WHERE id=%s", (value, job_id))
        return server.pub_job(job_id)

    def ready(self):
        sha = pub.digest(pub.snapshot(1, PRODUCT, COPY, "a" * 64, "b" * 64, self.cfg))
        return self.draft(copy_json=pub.canonical(COPY), channel_asset="a" * 64, story_asset="b" * 64,
                          snapshot_sha256=sha, approved_snapshot=sha, status="APPROVED")

    def test_daily_slot_unique_across_ticks_restart_and_concurrent_calls(self):
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as pool:
            ids = list(pool.map(lambda _: server.pub_reserve_daily("test", self.cfg, self.now), range(2)))
        self.assertEqual(sum(i is not None for i in ids), 1)
        self.assertIsNone(server.pub_reserve_daily("test", self.cfg, self.now))
        self.assertEqual(len(server.q("SELECT * FROM pub_jobs")), 1)
        self.assertIsNone(server.pub_reserve_daily("test", self.cfg, dt.datetime(2026, 10, 10, 12)))

    def test_slot_transaction_rolls_back_if_job_insert_fails(self):
        server._tg_exec("DROP TABLE pub_jobs")
        with self.assertRaises(sqlite3.OperationalError):
            server.pub_reserve_daily("test", self.cfg, self.now)
        self.assertEqual(server.q("SELECT * FROM pub_slots"), [])

    def test_ai_reserved_before_request_and_resumed_copy_makes_none(self):
        job = self.draft()
        def ai(*args, **kwargs):
            stored = server.pub_job(job["id"])
            self.assertEqual((stored["ai_calls"], stored["ai_state"]), (1, "PENDING"))
            return dict(ok=True, text=pub.canonical(COPY))
        with patch.object(server, "ai_chat", side_effect=ai) as chat, patch.object(server, "assistant_system", return_value="system"), \
                patch.object(server, "_tg_fetch_image", return_value=(b"photo", "image/jpeg")), \
                patch.object(pub, "render", return_value=(b"channel", b"story", [])) as render, \
                patch.object(server, "pub_store_asset", side_effect=["a" * 64, "b" * 64]):
            server.pub_prepare(job, self.cfg)
            self.assertEqual(chat.call_count, 1)
            stored = server.pub_job(job["id"])
            server.pub_prepare(stored, self.cfg)
            self.assertEqual((chat.call_count, render.call_count), (1, 1))
            self.assertEqual(stored["ai_state"], "DONE")

    def test_pending_crash_counts_toward_budget_and_validation_retry_bounded(self):
        job = self.draft(ai_calls=1, ai_state="PENDING")
        with patch.object(server, "assistant_system", return_value="system"), patch.object(server, "ai_chat", return_value=dict(ok=True, text="invalid")) as ai:
            with self.assertRaisesRegex(ValueError, "budget"):
                server.pub_prepare(job, self.cfg)
            self.assertEqual(ai.call_count, 1)
            stored = server.pub_job(job["id"])
            with self.assertRaisesRegex(ValueError, "budget"):
                server.pub_prepare(stored, self.cfg)
            self.assertEqual((stored["ai_calls"], ai.call_count), (2, 1))

    def test_approval_snapshot_and_late_slot_compete_with_daily(self):
        job = self.ready()
        server._tg_exec("UPDATE pub_jobs SET status='AWAITING_APPROVAL' WHERE id=%s", (job["id"],))
        with self.assertRaisesRegex(ValueError, "stale"):
            server.pub_approve(job["id"], "old", "manager", "test")
        self.now = dt.datetime(2026, 10, 7, 7)
        server.pub_approve(job["id"], job["snapshot_sha256"], "manager", "test")
        approved = server.pub_job(job["id"])
        self.assertEqual(approved["publish_at_utc"], dt.datetime(2026, 10, 8, 6, 30))
        self.assertIsNone(server.pub_reserve_daily("test", self.cfg, dt.datetime(2026, 10, 8, 5, 45)))
        with self.assertRaises(ValueError):
            server.pub_approve(job["id"], job["snapshot_sha256"], "manager", "other-tenant")

    def test_late_immediate_approval(self):
        self.cfg = config(late_approval_policy="immediate")
        job = self.ready()
        server._tg_exec("UPDATE pub_jobs SET status='AWAITING_APPROVAL' WHERE id=%s", (job["id"],))
        self.now = dt.datetime(2026, 10, 7, 7)
        server.pub_approve(job["id"], job["snapshot_sha256"], "manager", "test")
        self.assertEqual(server.pub_job(job["id"])["publish_at_utc"], job["publish_at_utc"])
        self.assertEqual(len(server.q("SELECT * FROM pub_slots")), 1)

    def test_automatic_ready_is_approved_and_late_regeneration_defers(self):
        self.cfg = config(approval_mode="automatic")
        job = self.ready()
        server._tg_exec("UPDATE pub_jobs SET status='READY' WHERE id=%s", (job["id"],))
        server.pub_approve(job["id"], job["snapshot_sha256"], "automatic", automatic=True)
        self.assertEqual(server.pub_job(job["id"])["publish_at_utc"], job["publish_at_utc"])
        server._tg_exec("UPDATE pub_jobs SET status='READY' WHERE id=%s", (job["id"],))
        self.now = dt.datetime(2026, 10, 7, 7)
        server.pub_approve(job["id"], job["snapshot_sha256"], "automatic", automatic=True)
        self.assertEqual(server.pub_job(job["id"])["publish_at_utc"], dt.datetime(2026, 10, 8, 6, 30))

    def test_freshness_description_change_regenerates_and_preserves_sent_uncertain(self):
        job = self.ready()
        for destination, status in (("telegram", "SENT"), ("bale", "UNCERTAIN"), ("instagram_story", "FAILED")):
            server._tg_exec("INSERT INTO pub_deliveries(job_id,generation,snapshot_sha256,destination,status) VALUES(%s,1,%s,%s,%s)", (job["id"], job["snapshot_sha256"], destination, status))
        changed = dict(PRODUCT, description="توضیح تازه")
        with patch.object(server, "sa_fetch", return_value=("url", "page")), patch.object(server, "parse_product_page", return_value=changed):
            self.assertFalse(server.pub_fresh(job, self.cfg))
        stored = server.pub_job(job["id"])
        self.assertEqual((stored["generation"], stored["status"], stored["ai_calls"], stored["ai_state"]), (2, "PREPARING", 0, "NONE"))
        self.assertIsNone(stored["approved_snapshot"])
        statuses = {r["destination"]: r["status"] for r in server.q("SELECT * FROM pub_deliveries")}
        self.assertEqual(statuses, dict(telegram="SENT", bale="UNCERTAIN", instagram_story="BLOCKED"))
        with self.assertRaises(ValueError):
            server.pub_approve(job["id"], job["snapshot_sha256"], "manager")

    def test_partial_delivery_retry_sent_and_uncertain_not_resent_whatsapp_assets(self):
        self.cfg = config(destinations=["telegram", "bale", "whatsapp_channel"])
        job = self.ready()
        def first_send(_, delivery):
            if delivery["destination"] == "bale":
                raise pub.DeliveryError("retry")
            return "1949", "https://t.me/aromin_online/1949"
        with patch.object(server, "pub_fresh", return_value=True), patch.object(server, "pub_send", side_effect=first_send) as send:
            server.pub_deliver(job, self.cfg)
            self.assertEqual(send.call_count, 2)
        self.now += dt.timedelta(minutes=2)
        with patch.object(server, "pub_fresh", return_value=True), patch.object(server, "pub_send", side_effect=TimeoutError()) as send:
            server.pub_deliver(server.pub_job(job["id"]), self.cfg)
            self.assertEqual(send.call_count, 1)
            self.assertEqual(send.call_args.args[1]["destination"], "bale")
        with patch.object(server, "pub_fresh", return_value=True), patch.object(server, "pub_send") as send:
            server.pub_deliver(server.pub_job(job["id"]), self.cfg)
            send.assert_not_called()
        report = server.pub_report(server.pub_job(job["id"]))
        self.assertEqual({r["destination"]: r["status"] for r in report["deliveries"]}, dict(telegram="SENT", bale="UNCERTAIN", whatsapp_channel="BLOCKED"))
        self.assertIn(pub.WHATSAPP_BLOCK, report["deliveries"][2]["last_error"])
        self.assertTrue(report["caption"] and report["story_url"] and report["channel_url"])

    def test_earlier_sent_uncertain_destinations_skip_new_generation(self):
        self.cfg = config(destinations=["telegram", "bale", "instagram_story"])
        job = self.ready()
        for destination, status in (("telegram", "SENT"), ("bale", "UNCERTAIN")):
            server._tg_exec("INSERT INTO pub_deliveries(job_id,generation,snapshot_sha256,destination,status) VALUES(%s,1,%s,%s,%s)", (job["id"], job["snapshot_sha256"], destination, status))
        sha = pub.digest(pub.snapshot(2, PRODUCT, COPY, "a" * 64, "b" * 64, self.cfg))
        server._tg_exec("UPDATE pub_jobs SET generation=2,snapshot_sha256=%s,approved_snapshot=%s WHERE id=%s", (sha, sha, job["id"]))
        with patch.object(server, "pub_fresh", return_value=True), patch.object(server, "pub_send", return_value=("new", None)) as send:
            server.pub_deliver(server.pub_job(job["id"]), self.cfg)
            self.assertEqual(send.call_count, 1)
            self.assertEqual(send.call_args.args[1]["destination"], "instagram_story")

    def test_instagram_container_persisted_and_reused(self):
        job = self.ready()
        snapshot = pub.canonical(pub.snapshot(1, PRODUCT, COPY, "a" * 64, "b" * 64, self.cfg))
        server._tg_exec("INSERT INTO pub_deliveries(job_id,generation,snapshot_sha256,snapshot_json,destination,status,inflight) VALUES(%s,1,%s,%s,'instagram_story','SENDING',1)", (job["id"], job["snapshot_sha256"], snapshot))
        delivery = server.q("SELECT * FROM pub_deliveries")[0]
        with patch.dict(os.environ, ENV), patch.object(server, "pub_ig", side_effect=[dict(id="container"), pub.DeliveryError("retry")]) as ig:
            with self.assertRaises(pub.DeliveryError):
                server.pub_send(job, delivery)
            self.assertEqual([c.args[0] for c in ig.call_args_list], [pub.IG_CREATE, pub.IG_PUBLISH])
        delivery = server.q("SELECT * FROM pub_deliveries")[0]
        self.assertEqual(json.loads(delivery["remote_state"])["creation_id"], "container")
        with patch.dict(os.environ, ENV), patch.object(server, "pub_ig", return_value=dict(id="media")) as ig:
            self.assertEqual(server.pub_send(job, delivery), ("media", None))
            self.assertEqual(ig.call_args.args[0], pub.IG_PUBLISH)

    def test_scheduled_telegram_ambiguous_urlerror_is_uncertain_legacy_unchanged(self):
        with patch.object(server, "COMPOSIO_API_KEY", "fake"), patch.object(server, "COMPOSIO_TG_ACCOUNT", "fake"), \
                patch.object(server.urllib.request, "urlopen", side_effect=urllib.error.URLError(TimeoutError())):
            with self.assertRaises(pub.DeliveryError) as scheduled:
                server._tg_composio("sendPhoto", dict(chat_id="fake", photo="https://fake"), scheduled=True)
            self.assertEqual(scheduled.exception.kind, "uncertain")
            with self.assertRaises(server.TgError) as legacy:
                server._tg_composio("sendPhoto", dict(chat_id="fake", photo="https://fake"))
            self.assertEqual(legacy.exception.kind, "retry")

    def save_config(self):
        server._tg_exec("INSERT INTO pub_settings(tenant,settings,updated_at) VALUES('test',%s,%s)", (pub.canonical(self.cfg), self.now))

    def test_tick_expired_inflight_uncertain_and_not_resent(self):
        job = self.ready()
        self.save_config()
        server._tg_exec("UPDATE pub_jobs SET status='DELIVERING',lease_until=NULL,lease_token=NULL WHERE id=%s", (job["id"],))
        snapshot = pub.canonical(pub.snapshot(1, PRODUCT, COPY, "a" * 64, "b" * 64, self.cfg))
        server._tg_exec("INSERT INTO pub_deliveries(job_id,generation,snapshot_sha256,snapshot_json,destination,status,inflight,lease_until) VALUES(%s,1,%s,%s,'telegram','SENDING',1,%s)", (job["id"], job["snapshot_sha256"], snapshot, self.now - dt.timedelta(seconds=1)))
        self.now = dt.datetime(2026, 10, 7, 6, 31)
        with patch.object(server, "pub_fresh", return_value=True), patch.object(server, "pub_send") as send:
            server.pub_tick()
            send.assert_not_called()
        self.assertEqual(server.q("SELECT status FROM pub_deliveries")[0]["status"], "UNCERTAIN")
        self.assertEqual(server.pub_job(job["id"])["status"], "PARTIAL")

    def test_manager_not_sent_resolution_forces_freshness_before_attempt(self):
        job = self.ready()
        self.save_config()
        server._tg_exec("UPDATE pub_jobs SET status='PARTIAL',lease_until=NULL,lease_token=NULL,revalidated_at=%s WHERE id=%s", (self.now, job["id"]))
        snapshot = pub.canonical(pub.snapshot(1, PRODUCT, COPY, "a" * 64, "b" * 64, self.cfg))
        _, delivery_id = server._tg_exec("INSERT INTO pub_deliveries(job_id,generation,snapshot_sha256,snapshot_json,destination,status,attempts) VALUES(%s,1,%s,%s,'telegram','UNCERTAIN',1)", (job["id"], job["snapshot_sha256"], snapshot))
        with patch.object(server, "kb_identity", return_value=dict(user="manager", role="manager")):
            self.assertTrue(server.publishing_resolve(delivery_id, None, dict(outcome="not_sent"), "test")["ok"])
        self.assertIsNone(server.pub_job(job["id"])["revalidated_at"])
        self.now = dt.datetime(2026, 10, 7, 6, 31)
        with patch.object(server, "sa_fetch", return_value=("url", "page")) as fetch, \
                patch.object(server, "parse_product_page", return_value=dict(PRODUCT, description="تغییر منبع")), \
                patch.object(server, "pub_send") as send:
            server.pub_tick()
            fetch.assert_called_once()
            send.assert_not_called()
        self.assertEqual(server.pub_job(job["id"])["generation"], 2)
        self.assertEqual(server.q("SELECT status FROM pub_deliveries")[0]["status"], "BLOCKED")

    def test_freshness_before_retry_when_gate_age_exceeded(self):
        job = self.ready()
        job["revalidated_at"] = self.now - dt.timedelta(minutes=31)
        with patch.object(server, "sa_fetch", return_value=("url", "page")) as fetch, patch.object(server, "parse_product_page", return_value=PRODUCT):
            self.assertTrue(server.pub_fresh(job, self.cfg))
            self.assertTrue(server.pub_fresh(job, self.cfg))
            fetch.assert_called_once()
        self.assertEqual(job["revalidated_at"], self.now)

    def test_old_preview_reject_cannot_reject_current_generation(self):
        job = self.ready()
        server._tg_exec("UPDATE pub_jobs SET generation=2,status='AWAITING_APPROVAL',preview_message_id=9 WHERE id=%s", (job["id"],))
        callback = dict(id="cb", data="reject_pub:%s" % job["id"], **{"from": {"id": 42}}, message=dict(message_id=8, chat=dict(id=42)))
        with patch.object(server, "TG_ADMIN_ID", 42):
            self.assertEqual(server.tg_handle_callback(callback), "stale")
        self.assertEqual(server.pub_job(job["id"])["status"], "AWAITING_APPROVAL")

    def test_tick_missing_image_dependencies_blocks_without_breaking_server(self):
        job = self.draft(copy_json=pub.canonical(COPY))
        self.save_config()
        server._tg_exec("UPDATE pub_jobs SET lease_until=NULL,lease_token=NULL WHERE id=%s", (job["id"],))
        with patch.object(server, "_tg_fetch_image", return_value=(b"photo", "image/jpeg")), patch.object(pub, "render", side_effect=RuntimeError("image dependencies missing")):
            server.pub_tick()
        stored = server.pub_job(job["id"])
        self.assertEqual(stored["status"], "BLOCKED")
        self.assertEqual(stored["last_error"], "image dependencies missing")
        self.assertEqual(stored["ai_calls"], 0)

    def test_tick_disabled_creates_nothing(self):
        self.cfg = pub.settings()
        self.save_config()
        server.pub_tick()
        self.assertEqual(server.q("SELECT * FROM pub_jobs"), [])

    def test_delivery_snapshot_tampering_never_calls_provider(self):
        job = self.ready()
        snapshot = pub.snapshot(1, PRODUCT, COPY, "a" * 64, "b" * 64, self.cfg)
        snapshot["caption"] = "متن عوض شده"
        delivery = dict(destination="telegram", generation=1, snapshot_sha256=job["snapshot_sha256"], snapshot_json=pub.canonical(snapshot))
        with patch.object(server, "_tg_composio") as provider:
            with self.assertRaises(pub.DeliveryError):
                server.pub_send(job, delivery)
            provider.assert_not_called()

    def test_bale_fallback_fields_only(self):
        job = self.ready()
        snapshot = pub.snapshot(1, PRODUCT, COPY, "a" * 64, "b" * 64, self.cfg)
        delivery = dict(destination="bale", generation=1, snapshot_sha256=job["snapshot_sha256"], snapshot_json=pub.canonical(snapshot))
        with patch.dict(os.environ, ENV), patch.object(server, "pub_provider_request", return_value=dict(message_id=5)) as provider:
            self.assertEqual(server.pub_send(job, delivery), ("5", None))
            self.assertEqual(set(provider.call_args.args[1]), {"chat_id", "photo", "caption"})

    def test_numeric_telegram_channel_has_public_username_link(self):
        job = self.ready()
        snapshot = pub.snapshot(1, PRODUCT, COPY, "a" * 64, "b" * 64, self.cfg)
        delivery = dict(destination="telegram", generation=1, snapshot_sha256=job["snapshot_sha256"], snapshot_json=pub.canonical(snapshot))
        with patch.object(server, "TG_CHANNEL", "-1001005246727"), patch.object(server, "TG_CHANNEL_USERNAME", "aromin_online"), patch.object(server, "_tg_composio", return_value=dict(message_id=1949)):
            self.assertEqual(server.pub_send(job, delivery), ("1949", "https://t.me/aromin_online/1949"))

    def test_manager_guards_and_redaction(self):
        with patch.object(server, "kb_identity", return_value=None):
            self.assertEqual(server.publishing_settings_get(None, "test").status_code, 401)
        with patch.object(server, "kb_identity", return_value=dict(role="sales", user="sales")):
            self.assertEqual(server.publishing_settings_get(None, "test").status_code, 403)
            self.assertEqual(server.publishing_jobs(None, "test").status_code, 403)
        job = self.ready()
        with patch.dict(os.environ, BALE_BOT_TOKEN="sensitive-test-token"):
            server.pub_audit(job["id"], "error", "sensitive-test-token")
            server._tg_exec("UPDATE pub_jobs SET last_error=%s WHERE id=%s", ("sensitive-test-token", job["id"]))
            self.assertNotIn("sensitive-test-token", pub.canonical(server.pub_report(server.pub_job(job["id"]))))
            self.assertEqual(server.q("SELECT detail FROM pub_audit")[0]["detail"], "[redacted]")

    def test_media_rejects_traversal_and_missing(self):
        self.assertEqual(server.publishing_media("../secret").status_code, 404)
        self.assertEqual(server.publishing_media("a" * 64).status_code, 404)


if __name__ == "__main__":
    unittest.main()
