#!/usr/bin/env bash
# بازگردانی به آخرین بکاپ (یا:  bash rollback.sh <TIMESTAMP>)
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/arominco/dashboard}"
SERVICE="${SERVICE:-aromin-sales}"
if [ -f "$APP_DIR/srv/server.py" ]; then SRV_DIR="$APP_DIR/srv"; else SRV_DIR="$APP_DIR"; fi
SPA_DIR="$(cd "$SRV_DIR/.." && pwd)/web"
TS="${1:-$(cat "$APP_DIR/backups-install/LAST" 2>/dev/null || true)}"
BK="$APP_DIR/backups-install/$TS"
[ -d "$BK" ] || { echo "✗ بکاپِ $TS پیدا نشد"; exit 1; }
echo "› بازگردانی از $BK"
rm -rf "$SPA_DIR"; [ -d "$BK/web" ] && cp -r "$BK/web" "$SPA_DIR" || true
[ -f "$BK/server.py" ] && cp "$BK/server.py" "$SRV_DIR/server.py" || true
for item in aromin_publish.py aromin_performance.py aromin_stage.py fix_stage_dates.py validate_ledger.py assets migrations/005_publishing.sql migrations/005_publishing.down.sql.txt; do
  if [ -e "$BK/$item" ]; then
    rm -rf "$SRV_DIR/$item"
    mkdir -p "$SRV_DIR/$(dirname "$item")"
    cp -r "$BK/$item" "$SRV_DIR/$item"
  elif [ -f "$BK/$item.absent" ]; then
    rm -rf "$SRV_DIR/$item"
  fi
done
# Database history and public media remain intact; the down migration is manual only.
[ -f "$BK/legacy.html" ] && cp "$BK/legacy.html" "$(cd "$SRV_DIR/.." && pwd)/شروع-اینجا.html" || true
SUDO=""; [ "$(id -u)" != "0" ] && SUDO="sudo"
command -v systemctl >/dev/null 2>&1 && $SUDO systemctl restart "$SERVICE" 2>/dev/null || true
[ -z "${AROMIN_NO_PURGE:-}" ] && [ -x /usr/local/bin/aromin-purge.sh ] && { sleep 4; /usr/local/bin/aromin-purge.sh || true; }
echo "✅ برگشت به $TS"
