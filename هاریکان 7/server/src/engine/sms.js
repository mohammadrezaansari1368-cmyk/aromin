// موتور پیامک — پیش‌فرض: کاوه‌نگار. برای سرویس‌دهنده دیگر فقط تابع send را کامل کنید.
import { repo, settings } from '../db.js';

const PROVIDERS = {
  'کاوه نگار': async ({ apiKey, line }, to, text) => {
    const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`;
    const body = new URLSearchParams({ receptor: to, sender: line, message: text });
    const r = await fetch(url, { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.return?.status !== 200) throw new Error(j?.return?.message || `HTTP ${r.status}`);
    return j;
  },
  'ملی پیامک': async ({ apiKey, line }, to, text) => {
    // apiKey به شکل username:password
    const [username, password] = String(apiKey).split(':');
    const r = await fetch('https://rest.payamak-panel.com/api/SendSMS/SendSMS', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, to, from: line, text, isflash: false }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
};

/** ارسال پیامک؛ اگر سرشماره‌ای تعریف نشده باشد بی‌صدا رد می‌شود */
export async function sendSms(to, text) {
  const line = repo.list('smsLines')[0];
  if (!line || !to) return { skipped: true, reason: 'سرشماره پیامکی تعریف نشده' };
  const fn = PROVIDERS[line.provider];
  if (!fn) return { skipped: true, reason: `سرویس‌دهنده «${line.provider}» پشتیبانی نمی‌شود` };
  if (process.env.SMS_DRY_RUN === '1') { console.log('[SMS dry-run]', to, text); return { dryRun: true }; }
  try { await fn(line, to, text); return { sent: true }; }
  catch (e) { console.error('SMS error:', e.message); return { sent: false, error: e.message }; }
}

/** ارسال بر اساس قوانین تعریف‌شده در «پنل پیامک ← قوانین» */
export async function notify(rule, to, text) {
  const rules = settings.get('smsRules', {});
  if (!rules[rule]) return { skipped: true, reason: 'قانون غیرفعال است' };
  return sendSms(to, text);
}
