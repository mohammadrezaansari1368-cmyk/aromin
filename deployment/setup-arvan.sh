#!/usr/bin/env bash
# تنظیمِ Purgeِ خودکارِ آروان (با root). کلید فقط از فایلی به نامِ arvan-key*.txt در /var/tmp خوانده می‌شود.
# install.sh اگر آن فایل را ببیند، خودکار همین را اجرا می‌کند؛ دستی:  bash /usr/local/bin/aromin-setup-arvan.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DOM="${ARVAN_DOMAIN:-arominco.com}"
SERVICE="${SERVICE:-aromin-sales}"
ENVF=/etc/aromin/arvan.env
PURGE=/usr/local/bin/aromin-purge.sh
[ -f "$HERE/aromin-purge.sh" ] && [ "$HERE" != /usr/local/bin ] && cp "$HERE/aromin-purge.sh" "$PURGE.new" && chmod 755 "$PURGE.new" && mv -f "$PURGE.new" "$PURGE"

# فقط فایل‌هایی با نامِ arvan-key* (هیچ فایلِ دیگری خوانده یا پاک نمی‌شود)
SRC=""
for f in /var/tmp/arvan-key.txt /var/tmp/arvan-key*; do [ -f "$f" ] && { SRC="$f"; break; }; done

if [ -n "$SRC" ]; then
  RAW="$(tr -d ' \t\r\n' < "$SRC")"
  KEY="$(printf '%s' "$RAW" | sed -E 's/^[Aa][Pp][Ii][Kk][Ee][Yy]//')"
  if ! printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9._-]{20,200}$'; then
    echo "✗ محتوای $SRC شبیهِ کلیدِ API نیست (فقط حروف/عدد/خط‌تیره، بدونِ متنِ دیگر). چیزی تغییر نکرد."; exit 1
  fi
  mkdir -p /etc/aromin
  umask 077
  printf 'ARVAN_API_KEY=%s\nARVAN_DOMAIN=%s\n' "$KEY" "$DOM" > "$ENVF.new"
  SVC_USER="$(systemctl show -p User --value "$SERVICE" 2>/dev/null || true)"
  if [ -n "$SVC_USER" ] && [ "$SVC_USER" != root ] && chgrp "$SVC_USER" "$ENVF.new" 2>/dev/null; then chmod 640 "$ENVF.new"; else chmod 600 "$ENVF.new"; fi
  mv -f "$ENVF.new" "$ENVF"
  shred -u "$SRC" 2>/dev/null || rm -f "$SRC"
  echo "› کلیدِ جدید ذخیره شد (فایلِ موقت پاک شد)."
  systemctl restart "$SERVICE" 2>/dev/null || true
elif [ -f "$ENVF" ]; then
  echo "› کلیدِ قبلی استفاده می‌شود ($ENVF)"
else
  echo "✗ فایلِ /var/tmp/arvan-key.txt پیدا نشد."; exit 1
fi

"$PURGE" --check
if "$PURGE"; then echo "✅ Purgeِ خودکار فعال است."; else echo "⚠ کلید ذخیره شد ولی Purge هنوز کار نمی‌کند (علت بالا)."; fi
exit 0
