#!/usr/bin/env bash
# آپدیتِ خودکارِ آرومین — systemd (aromin-autoupdate.path) وقتی پکیجی در incoming/ بنشیند اجرایش می‌کند.
# نصب → سلامت‌سنجی → اگر سالم نبود، رول‌بک به نسخهٔ قبل. وضعیت در status.json و لاگ در update.log.
set -uo pipefail
R="${RELEASE_DIR:-/var/www/arominco/releases}"
APP_DIR="${APP_DIR:-/var/www/arominco/dashboard}"
SERVICE="${SERVICE:-aromin-sales}"
PORT="${PORT:-3000}"
LOG="$R/update.log"; ST="$R/status.json"; LASTF="$APP_DIR/backups-install/LAST"
mkdir -p "$R/incoming" "$R/done" "$R/failed" "$R/work"
exec 9>"$R/.lock"; flock -n 9 || exit 0

status(){ printf '{"state":"%s","file":"%s","at":"%s","msg":"%s"}\n' "$1" "$2" "$(date -Iseconds)" "$3" > "$ST.tmp" && mv "$ST.tmp" "$ST"; chmod 644 "$ST"; }
healthy(){
  for _ in $(seq 1 30); do
    sleep 2
    systemctl is-active --quiet "$SERVICE" || continue
    curl -fsS "http://127.0.0.1:$PORT/api/spa-deploy/ping" 2>/dev/null | grep -q '"deployed":true' || continue
    curl -fsS "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q 'id="root"' || continue
    curl -fsS "http://127.0.0.1:$PORT/legacy" 2>/dev/null | grep -q 'APP_VERSION=' || continue
    return 0
  done
  return 1
}

while :; do
  F="$(ls -1tr "$R"/incoming/*.tgz 2>/dev/null | head -1)"
  [ -z "$F" ] && break
  B="$(basename "$F")"; W="$R/work/${B%.tgz}"
  rm -rf "$W"; mkdir -p "$W"
  echo "== $(date -Iseconds) $B" >> "$LOG"
  status installing "$B" "در حال نصب"
  L0="$(cat "$LASTF" 2>/dev/null || true)"
  if tar xzf "$F" -C "$W" >>"$LOG" 2>&1 && [ -f "$W/aromin-deploy/install.sh" ] \
     && AROMIN_NO_PURGE=1 APP_DIR="$APP_DIR" SERVICE="$SERVICE" bash "$W/aromin-deploy/install.sh" >>"$LOG" 2>&1 && healthy; then
    mv -f "$F" "$R/done/"
    if ls /var/tmp/arvan-key* >/dev/null 2>&1 && [ -x /usr/local/bin/aromin-setup-arvan.sh ]; then bash /usr/local/bin/aromin-setup-arvan.sh >> "$LOG" 2>&1 || true; fi
    PURGE="$(/usr/local/bin/aromin-purge.sh 2>&1 | head -1 | tr -d '"\')"; echo "   $PURGE" >> "$LOG"
    status ok "$B" "نصب شد و سالم است · $PURGE"
    echo "   OK" >> "$LOG"
  else
    L1="$(cat "$LASTF" 2>/dev/null || true)"
    if [ -n "$L1" ] && [ "$L1" != "$L0" ] && [ -f "$W/aromin-deploy/rollback.sh" ]; then
      echo "   !! ناسالم → رول‌بک به $L1" >> "$LOG"
      AROMIN_NO_PURGE=1 APP_DIR="$APP_DIR" SERVICE="$SERVICE" bash "$W/aromin-deploy/rollback.sh" "$L1" >>"$LOG" 2>&1 || true
      healthy; /usr/local/bin/aromin-purge.sh >>"$LOG" 2>&1 || true
      status rolledback "$B" "نسخهٔ جدید سالم نبود؛ خودکار به نسخهٔ قبل برگشت"
    else
      echo "   !! نصب شروع نشد؛ چیزی تغییر نکرد" >> "$LOG"
      status failed "$B" "پکیج نصب نشد؛ نسخهٔ فعلی دست‌نخورده ماند"
    fi
    mv -f "$F" "$R/failed/" 2>/dev/null || rm -f "$F"
  fi
  rm -rf "$W"
  ls -1t "$R"/done/*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
  ls -1t "$R"/failed/*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
done
