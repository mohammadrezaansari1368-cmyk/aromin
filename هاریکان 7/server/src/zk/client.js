// ارتباط سرور اصلی با «سرویس تخلیه دستگاه» (پوشه zk-sync — پایتون، TCP 4370)
// سرویس روی همین سرور با آدرس داخلی اجرا می‌شود؛ مرورگر هیچ‌وقت مستقیم به آن وصل نمی‌شود.
export const ZK_URL = (process.env.ZK_SERVICE_URL || '').replace(/\/+$/, '');
const KEY = process.env.ZK_SERVICE_KEY || '';

export class ZkError extends Error { constructor(msg, status = 502) { super(msg); this.status = status; } }
export const zkConfigured = () => !!ZK_URL;

const detail = (j, status) => {
  const d = j?.detail ?? j?.error;
  if (Array.isArray(d)) return d.map((x) => x.msg || String(x)).join('، ');
  return d || `خطای سرویس دستگاه (${status})`;
};

/** پاسخ خام (برای فایل CSV) */
export async function zkRaw(path, { method = 'GET', body, user, timeout = 180000 } = {}) {
  if (!ZK_URL) throw new ZkError('سرویس تخلیه دستگاه تنظیم نشده است (ZK_SERVICE_URL در فایل .env)', 503);
  try {
    return await fetch(ZK_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY, 'X-User': encodeURIComponent(user || 'hozour') },
      body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new ZkError(e?.name === 'TimeoutError' ? 'پاسخ سرویس دستگاه طول کشید' : 'سرویس تخلیه دستگاه در دسترس نیست (systemctl status aromin-zk)', 502);
  }
}

export async function zkJson(path, opts) {
  const r = await zkRaw(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ZkError(r.status === 401 ? 'کلید سرویس دستگاه (ZK_SERVICE_KEY) اشتباه است' : detail(j, r.status), r.status === 401 ? 502 : r.status);
  return j;
}
export { detail as zkDetail };
