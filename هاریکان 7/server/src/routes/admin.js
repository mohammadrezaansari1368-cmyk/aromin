// API پنل مدیریت — همه مسیرها فقط با توکن مدیر
import { Router } from 'express';
import { COLLECTIONS, repo, settings, audit, engineData, sql } from '../db.js';
import { requireAuth, createApiToken, listApiTokens, deleteApiToken, createAdmin, checkPassword, hashPassword } from '../auth.js';
import { beforeSave, afterSave, beforeDelete, sanitize } from '../engine/rules.js';
import { performance, leaveUsage, dashboard, dayRow, todayJ, validateRequest } from '../engine/helpers.js';
import { locationsFor } from '../engine/attendance.js';
import { sendSms } from '../engine/sms.js';
import zkRoutes from './zk.js';
import { rebuildPerson } from '../zk/bridge.js';

const r = Router();
r.use(requireAuth('admin'));
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e.errors) return res.status(422).json({ error: e.message, errors: e.errors });
    console.error(e); res.status(500).json({ error: 'خطای داخلی سرور' });
  }
};
const okCollection = (req, res, next) => (COLLECTIONS.includes(req.params.c) ? next() : res.status(404).json({ error: 'مجموعه نامعتبر' }));

// همه داده‌ها برای بارگذاری اولیه پنل
r.get('/bootstrap', wrap((req, res) => {
  const data = Object.fromEntries(COLLECTIONS.map((c) => [c, repo.list(c).map((x) => sanitize(c, x))]));
  res.json({ data, settings: settings.all(), today: todayJ() });
}));

// ───────── CRUD عمومی:  /api/admin/c/:collection
r.get('/c/:c', okCollection, wrap((req, res) => res.json(repo.list(req.params.c).map((x) => sanitize(req.params.c, x)))));
r.get('/c/:c/:id', okCollection, wrap((req, res) => {
  const row = repo.get(req.params.c, req.params.id);
  return row ? res.json(sanitize(req.params.c, row)) : res.status(404).json({ error: 'یافت نشد' });
}));
r.post('/c/:c', okCollection, wrap(async (req, res) => {
  const { c } = req.params;
  const data = beforeSave(c, req.body || {}, { actor: req.user.sub, force: req.query.force === '1' });
  const row = repo.insert(c, { ...data, id: req.body?.id });
  audit(req.user.sub, 'create', c, row.id);
  await afterSave(c, row, {});
  if (c === 'personnel') rebuildPerson(row); // ترددهای دستگاه با همین کد پرسنلی وصل شوند
  res.status(201).json(sanitize(c, row));
}));
r.put('/c/:c/:id', okCollection, wrap(async (req, res) => {
  const { c, id } = req.params;
  const existing = repo.get(c, id);
  if (!existing) return res.status(404).json({ error: 'یافت نشد' });
  const data = beforeSave(c, req.body || {}, { id, existing, actor: req.user.sub, force: req.query.force === '1' });
  const row = repo.update(c, id, data);
  audit(req.user.sub, 'update', c, id, req.body);
  await afterSave(c, row, { existing });
  if (c === 'personnel' && String(existing.code) !== String(row.code)) rebuildPerson(row, existing.code);
  res.json(sanitize(c, row));
}));
r.delete('/c/:c/:id', okCollection, wrap((req, res) => {
  const { c, id } = req.params;
  beforeDelete(c, id);
  const ok = repo.remove(c, id);
  audit(req.user.sub, 'delete', c, id);
  res.json({ ok });
}));

// ───────── درخواست‌ها
r.post('/requests/validate', wrap((req, res) => res.json(validateRequest(engineData(), req.body, { today: todayJ() }))));

// ───────── گزارش‌ها (همان موتور پنل، روی سرور)
const filterPeople = (q) => repo.list('personnel').filter((p) => (!q.group || p.group === q.group) && (!q.person || p.id === q.person));
r.get('/reports/dashboard', wrap((req, res) => {
  const out = dashboard(engineData(), req.query.date || todayJ());
  res.json(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.map((p) => sanitize('personnel', p))])));
}));
r.get('/reports/performance', wrap((req, res) => {
  const D = engineData(); const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from و to الزامی است' });
  res.json(filterPeople(req.query).map((p) => performance(D, p, from, to, { today: todayJ() })));
}));
r.get('/reports/day', wrap((req, res) => {
  const p = repo.get('personnel', req.query.person); if (!p) return res.status(404).json({ error: 'پرسنل یافت نشد' });
  res.json(dayRow(engineData(), p, req.query.date || todayJ()));
}));
r.get('/reports/vacation', wrap((req, res) => {
  const D = engineData(); const year = +req.query.year; const month = +req.query.month;
  res.json(filterPeople(req.query).map((p) => leaveUsage(D, p, year, month)));
}));
r.get('/reports/tracking', wrap((req, res) => res.json(locationsFor(req.query.person, req.query.date || todayJ()))));

// ───────── تنظیمات (قوانین پیامک و…)
r.get('/settings', wrap((req, res) => res.json(settings.all())));
r.put('/settings/:key', wrap((req, res) => res.json(settings.set(req.params.key, req.body?.value))));
r.post('/sms/test', wrap(async (req, res) => res.json(await sendSms(req.body?.to, req.body?.text || 'پیام آزمایشی سامانه حضور و غیاب آرومین'))));

// ───────── توکن‌های وب سرویس
r.get('/tokens', wrap((req, res) => res.json(listApiTokens())));
r.post('/tokens', wrap((req, res) => res.status(201).json(createApiToken(req.body?.name))));
r.delete('/tokens/:id', wrap((req, res) => { deleteApiToken(req.params.id); res.json({ ok: true }); }));

// ───────── مدیران و گزارش تغییرات
r.get('/admins', wrap((req, res) => res.json(sql.prepare('SELECT id, username, name, created_at FROM admins').all())));
r.post('/admins', wrap((req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || String(password || '').length < 8) return res.status(422).json({ error: 'نام کاربری و رمز حداقل ۸ کاراکتر لازم است' });
  createAdmin(username, password, name); res.status(201).json({ ok: true });
}));
r.post('/password', wrap((req, res) => {
  const a = sql.prepare('SELECT * FROM admins WHERE id = ?').get(req.user.sub);
  if (!a || !checkPassword(req.body?.current, a.password_hash)) return res.status(422).json({ error: 'رمز فعلی اشتباه است' });
  if (String(req.body?.next || '').length < 8) return res.status(422).json({ error: 'رمز جدید حداقل ۸ کاراکتر' });
  sql.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.next), a.id); res.json({ ok: true });
}));
// ───────── دستگاه‌های حضور و غیاب و ترددهای تخلیه‌شده
r.use('/zk', zkRoutes);

r.get('/audit', wrap((req, res) => res.json(sql.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300').all())));

export default r;
