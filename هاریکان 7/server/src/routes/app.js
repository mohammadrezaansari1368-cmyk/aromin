// API اپلیکیشن پرسنل — فقط با توکن پرسنل
import { Router } from 'express';
import { repo, engineData } from '../db.js';
import { requireAuth, checkPassword, hashPassword } from '../auth.js';
import { clock, saveLocation, ClockError } from '../engine/attendance.js';
import { beforeSave, afterSave } from '../engine/rules.js';
import { dayRow, leaveUsage, performance, todayJ, shiftWindow } from '../engine/helpers.js';

const r = Router();
r.use(requireAuth('employee'));
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof ClockError) return res.status(422).json({ error: e.message, ...e.extra });
    if (e.errors) return res.status(422).json({ error: e.message, errors: e.errors });
    console.error(e); res.status(500).json({ error: 'خطای داخلی سرور' });
  }
};

r.get('/me', wrap((req, res) => {
  const p = req.person; const D = engineData(); const date = todayJ();
  const [y, m] = date.split('/').map(Number);
  const wp = repo.get('workplaces', p.workplace);
  const today = repo.where('attendance', 'person', p.id).filter((a) => a.date === date);
  res.json({
    id: p.id, name: `${p.firstName} ${p.lastName}`, code: p.code, jobTitle: p.jobTitle, photo: p.photo, tracking: !!p.tracking,
    workplace: wp ? { name: wp.name, lat: wp.lat, lng: wp.lng, radius: wp.radius } : null,
    shift: repo.get('shifts', p.shift)?.name, shiftToday: shiftWindow(D, p, date),
    date, today, isIn: today.some((a) => !a.out), day: dayRow(D, p, date),
    leave: leaveUsage(D, p, y, m - 1),
    month: performance(D, p, `${y}/${String(m).padStart(2, '0')}/01`, date, { today: date }),
    projects: repo.list('projects').filter((pr) => pr.status !== 'غیر فعال' && (pr.members || []).includes(p.id)).map((pr) => ({ id: pr.id, name: pr.name })),
    unread: repo.list('messages').filter((msg) => msg.to.includes(p.id) && !msg.read.includes(p.id)).length,
  });
}));

r.post('/clock', wrap((req, res) => res.json(clock(req.person, req.body || {}))));
r.post('/location', wrap((req, res) => res.json(saveLocation(req.person, req.body || {}))));

r.get('/attendance', wrap((req, res) => {
  const { from, to } = req.query;
  res.json(repo.where('attendance', 'person', req.person.id).filter((a) => (!from || a.date >= from) && (!to || a.date <= to)).sort((a, b) => b.date.localeCompare(a.date)));
}));

r.get('/request-types', wrap((req, res) => res.json(repo.list('requestTypes').filter((t) => t.active).map((t) => t.name))));
r.get('/requests', wrap((req, res) => res.json(repo.where('requests', 'person', req.person.id).reverse())));
r.post('/requests', wrap(async (req, res) => {
  const { kind, from, to, fromTime, toTime, note } = req.body || {};
  const data = beforeSave('requests', { kind, from, to, fromTime, toTime, note, person: req.person.id, status: 'در دست بررسی', bySelf: true });
  const row = repo.insert('requests', data);
  await afterSave('requests', row, {});
  res.status(201).json(row);
}));
r.delete('/requests/:id', wrap((req, res) => {
  const row = repo.get('requests', req.params.id);
  if (!row || row.person !== req.person.id) return res.status(404).json({ error: 'یافت نشد' });
  if (row.status !== 'در دست بررسی') return res.status(422).json({ error: 'فقط درخواست در دست بررسی قابل لغو است' });
  repo.remove('requests', row.id); res.json({ ok: true });
}));

r.get('/messages', wrap((req, res) => res.json(repo.list('messages').filter((m) => m.to.includes(req.person.id))
  .map((m) => ({ id: m.id, title: m.title, body: m.body, date: m.date || m.createdAt, read: m.read.includes(req.person.id) })).reverse())));
r.post('/messages/:id/read', wrap((req, res) => {
  const m = repo.get('messages', req.params.id);
  if (!m || !m.to.includes(req.person.id)) return res.status(404).json({ error: 'یافت نشد' });
  if (!m.read.includes(req.person.id)) repo.update('messages', m.id, { read: [...m.read, req.person.id] });
  res.json({ ok: true });
}));

r.post('/password', wrap((req, res) => {
  if (!checkPassword(req.body?.current, req.person.passwordHash)) return res.status(422).json({ error: 'رمز فعلی اشتباه است' });
  if (String(req.body?.next || '').length < 6) return res.status(422).json({ error: 'رمز جدید حداقل ۶ کاراکتر' });
  repo.update('personnel', req.person.id, { passwordHash: hashPassword(req.body.next) }); res.json({ ok: true });
}));

export default r;
