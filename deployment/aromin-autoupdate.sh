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
  # Each probe is named. A failed install used to roll back with only «ناسالم» and no failing check.
  # Do not pipe into grep -q: under pipefail, grep closes early and curl exits 23 (SIGPIPE),
  # which this function used to report as "legacy APP_VERSION missing" on the 3MB /legacy body.
  local why="" leg
  rm -f "$R/health-fail.txt"
  leg="$(mktemp)"
  trap 'rm -f "$leg"' RETURN
  for _ in $(seq 1 30); do
    sleep 2
    if ! systemctl is-active --quiet "$SERVICE"; then why="service inactive"; continue; fi
    if ! curl -fsS "http://127.0.0.1:$PORT/api/spa-deploy/ping" -o "$leg" 2>/dev/null || ! grep -qE '"deployed"[[:space:]]*:[[:space:]]*true' "$leg"; then why="ping deployed is not true"; continue; fi
    if ! curl -fsS "http://127.0.0.1:$PORT/" -o "$leg" 2>/dev/null || ! grep -q 'id="root"' "$leg"; then why="root missing id=root"; continue; fi
    if ! curl -fsS "http://127.0.0.1:$PORT/legacy" -o "$leg" 2>/dev/null || ! grep -qE 'APP_VERSION *= *"[0-9.]+"' "$leg"; then why="legacy APP_VERSION missing"; continue; fi   # legacy.html: var APP_VERSION = "x.y.z"
    return 0
  done
  echo "   !! health-check failed: ${why:-timeout}" >> "$LOG"
  printf '%s\n' "${why:-timeout}" > "$R/health-fail.txt"
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
  REASON=""
  if ! tar xzf "$F" -C "$W" >>"$LOG" 2>&1 || [ ! -f "$W/aromin-deploy/install.sh" ]; then
    REASON="package extract failed"
  elif ! AROMIN_NO_PURGE=1 APP_DIR="$APP_DIR" SERVICE="$SERVICE" bash "$W/aromin-deploy/install.sh" >>"$LOG" 2>&1; then
    REASON="install.sh failed"
  elif ! healthy; then
    REASON="$(cat "$R/health-fail.txt" 2>/dev/null || echo "health-check failed")"
  fi
  REASON="$(printf '%s' "$REASON" | tr -d '"\\')"
  if [ -z "$REASON" ]; then
    mv -f "$F" "$R/done/"
    if ls /var/tmp/arvan-key* >/dev/null 2>&1 && [ -x /usr/local/bin/aromin-setup-arvan.sh ]; then bash /usr/local/bin/aromin-setup-arvan.sh >> "$LOG" 2>&1 || true; fi
    PURGE="$(/usr/local/bin/aromin-purge.sh 2>&1 | head -1 | tr -d '"\')"; echo "   $PURGE" >> "$LOG"
    status ok "$B" "نصب شد و سالم است · $PURGE"
    echo "   OK" >> "$LOG"
  else
    L1="$(cat "$LASTF" 2>/dev/null || true)"
    if [ -n "$L1" ] && [ "$L1" != "$L0" ] && [ -f "$W/aromin-deploy/rollback.sh" ]; then
      echo "   !! ناسالم ($REASON) → رول‌بک به $L1" >> "$LOG"
      AROMIN_NO_PURGE=1 APP_DIR="$APP_DIR" SERVICE="$SERVICE" bash "$W/aromin-deploy/rollback.sh" "$L1" >>"$LOG" 2>&1 || true
      healthy; /usr/local/bin/aromin-purge.sh >>"$LOG" 2>&1 || true
      status rolledback "$B" "نسخهٔ جدید سالم نبود: $REASON؛ خودکار به نسخهٔ قبل برگشت"
    else
      echo "   !! نصب شروع نشد ($REASON)؛ چیزی تغییر نکرد" >> "$LOG"
      status failed "$B" "پکیج نصب نشد ($REASON)؛ نسخهٔ فعلی دست‌نخورده ماند"
    fi
    mv -f "$F" "$R/failed/" 2>/dev/null || rm -f "$F"
  fi
  rm -rf "$W"
  ls -1t "$R"/done/*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
  ls -1t "$R"/failed/*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f
done
