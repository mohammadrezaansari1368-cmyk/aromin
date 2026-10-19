#!/usr/bin/env bash
# نصب سرویس تخلیه دستگاه حضور و غیاب آرومین روی Debian 11/12
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/aromin-zk

if [ "$(id -u)" != "0" ]; then echo "با root اجرا کنید: sudo bash deploy/install.sh"; exit 1; fi

echo "==> نصب پیش‌نیازها"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip sqlite3 >/dev/null

echo "==> ساخت کاربر سرویس"
id aromin-zk >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin aromin-zk

echo "==> کپی فایل‌ها"
mkdir -p "$APP" /var/lib/aromin-zk /etc/aromin-zk
cp -r "$SRC/app" "$SRC/requirements.txt" "$APP/"
[ -d "$SRC/web" ] && cp -r "$SRC/web" "$APP/"

echo "==> محیط پایتون"
python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install -q --upgrade pip
"$APP/venv/bin/pip" install -q "fastapi>=0.110" "uvicorn>=0.27" "pydantic>=2.5"
if ! "$APP/venv/bin/pip" install -q pyzk==0.9; then
  echo "   pip install pyzk ناموفق بود؛ نصب از سورس..."
  TMP=$(mktemp -d)
  "$APP/venv/bin/pip" download -q pyzk==0.9 --no-deps --no-binary :all: -d "$TMP"
  tar xzf "$TMP"/pyzk-0.9.tar.gz -C "$TMP"
  SP=$("$APP/venv/bin/python" -c "import sysconfig;print(sysconfig.get_paths()['purelib'])")
  cp -r "$TMP/pyzk-0.9/zk" "$SP/"
  rm -rf "$TMP"
fi
"$APP/venv/bin/python" -c "import zk, fastapi; print('   pyzk و fastapi آماده‌اند')"

if [ ! -f /etc/aromin-zk/aromin-zk.env ]; then
  cp "$SRC/deploy/aromin-zk.env.example" /etc/aromin-zk/aromin-zk.env
  KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)
  sed -i "s/^AZK_API_KEY=.*/AZK_API_KEY=$KEY/" /etc/aromin-zk/aromin-zk.env
  echo "==> کلید API ساخته شد: $KEY"
  echo "    (این کلید را در صفحه داشبورد ← تنظیمات اتصال وارد کنید)"
fi
chmod 640 /etc/aromin-zk/aromin-zk.env
chown -R aromin-zk:aromin-zk "$APP" /var/lib/aromin-zk
chgrp aromin-zk /etc/aromin-zk/aromin-zk.env

echo "==> ثبت سرویس systemd"
cp "$SRC/deploy/aromin-zk.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now aromin-zk
sleep 2
systemctl --no-pager --lines=5 status aromin-zk || true
curl -s http://127.0.0.1:8470/api/health && echo
echo "==> تمام شد."
