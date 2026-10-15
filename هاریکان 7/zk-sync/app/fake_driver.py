"""دستگاه شبیه‌سازی‌شده برای تست بدون سخت‌افزار (AZK_DRIVER=fake)."""
import threading
from datetime import datetime, timedelta
from types import SimpleNamespace

_registry = {}
_lock = threading.Lock()


class FakeConn:
    def __init__(self, ip):
        self.ip = ip
        self.records_list = []
        self.users_list = [
            SimpleNamespace(user_id="1", name="Noora", privilege=0, card=0),
            SimpleNamespace(user_id="2", name="Kimia", privilege=0, card=0),
            SimpleNamespace(user_id="3", name="Niloofar", privilege=0, card=0),
        ]
        self.cleared = False
        self.fail = False
        self.disabled = False

    @classmethod
    def for_address(cls, ip, port, password):
        with _lock:
            if ip not in _registry:
                _registry[ip] = cls(ip)
            return _registry[ip]

    def add(self, user_id, ts, punch=0, status=1):
        self.records_list.append(SimpleNamespace(
            user_id=str(user_id), timestamp=ts, status=status, punch=punch,
            uid=len(self.records_list) + 1))

    def seed_day(self, day):
        for uid, (h1, m1, h2, m2) in {"1": (8, 55, 16, 40), "2": (9, 10, 17, 5), "3": (8, 30, 15, 50)}.items():
            self.add(uid, day.replace(hour=h1, minute=m1, second=0), 0)
            self.add(uid, day.replace(hour=h2, minute=m2, second=0), 1)

    # ---- API شبیه pyzk ----
    def connect(self):
        if self.fail or self.ip.startswith("10.255."):
            raise ConnectionError("can't reach device (ping/tcp timeout)")
        return self

    def disconnect(self):
        return True

    def disable_device(self):
        self.disabled = True

    def enable_device(self):
        self.disabled = False

    def get_serialnumber(self):
        return "FAKE" + self.ip.replace(".", "")

    def get_device_name(self):
        return "Simulated ZK"

    def get_firmware_version(self):
        return "Ver 6.60"

    def get_time(self):
        return datetime.now()

    def read_sizes(self):
        self.records = len(self.records_list)
        self.users = len(self.users_list)
        return True

    def get_attendance(self):
        return list(self.records_list)

    def get_users(self):
        return list(self.users_list)

    def clear_attendance(self):  # نباید هرگز صدا زده شود
        self.cleared = True
        self.records_list.clear()


def reset():
    with _lock:
        _registry.clear()


def get(ip):
    return _registry.get(ip)


def demo_seed(ip, days=5):
    conn = FakeConn.for_address(ip, 4370, 0)
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    for d in range(days, 0, -1):
        day = today - timedelta(days=d)
        if day.weekday() != 4:  # جمعه نه
            conn.seed_day(day)
    return conn
