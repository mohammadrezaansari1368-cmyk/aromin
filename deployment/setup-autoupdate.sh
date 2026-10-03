#!/usr/bin/env bash
# راه‌اندازیِ یک‌باره‌ی آپدیتِ خودکار (با root اجرا شود). بعد از این، هر پکیجی که در
# /var/www/arominco/releases/incoming بنشیند خودکار نصب، سلامت‌سنجی و در صورتِ خرابی رول‌بک می‌شود.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
R="${RELEASE_DIR:-/var/www/arominco/releases}"
SERVICE="${SERVICE:-aromin-sales}"
SVC_USER="$(systemctl show -p User --value "$SERVICE" 2>/dev/null || true)"
[ -z "$SVC_USER" ] && SVC_USER=aromin-sales
command -v flock >/dev/null && command -v curl >/dev/null || { echo "✗ flock و curl لازم‌اند"; exit 1; }

mkdir -p "$R/incoming" "$R/tmp" "$R/done" "$R/failed" "$R/work"
chown "$SVC_USER":"$SVC_USER" "$R/incoming" "$R/tmp"
cp "$HERE/aromin-autoupdate.sh" /usr/local/bin/.aromin-autoupdate.new && chmod 755 /usr/local/bin/.aromin-autoupdate.new \
  && mv -f /usr/local/bin/.aromin-autoupdate.new /usr/local/bin/aromin-autoupdate.sh

cat > /etc/systemd/system/aromin-autoupdate.service <<UNIT
[Unit]
Description=Aromin auto-update (install new release from inbox)
After=network.target

[Service]
Type=oneshot
Environment=RELEASE_DIR=$R
Environment=APP_DIR=${APP_DIR:-/var/www/arominco/dashboard}
Environment=SERVICE=$SERVICE
ExecStart=/usr/local/bin/aromin-autoupdate.sh
UNIT

cat > /etc/systemd/system/aromin-autoupdate.path <<UNIT
[Unit]
Description=Watch Aromin release inbox

[Path]
PathExistsGlob=$R/incoming/*.tgz
Unit=aromin-autoupdate.service

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now aromin-autoupdate.path
echo "✅ آپدیتِ خودکار فعال شد. صندوق: $R/incoming  |  لاگ: $R/update.log"
systemctl is-active aromin-autoupdate.path
