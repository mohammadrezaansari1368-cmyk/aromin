#!/usr/bin/env bash
# پاک‌کردنِ خودکارِ کشِ ArvanCloud بعد از هر نصب/رول‌بک.
# کلید فقط روی سرور: /etc/aromin/arvan.env  (ARVAN_API_KEY=… ، ARVAN_DOMAIN=arominco.com)
# پیش‌فرض فقط صفحه‌های داشبورد پاک می‌شوند (نه کلِ دامنه)؛ اگر API نپذیرفت، «all».
set -uo pipefail
ENVF="${ARVAN_ENV:-/etc/aromin/arvan.env}"
# فایل source نمی‌شود؛ فقط دو کلید با grep خوانده می‌شوند
getv(){ [ -f "$ENVF" ] && grep -m1 "^$1=" "$ENVF" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true; }
KEY="${ARVAN_API_KEY:-$(getv ARVAN_API_KEY)}"; DOM="${ARVAN_DOMAIN:-$(getv ARVAN_DOMAIN)}"; PFX="${ARVAN_AUTH_PREFIX:-Apikey}"
if [ -n "$KEY" ] && ! printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9._-]{20,200}$'; then
  echo "✗ کلیدِ ذخیره‌شده در $ENVF خراب است؛ کلید را در /var/tmp/arvan-key.txt بگذار و: bash /usr/local/bin/aromin-setup-arvan.sh"; exit 3
fi
HOST="${DASH_HOST:-dashboard.arominco.com}"
if [ -z "$KEY" ] || [ -z "$DOM" ]; then
  echo "⚠ Purge: کلیدِ آروان تنظیم نشده ($ENVF) — یک‌بار: bash setup-arvan.sh"; exit 0
fi
API="${ARVAN_API_URL:-https://napi.arvancloud.ir/cdn/4.0/domains/$DOM/caching/purge}"
# عیب‌یابی:  aromin-purge.sh --check  → آیا کلید/شبکه کار می‌کند و دامنه در حساب هست؟ (کلید چاپ نمی‌شود)
if [ "${1:-}" = "--check" ]; then
  C="$(curl -sS -o /tmp/.arvan-chk.out -w '%{http_code}' --max-time 20 "https://napi.arvancloud.ir/cdn/4.0/domains" -H "Authorization: $PFX $KEY" 2>/dev/null || true)"
  echo "› بررسیِ کلید: HTTP $C"
  case "$C" in
    2*) L="$(python3 -c 'import json,sys;d=json.load(open("/tmp/.arvan-chk.out")).get("data") or [];print(" ".join(str(x.get("name") or x.get("domain") or "") for x in d))' 2>/dev/null || true)"
        if [ -z "$L" ]; then echo "  ⚠ این کلید به هیچ دامنه‌ای دسترسی ندارد → در پنلِ آروان به کلید/کاربرِ ماشین دسترسیِ CDNِ $DOM (مدیریتِ کش) بده."; else echo "  دامنه‌های این حساب: $L"; echo "  دامنهٔ تنظیم‌شده: $DOM"; fi;;
    401) echo "  کلید نامعتبر است (کامل کپی نشده یا حذف شده).";;
    403) if grep -qi '<html' /tmp/.arvan-chk.out; then echo "  آروان درخواستِ این سرور را مسدود کرد (صفحهٔ Forbidden) — احتمالاً IPِ سرور یا محدودیتِ IP روی کلید."; else echo "  کلید دسترسیِ کافی ندارد: $(head -c 200 /tmp/.arvan-chk.out)"; fi;;
    000) echo "  سرور به napi.arvancloud.ir وصل نشد (شبکه/DNS).";;
    *) echo "  پاسخ: $(head -c 200 /tmp/.arvan-chk.out)";;
  esac
  exit 0
fi
call(){ # $1 = body → کدِ HTTP
  rm -f /tmp/.arvan-purge.out; curl -sS -o /tmp/.arvan-purge.out -w '%{http_code}' --max-time 20 -X POST "$API" \
    -H "Authorization: $PFX $KEY" -H 'Content-Type: application/json' -d "$1" 2>/dev/null || true
}
URLS="\"https://$HOST/\",\"https://$HOST/index.html\",\"https://$HOST/legacy\",\"https://$HOST/legacy/\",\"https://$HOST/widget.js\",\"https://$HOST/widget-bot.js\""
for i in 1 2 3; do
  C="$(call "{\"purge\":\"individual\",\"purge_urls\":[$URLS]}")"
  case "$C" in 2*) echo "✅ Purge آروان انجام شد (صفحه‌های $HOST)"; exit 0;; 401|403) break;; 4*) C2="$(call '{"purge":"all"}')"; case "$C2" in 2*) echo "✅ Purge آروان انجام شد (کلِ $DOM)"; exit 0;; esac; C="$C2"; break;; esac
  sleep 3
done
if grep -qi '<html' /tmp/.arvan-purge.out 2>/dev/null; then echo "✗ Purge آروان ناموفق (HTTP $C، صفحهٔ Forbidden)"; else echo "✗ Purge آروان ناموفق (HTTP $C): $(head -c 300 /tmp/.arvan-purge.out 2>/dev/null)"; fi
[ "$C" = 401 ] || [ "$C" = 403 ] && echo "  عیب‌یابی:  bash /usr/local/bin/aromin-purge.sh --check"
exit 3
