"""زمان‌بند داخلی: هر چند ثانیه بررسی می‌کند کدام دستگاه موعد تخلیه‌اش رسیده است."""
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from . import config, db, sync

log = logging.getLogger("azk.scheduler")


class Scheduler:
    def __init__(self):
        self._stop = threading.Event()
        self._thread = None
        self._pool = ThreadPoolExecutor(max_workers=config.MAX_PARALLEL_SYNCS,
                                        thread_name_prefix="azk-sync")
        self._last_attempt = {}   # device_id -> datetime (در حافظه، شامل تلاش‌های ناموفق)

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="azk-scheduler", daemon=True)
        self._thread.start()
        log.info("scheduler started (tick=%ss)", config.SCHEDULER_TICK_SEC)

    def stop(self):
        self._stop.set()
        self._pool.shutdown(wait=False, cancel_futures=True)

    def next_run(self, device):
        if not (device["active"] and device["auto_sync"]):
            return None
        last = self._last_attempt.get(device["id"])
        if last is None and device.get("last_sync_at"):
            last = datetime.strptime(device["last_sync_at"], "%Y-%m-%d %H:%M:%S")
        if last is None:
            return datetime.now()
        return last + timedelta(minutes=max(1, int(device["interval_min"])))

    def tick(self):
        now = datetime.now()
        for d in db.rows("SELECT * FROM devices WHERE active=1 AND auto_sync=1"):
            nr = self.next_run(d)
            if nr is not None and nr <= now and not sync.is_running(d["id"]):
                self._last_attempt[d["id"]] = now
                self._pool.submit(self._safe_sync, d["id"])

    def _safe_sync(self, device_id):
        try:
            r = sync.run_sync(device_id, trigger="auto")
            log.info("auto sync device=%s -> %s", device_id, r.get("message"))
        except Exception:
            log.exception("auto sync crashed for device %s", device_id)

    def _loop(self):
        while not self._stop.is_set():
            try:
                self.tick()
            except Exception:
                log.exception("scheduler tick failed")
            self._stop.wait(config.SCHEDULER_TICK_SEC)


scheduler = Scheduler()
