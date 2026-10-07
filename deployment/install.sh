#!/usr/bin/env bash
# نصبِ یک‌دستوریِ آرومین (React SPA + server.py) — اول بکاپ، بعد نصب، بعد ری‌استارت.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${APP_DIR:-/var/www/arominco/dashboard}"
SERVICE="${SERVICE:-aromin-sales}"
SUDO=""; [ "$(id -u)" != "0" ] && SUDO="sudo"
if   [ -f "$APP_DIR/srv/server.py" ]; then SRV_DIR="$APP_DIR/srv"
elif [ -f "$APP_DIR/server.py"     ]; then SRV_DIR="$APP_DIR"
else echo "✗ server.py در $APP_DIR پیدا نشد. مسیر را بده:  APP_DIR=/path/به/dashboard bash install.sh"; exit 1; fi
if [ -f "$SRV_DIR/migrations/004_check_collection.sql" ] && ! cmp -s "$HERE/migrations/004_check_collection.sql" "$SRV_DIR/migrations/004_check_collection.sql"; then
  echo "Conflicting migration 004_check_collection.sql; no files changed." >&2; exit 1
fi
SPA_DIR="$(cd "$SRV_DIR/.." && pwd)/web"
if [ -f "$SRV_DIR/migrations/005_publishing.sql" ] && ! cmp -s "$HERE/migrations/005_publishing.sql" "$SRV_DIR/migrations/005_publishing.sql"; then
  echo "Conflicting migration 005_publishing.sql; no files changed." >&2; exit 1
fi
TS="$(date +%Y%m%d-%H%M%S)"
BK="$APP_DIR/backups-install/$TS"; mkdir -p "$BK"
echo "› بکاپ در: $BK"
[ -e "$SPA_DIR" ]            && cp -r "$SPA_DIR" "$BK/web"        || true
[ -f "$SRV_DIR/server.py" ] && cp "$SRV_DIR/server.py" "$BK/"    || true
for item in aromin_publish.py aromin_stage.py fix_stage_dates.py validate_ledger.py assets migrations/005_publishing.sql migrations/005_publishing.down.sql.txt; do
  mkdir -p "$BK/$(dirname "$item")"
  if [ -e "$SRV_DIR/$item" ]; then cp -r "$SRV_DIR/$item" "$BK/$item"; else touch "$BK/$item.absent"; fi
done
LEGACY="$(cd "$SRV_DIR/.." && pwd)/شروع-اینجا.html"
[ -f "$LEGACY" ] && cp "$LEGACY" "$BK/legacy.html" || true
echo "$TS" > "$APP_DIR/backups-install/LAST"
echo "› نصبِ فایل‌ها"
rm -rf "$SPA_DIR"; cp -r "$HERE/web" "$SPA_DIR"
cp "$HERE/server.py" "$SRV_DIR/server.py"
cp "$HERE/aromin_publish.py" "$SRV_DIR/aromin_publish.py"
cp "$HERE/aromin_stage.py" "$HERE/fix_stage_dates.py" "$HERE/validate_ledger.py" "$SRV_DIR/"   # «تغییر مرحله» + اصلاحِ تاریخی (dry-run پیش‌فرض) + گزارشِ اعتبارسنجی (فقط خواندن)
mkdir -p "$SRV_DIR/assets" "$SRV_DIR/migrations"
cp -r "$HERE/assets/." "$SRV_DIR/assets/"
cp "$HERE/migrations/005_publishing.sql" "$HERE/migrations/005_publishing.down.sql.txt" "$SRV_DIR/migrations/"
if ! "$SRV_DIR/.venv/bin/pip" install Pillow==11.3.0 arabic-reshaper==3.0.0 python-bidi==0.6.6; then
  echo "Publishing image dependencies unavailable; preparation will be BLOCKED. Server installation continues." >&2
fi
if [ -f "$HERE/migrations/004_check_collection.sql" ]; then
  mkdir -p "$SRV_DIR/migrations"
  cp "$HERE/migrations/004_check_collection.sql" "$SRV_DIR/migrations/004_check_collection.sql"
