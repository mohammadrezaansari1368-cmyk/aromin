#!/usr/bin/env bash
# آپدیتِ سروری با «یک فایل + یک دستور»:
#   1) فایلِ aromin-deploy.tgz را (با WinSCP) در /var/tmp بگذار
#   2) بزن:  bash aromin-update.sh
# این اسکریپت جدیدترین aromin-deploy.tgz را باز می‌کند و install.sh داخلش را اجرا می‌کند
# (install.sh خودش بکاپ می‌گیرد، نصب می‌کند و aromin-sales را ری‌استارت می‌کند).
set -euo pipefail
TGZ="${1:-}"
if [ -z "$TGZ" ]; then
  TGZ="$(ls -t /var/tmp/aromin-deploy.tgz /root/aromin-deploy.tgz ~/aromin-deploy.tgz /var/www/arominco/aromin-deploy.tgz 2>/dev/null | head -1 || true)"
fi
[ -n "$TGZ" ] && [ -f "$TGZ" ] || { echo "✗ aromin-deploy.tgz پیدا نشد. مسیر را بده:  bash aromin-update.sh /path/to/aromin-deploy.tgz"; exit 1; }
echo "› استفاده از: $TGZ"
WORK="$(mktemp -d)"
tar xzf "$TGZ" -C "$WORK"
cd "$WORK/aromin-deploy"
bash install.sh
rm -rf "$WORK"
echo "✅ آپدیت تمام شد."
