// وب سرویس عمومی (برای اتصال حسابداری، حقوق و دستمزد، دستگاه حضور و غیاب)
// احراز هویت: هدر  Authorization: Bearer arm_xxx  یا  X-API-Key: arm_xxx
import { Router } from 'express';
import { repo, engineData } from '../db.js';
import { requireApiToken } from '../auth.js';
import { sanitize } from '../engine/rules.js';
import { performance, todayJ, isJDate, normJ } from '../engine/helpers.js';
import { devicePunch, ClockError } from '../engine/attendance.js';

const r = Router();
r.use(requireApiToken);

r.get('/personnel', (req, res) => res.json(repo.list('personnel').map((p) => {
  const { id, code, firstName, lastName, mobile, jobTitle, status, workplace, group } = sanitize('personnel', p);
  return { id, code, firstName, lastName, mobile, jobTitle, status, workplace, group };
})));

r.get('/attendance', (req, res) => {
  const { from, to } = req.query;
  res.json(repo.list('attendance').filter((a) => (!from || a.date >= from) && (!to || a.date <= to))
    .map(({ id, person, date, in: i, out, project }) => ({ id, person, code: repo.get('personnel', person)?.code, date, in: i, out, project })));
});

r.get('/performance', (req, res) => {
  const { from, to } = req.query;
  if (!isJDate(normJ(from)) || !isJDate(normJ(to))) return res.status(400).json({ error: 'from و to به شکل 1405/07/01 لازم است' });
  const D = engineData();
  res.json(repo.list('personnel').map((p) => { const { rows, ...sum } = performance(D, p, normJ(from), normJ(to), { today: todayJ() }); return sum; }));
});

/** ثبت تردد از دستگاه یا نرم‌افزار دیگر: { code, date?, time } */
r.post('/punch', (req, res) => {
  try {
    const { code, time } = req.body || {};
    const date = normJ(req.body?.date) || todayJ();
    if (!code || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') || !isJDate(date)) return res.status(400).json({ error: 'code، time (HH:mm) و date لازم است' });
    res.json(devicePunch({ code, date, time }));
  } catch (e) {
    if (e instanceof ClockError) return res.status(422).json({ error: e.message });
    console.error(e); res.status(500).json({ error: 'خطای داخلی سرور' });
  }
});

export default r;