fi
# اپِ قبلی (همهٔ ابزارها، روی /legacy) — فقط اگر در پکیج باشد
if [ -f "$HERE/legacy.html" ]; then cp "$HERE/legacy.html" "$LEGACY"; echo "  + اپِ کامل (/legacy) به‌روز شد"; fi
# به‌روزرسانِ خودکار (اگر نصب شده) — جایگزینیِ اتمیک تا اسکریپتِ در حالِ اجرا خراب نشود
if [ -f "$HERE/aromin-autoupdate.sh" ] && [ -f /usr/local/bin/aromin-autoupdate.sh ]; then
  cp "$HERE/aromin-autoupdate.sh" /usr/local/bin/.aromin-autoupdate.new && chmod 755 /usr/local/bin/.aromin-autoupdate.new     && mv -f /usr/local/bin/.aromin-autoupdate.new /usr/local/bin/aromin-autoupdate.sh && echo "  + به‌روزرسانِ خودکار به‌روز شد"
fi
# ابزارِ Purgeِ آروان
if [ -f "$HERE/aromin-purge.sh" ]; then cp "$HERE/aromin-purge.sh" /usr/local/bin/.aromin-purge.new && chmod 755 /usr/local/bin/.aromin-purge.new && mv -f /usr/local/bin/.aromin-purge.new /usr/local/bin/aromin-purge.sh; fi
[ -f "$HERE/setup-arvan.sh" ] && cp "$HERE/setup-arvan.sh" /usr/local/bin/.aromin-setup-arvan.new && chmod 755 /usr/local/bin/.aromin-setup-arvan.new && mv -f /usr/local/bin/.aromin-setup-arvan.new /usr/local/bin/aromin-setup-arvan.sh || true
# دسترسیِ نوشتن به کاربرِ خودِ سرویس (نه root) تا آپدیتِ HTTP (npm run deploy) و OTA کار کنند
SVC_USER="$(systemctl show -p User --value "$SERVICE" 2>/dev/null || true)"
[ -z "$SVC_USER" ] && id aromin-sales >/dev/null 2>&1 && SVC_USER=aromin-sales
if [ -n "$SVC_USER" ] && [ "$SVC_USER" != "root" ]; then
  chown -R "$SVC_USER":"$SVC_USER" "$SPA_DIR" 2>/dev/null || true
  chown "$SVC_USER":"$SVC_USER" "$(dirname "$SPA_DIR")" 2>/dev/null || true
  [ -f "$LEGACY" ] && chown "$SVC_USER":"$SVC_USER" "$LEGACY" 2>/dev/null || true
  echo "  + دسترسیِ نوشتن به $SVC_USER داده شد"
fi
echo "› ری‌استارتِ سرویس ($SERVICE)"
RS=""
if command -v systemctl >/dev/null 2>&1; then
  for s in "$SERVICE" arominco aromin dashboard aromin-server; do
    # بدونِ pipe: «grep -q» زیرِ pipefail شرط را اشتباهاً نادرست می‌کرد
    if systemctl cat "$s.service" >/dev/null 2>&1; then $SUDO systemctl restart "$s" && RS="$s" && break; fi
  done
fi
echo "✅ نصب شد. نسخهٔ بکاپ: $TS"
if [ -n "$RS" ]; then echo "سرویسِ $RS ری‌استارت شد."; else echo "⚠ سرویس خودکار ری‌استارت نشد؛ دستی:  sudo systemctl restart $SERVICE"; fi
# کلیدِ جدیدِ آروان (اگر در /var/tmp گذاشته شده) خودکار تنظیم می‌شود
if [ "${AROMIN_APPLY_ARVAN_KEY:-}" = "1" ] && ls /var/tmp/arvan-key* >/dev/null 2>&1 && [ -x /usr/local/bin/aromin-setup-arvan.sh ]; then sleep 4; bash /usr/local/bin/aromin-setup-arvan.sh || true
elif [ -z "${AROMIN_NO_PURGE:-}" ] && [ -x /usr/local/bin/aromin-purge.sh ]; then sleep 4; /usr/local/bin/aromin-purge.sh || true; fi
echo "رول‌بک:  bash \"$HERE/rollback.sh\""
