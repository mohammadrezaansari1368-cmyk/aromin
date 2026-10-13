// API دستگاه‌ها و ترددهای تخلیه‌شده — زیر /api/admin/zk (فقط مدیر)
// درخواست‌ها به سرویس تخلیه دستگاه (zk-sync) فرستاده می‌شوند؛ بعد از هر تغییر،
// پل دستگاه بلافاصله اجرا می‌شود تا گزارش کارکرد همان لحظه به‌روز باشد.
import { Router } from 'express';
import { audit } from '../db.js';
import { zkRaw, zkJson, zkConfigured, zkDetail, ZkError, ZK_URL } from '../zk/client.js';
import { pull, rebuildAll, bridgeStatus } from '../zk/bridge.js';

const r = Router();
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof ZkError) return res.status(e.status).json({ error: e.message });
    console.error(e); res.status(500).json({ error: 'خطای داخلی سرور' });
  }
};

r.get('/status', wrap(async (req, res) => {
  let service = null; let error = null;
  if (zkConfigured()) { try { service = await zkJson('/health', { timeout: 5000 }); } catch (e) { error = e.message; } }
  res.json({ configured: zkConfigured(), url: ZK_URL || null, service, error, bridge: bridgeStatus() });
}));
r.post('/pull', wrap(async (req, res) => res.json(await pull())));
r.post('/rebuild', wrap(async (req, res) => { await pull().catch(() => {}); const out = rebuildAll(); audit(req.user.sub, 'rebuild', 'zk', null); res.json(out); }));

// مسیرهای مجاز سرویس دستگاه
const ALLOWED = [
  /^devices$/, /^devices\/test$/, /^devices\/\d+$/, /^devices\/\d+\/(test|sync)$/, /^sync-all$/, /^sync-runs$/,
  /^attendance$/, /^attendance\/export\.csv$/, /^attendance\/\d+$/, /^attendance\/\d+\/(restore|revert|history)$/,
  /^people$/, /^people\/[\w-]{1,32}$/, /^stats$/, /^reports\/(daily|summary)(\.csv)?$/,
];
const CHANGES_DATA = /^(attendance|devices\/\d+\/sync|sync-all)/;

r.all('/*', wrap(async (req, res) => {
  const p = req.params[0];
  if (!ALLOWED.some((re) => re.test(p))) return res.status(404).json({ error: 'مسیر یافت نشد' });
  const qs = new URLSearchParams(req.query).toString();
  const up = await zkRaw(`/${p}${qs ? '?' + qs : ''}`, { method: req.method, body: req.body, user: req.user.sub });
  if (req.method !== 'GET') {
    audit(req.user.sub, req.method.toLowerCase(), 'zk', p, req.method === 'DELETE' ? null : req.body);
    if (up.ok && CHANGES_DATA.test(p)) await pull().catch(() => {});
  }
  const type = up.headers.get('content-type') || '';
  if (type.includes('text/csv')) {
    res.status(up.status).set({ 'Content-Type': type, 'Content-Disposition': up.headers.get('content-disposition') || 'attachment' });
    return res.send(Buffer.from(await up.arrayBuffer()));
  }
  const j = await up.json().catch(() => ({}));
  if (!up.ok) return res.status(up.status === 401 ? 502 : up.status).json({ error: up.status === 401 ? 'کلید سرویس دستگاه (ZK_SERVICE_KEY) اشتباه است' : zkDetail(j, up.status) });
  res.status(up.status).json(j);
}));

export default r;
