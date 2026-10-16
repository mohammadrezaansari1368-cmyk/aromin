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
for mig in 006_identity_attendance.sql 007_calls.sql 008_tickets.sql 009_batch_rows.sql 010_harikan_exports.sql; do   # applied once by migrate.py on start; a changed copy must never be re-shipped
  if [ -f "$SRV_DIR/migrations/$mig" ] && ! cmp -s "$HERE/migrations/$mig" "$SRV_DIR/migrations/$mig"; then
    echo "Conflicting migration $mig; no files changed." >&2; exit 1
  fi
done
if [ -f "$SRV_DIR/migrations/005_publishing.sql" ] && ! cmp -s "$HERE/migrations/005_publishing.sql" "$SRV_DIR/migrations/005_publishing.sql"; then
  echo "Conflicting migration 005_publishing.sql; no files changed." >&2; exit 1
fi
TS="$(date +%Y%m%d-%H%M%S)"
BK="$APP_DIR/backups-install/$TS"; mkdir -p "$BK"
echo "› بکاپ در: $BK"
[ -e "$SPA_DIR" ]            && cp -r "$SPA_DIR" "$BK/web"        || true
[ -f "$SRV_DIR/server.py" ] && cp "$SRV_DIR/server.py" "$BK/"    || true
for item in aromin_publish.py aromin_performance.py aromin_identity.py aromin_attendance.py aromin_calls.py aromin_tickets.py aromin_stage.py fix_stage_dates.py validate_ledger.py assets migrations/005_publishing.sql migrations/005_publishing.down.sql.txt migrations/006_identity_attendance.sql migrations/006_identity_attendance.down.sql.txt migrations/007_calls.sql migrations/007_calls.down.sql.txt migrations/008_tickets.sql migrations/008_tickets.down.sql.txt migrations/009_batch_rows.sql migrations/009_batch_rows.down.sql.txt migrations/010_harikan_exports.sql migrations/010_harikan_exports.down.sql.txt; do
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
cp "$HERE/aromin_performance.py" "$HERE/aromin_stage.py" "$HERE/fix_stage_dates.py" "$HERE/validate_ledger.py" "$SRV_DIR/"
cp "$HERE/aromin_identity.py" "$HERE/aromin_attendance.py" "$HERE/aromin_calls.py" "$HERE/aromin_tickets.py" "$SRV_DIR/"   # server.py imports these (WP-A/B/C/4)
# «تغییر مرحله» + اصلاحِ تاریخی (dry-run پیش‌فرض) + گزارشِ اعتبارسنجی (فقط خواندن)
mkdir -p "$SRV_DIR/assets" "$SRV_DIR/migrations"
cp -r "$HERE/assets/." "$SRV_DIR/assets/"
cp "$HERE/migrations/005_publishing.sql" "$HERE/migrations/005_publishing.down.sql.txt" "$SRV_DIR/migrations/"
cp "$HERE/migrations/006_identity_attendance.sql" "$HERE/migrations/006_identity_attendance.down.sql.txt" "$HERE/migrations/007_calls.sql" "$HERE/migrations/007_calls.down.sql.txt" "$HERE/migrations/008_tickets.sql" "$HERE/migrations/008_tickets.down.sql.txt" "$HERE/migrations/009_batch_rows.sql" "$HERE/migrations/009_batch_rows.down.sql.txt" "$HERE/migrations/010_harikan_exports.sql" "$HERE/migrations/010_harikan_exports.down.sql.txt" "$SRV_DIR/migrations/"
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
# کلیدِ سرورِ MCP (/api/mcp) — فقط روی سرور؛ هرگز در مخزن یا بسته نیست. مثلِ setup-arvan.sh: مالک root، گروهِ کاربرِ سرویس، 640.
# اگر /var/tmp/aromin-mcp-token.txt (۳۲ تا ۲۰۰ نویسهٔ [A-Za-z0-9._-]) باشد جایگزین می‌شود و فایل پاک می‌شود؛ وگرنه فقط بارِ اول کلیدِ تصادفی ساخته می‌شود.
MCP_ENVF="${MCP_ENV:-/etc/aromin/mcp.env}"
MCP_SRC=/var/tmp/aromin-mcp-token.txt
mkdir -p "$(dirname "$MCP_ENVF")"
MCP_NEW=""
if [ -f "$MCP_SRC" ]; then
  MCP_NEW="$(tr -d ' \t\r\n' < "$MCP_SRC")"
  if ! printf '%s' "$MCP_NEW" | grep -Eq '^[A-Za-z0-9._-]{32,200}$'; then echo "✗ $MCP_SRC شبیهِ کلید نیست؛ کلیدِ MCP تغییر نکرد."; MCP_NEW=""; fi
  shred -u "$MCP_SRC" 2>/dev/null || rm -f "$MCP_SRC"
elif [ ! -f "$MCP_ENVF" ]; then
  MCP_NEW="$(openssl rand -hex 32 2>/dev/null || python3 -c 'import secrets; print(secrets.token_hex(32))')"
fi
if [ -n "$MCP_NEW" ]; then
  ( umask 077; printf 'MCP_TOKEN=%s\nMCP_TENANT=team\n' "$MCP_NEW" > "$MCP_ENVF.new" ) && mv -f "$MCP_ENVF.new" "$MCP_ENVF"
  echo "  + کلیدِ MCP ذخیره شد: $MCP_ENVF   (دیدن: sudo grep MCP_TOKEN $MCP_ENVF)"
fi
if [ -f "$MCP_ENVF" ]; then
  if [ -n "$SVC_USER" ] && [ "$SVC_USER" != root ] && chgrp "$SVC_USER" "$MCP_ENVF" 2>/dev/null; then chmod 640 "$MCP_ENVF"; else chmod 600 "$MCP_ENVF"; fi
fi
unset MCP_NEW
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
