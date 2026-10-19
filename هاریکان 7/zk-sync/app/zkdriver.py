"""اتصال به دستگاه حضور و غیاب ZKTeco با SDK پروتکل TCP (پورت پیش‌فرض 4370).

ایمنی: این ماژول فقط یک «پراکسی فقط-خواندنی» از اتصال را بیرون می‌دهد.
هیچ متدی برای پاک کردن رکوردها (clear_attendance / clear_data / delete_user / ...)
در دسترس نیست؛ حتی اگر بخشی از کد به اشتباه آن را صدا بزند، خطا می‌گیرد.
در نتیجه داده‌های داخل دستگاه هیچ‌وقت حذف یا تغییر نمی‌کنند و سیستم‌های دیگر
که به همین دستگاه وصل هستند دست‌نخورده باقی می‌مانند.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime

from . import config

# تنها متدهایی که اجازه صدا زدن دارند
_ALLOWED = {
    "get_attendance", "get_users", "read_sizes", "get_serialnumber",
    "get_device_name", "get_firmware_version", "get_time",
    "disable_device", "enable_device",   # فقط قفل موقت صفحه دستگاه حین خواندن (اختیاری)
}


class ForbiddenDeviceOperation(RuntimeError):
    pass


class ReadOnlyDevice:
    def __init__(self, conn):
        object.__setattr__(self, "_conn", conn)

    def __getattr__(self, name):
        if name not in _ALLOWED:
            raise ForbiddenDeviceOperation(
                f"عملیات «{name}» روی دستگاه مجاز نیست (سرویس فقط-خواندنی است)")
        return getattr(self._conn, name)

    @property
    def records(self):
        return getattr(self._conn, "records", None)

    @property
    def users(self):
        return getattr(self._conn, "users", None)


@dataclass
class Punch:
    user_id: str
    timestamp: datetime
    status: int
    punch: int
    uid: int


@dataclass
class DeviceUser:
    user_id: str
    name: str
    privilege: int
    card: int


def _norm_punch(a):
    return Punch(
        user_id=str(a.user_id).strip(),
        timestamp=a.timestamp,
        status=int(getattr(a, "status", 0) or 0),
        punch=int(getattr(a, "punch", 0) or 0),
        uid=int(getattr(a, "uid", 0) or 0),
    )


@contextmanager
def open_device(ip, port=4370, password=0, timeout=10, disable_during_read=False):
    """اتصال TCP به دستگاه؛ همیشه در پایان disconnect می‌کند."""
    if config.DRIVER == "fake":
        from .fake_driver import FakeConn
        conn = FakeConn.for_address(ip, port, password)
        conn.connect()
    else:
        import time
        from zk import ZK  # pyzk
        zk = ZK(ip, port=int(port), timeout=int(timeout), password=int(password or 0),
                force_udp=False,      # فقط TCP
                ommit_ping=True)      # روی بسیاری از شبکه‌ها ICMP بسته است
        # برخی دستگاه‌ها هم‌زمان فقط یک نشست TCP می‌پذیرند؛ اگر سیستم دیگری
        # در همان لحظه متصل باشد، چند ثانیه بعد دوباره تلاش می‌کنیم.
        for attempt in range(3):
            try:
                conn = zk.connect()
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(4)
    dev = ReadOnlyDevice(conn)
    disabled = False
    try:
        if disable_during_read:
            dev.disable_device()
            disabled = True
        yield dev
    finally:
        try:
            if disabled:
                dev.enable_device()
        finally:
            try:
                conn.disconnect()
            except Exception:
                pass


def read_info(dev):
    info = {}
    for key, fn in (("serial_number", "get_serialnumber"),
                    ("device_name", "get_device_name"),
                    ("firmware", "get_firmware_version")):
        try:
            info[key] = str(getattr(dev, fn)() or "")
        except Exception:
            info[key] = ""
    try:
        t = dev.get_time()
        info["device_time"] = t.strftime("%Y-%m-%d %H:%M:%S") if t else None
    except Exception:
        info["device_time"] = None
    try:
        dev.read_sizes()
        info["record_count"] = dev.records
        info["user_count"] = dev.users
    except Exception:
        info["record_count"] = None
        info["user_count"] = None
    return info


def read_attendance(dev):
    return [_norm_punch(a) for a in (dev.get_attendance() or [])]


def read_users(dev):
    out = []
    for u in dev.get_users() or []:
        out.append(DeviceUser(
            user_id=str(u.user_id).strip(),
            name=(u.name or "").strip(),
            privilege=int(getattr(u, "privilege", 0) or 0),
            card=int(getattr(u, "card", 0) or 0),
        ))
    return out
