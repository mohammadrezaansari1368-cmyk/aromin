// ─────────────────────────────────────────────────────────────
//  موتور محاسبات آرومین — مشترک بین سرور و پنل
//  همه توابع «خالص» هستند: داده را ورودی می‌گیرند و نتیجه برمی‌گردانند.
//  D = { personnel, shifts, holidays, attendance, requests, policies }
//  تاریخ‌ها شمسی و به شکل YYYY/MM/DD (با صفر) ذخیره می‌شوند.
// ─────────────────────────────────────────────────────────────
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import utc from 'dayjs/plugin/utc.js';
import { computeDay } from '../tgcloud/lib/shifts/attendance.js';

dayjs.extend(jalaliday);
dayjs.extend(utc);

export const WEEKDAYS = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
export const LEAVE_KINDS = ['مرخصی استحقاقی', 'مرخصی استعلاجی', 'مرخصی بی‌حقوق'];

// ───────── تاریخ و زمان
export const J = (s) => dayjs(s, { jalali: true });
export const fmt = (d) => d.calendar('jalali').locale('fa').format('YYYY/MM/DD');
// now می‌تواند Date، عدد یا شیء dayjs (حتی از نسخه دیگر) باشد
const toDay = (now) => dayjs(now == null ? undefined : +now).utcOffset(210);
export const todayJ = (now) => fmt(toDay(now));
export const nowHM = (now) => toDay(now).format('HH:mm');
export const isJDate = (s) => typeof s === 'string' && /^1[34]\d\d\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(s);
export const normJ = (s) => { // 1405/7/3 → 1405/07/03
  if (!s) return s; const p = String(s).split('/'); if (p.length !== 3) return s;
  return `${p[0]}/${p[1].padStart(2, '0')}/${p[2].padStart(2, '0')}`;
};
export const weekday = (s) => WEEKDAYS[(J(s).day() + 1) % 7];
export const mins = (hhmm) => { if (!hhmm) return 0; const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const hm = (m) => { const s = m < 0 ? '-' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

export function daysBetween(from, to, max = 400) {
  const out = []; let d = J(from); const end = J(to);
  if (!d.isValid() || !end.isValid()) return out;
  for (let i = 0; i < max && !d.isAfter(end); i++) { out.push(fmt(d)); d = d.add(1, 'day'); }
  return out;
}
const byId = (arr, id) => arr.find((x) => x.id === id);
const fullName = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim();

// ───────── جغرافیا (برای ثبت تردد)
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; const toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1); const dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** آیا پرسنل اجازه ثبت تردد از این موقعیت/وای‌فای را دارد؟ */
export function checkLocation(workplace, { lat, lng, accuracy, bssid } = {}) {
  if (!workplace) return { ok: false, reason: 'محل کار برای شما تعریف نشده است' };
  if (workplace.status === 'غیر فعال') return { ok: false, reason: 'محل کار غیرفعال است' };
  const norm = (s) => String(s || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (bssid && (workplace.wifis || []).some((w) => w.bssid && norm(w.bssid) === norm(bssid))) {
    return { ok: true, method: 'wifi' };
  }
  if (lat == null || lng == null) return { ok: false, reason: 'موقعیت مکانی دریافت نشد' };
  if (workplace.lat == null || workplace.lng == null) return { ok: false, reason: 'موقعیت محل کار ثبت نشده است' };
  const d = distanceMeters(+lat, +lng, +workplace.lat, +workplace.lng);
  const radius = +workplace.radius || 100;
  const tolerance = Math.min(+accuracy || 0, 50); // خطای GPS تا ۵۰ متر بخشیده می‌شود
  if (d <= radius + tolerance) return { ok: true, method: 'gps', distance: Math.round(d) };
  return { ok: false, reason: `شما ${Math.round(d)} متر از محل کار فاصله دارید (حداکثر ${radius} متر)`, distance: Math.round(d) };
}

// ───────── شیفت
export function expectedMinutes(D, person, date) {
  const shift = byId(D.shifts, person.shift); if (!shift) return 0;
  if(shift.advanced){const a=shift.advanced,day=a.days.find(d=>d.date===toG(date));return computeDay(day,[],{...a.rules,...day?.rules,follow_official_holidays:!!a.follow_official_holidays},{isHoliday:D.holidays.some(h=>h.date===date),isFriday:weekday(date)==='جمعه',settings:a.settings}).required;}
  const start = person.shiftStart || person.createdAt; // قبل از شروع همکاری، کسر کار حساب نمی‌شود
  if (start && date < start) return 0;
  if (person.shiftEnd && date > person.shiftEnd) return 0;
  if (shift.followHolidays !== false && D.holidays.some((h) => h.date === date)) return 0;
  const key = shift.type === 'سفارشی' ? String(Number(date.split('/')[2])) : weekday(date);
  const r = shift.days?.[key];
  if (!r) return 0;
  let m = mins(r[1]) - mins(r[0]);
  if (m < 0) m += 24 * 60; // شیفت شب (مثلاً 22:00 تا 06:00)
  return m;
}
export function shiftWindow(D, person, date) {
  const shift = byId(D.shifts, person.shift); if (!shift) return null;
  const key = shift.type === 'سفارشی' ? String(Number(date.split('/')[2])) : weekday(date);
  return shift.days?.[key] || null;
}

// ───────── درخواست‌ها
const approvedOn = (D, personId, kinds, date) => D.requests.some((r) => r.person === personId && r.status === 'تایید شده'
  && kinds.includes(r.kind) && !r.fromTime && r.from <= date && (r.to || r.from) >= date);
const reqDays = (D, personId, kind, dates) => D.requests
  .filter((r) => r.person === personId && r.kind === kind && r.status === 'تایید شده' && !r.fromTime)
  .reduce((s, r) => s + dates.filter((d) => d >= r.from && d <= (r.to || r.from)).length, 0);
const reqHours = (D, personId, kind, dates) => D.requests
  .filter((r) => r.person === personId && r.kind === kind && r.status === 'تایید شده' && r.fromTime && dates.includes(r.from))
  .reduce((s, r) => s + Math.max(mins(r.toTime) - mins(r.fromTime), 0), 0);

// ───────── یک روز کاری
export function dayRow(D, person, date) {
  const advanced=byId(D.shifts,person.shift)?.advanced;
  if(advanced){
    const att=D.attendance.filter(a=>a.person===person.id&&a.date===date).sort((a,b)=>a.in.localeCompare(b.in)),day=advanced.days.find(d=>d.date===toG(date));
    const r=computeDay(day,att,{...advanced.rules,...day?.rules,no_shift_overtime_cap:advanced.no_shift_overtime_cap,follow_official_holidays:!!advanced.follow_official_holidays},{isHoliday:D.holidays.some(h=>h.date===date),isFriday:weekday(date)==='جمعه',settings:advanced.settings});
    const leave=approvedOn(D,person.id,['مرخصی استحقاقی','مرخصی استعلاجی','ماموریت'],date);
    return {date,weekday:weekday(date),worked:r.worked+r.holidayWork,expected:r.required,inShift:r.worked,late:r.late,early:r.early,summary:att.map(a=>a.in+' تا '+(a.out||'(ناقص)')).join('، ')||(leave?'مرخصی/ماموریت':'—'),absent:leave?0:r.absence,overtime:r.overtime,excess:r.excess,incomplete:att.filter(a=>!a.out).length,holiday:D.holidays.some(h=>h.date===date)};
  }
  const att = D.attendance.filter((a) => a.person === person.id && a.date === date).sort((a, b) => mins(a.in) - mins(b.in));
  const worked = att.reduce((s, a) => { if (!a.out) return s; let m = mins(a.out) - mins(a.in); if (m < 0) m += 1440; return s + m; }, 0);
  let expected = expectedMinutes(D, person, date);
  const onLeave = approvedOn(D, person.id, [...LEAVE_KINDS, 'ماموریت'], date);
  if (onLeave) expected = 0;
  const hourly = D.requests.filter((r) => r.person === person.id && r.status === 'تایید شده' && r.fromTime && r.from === date)
    .reduce((s, r) => s + Math.max(mins(r.toTime) - mins(r.fromTime), 0), 0);
  const covered = worked + hourly;
  const win = shiftWindow(D, person, date);
  const late = win && att[0] && expected ? Math.max(mins(att[0].in) - mins(win[0]), 0) : 0;
  return {
    date, weekday: weekday(date), worked, expected, inShift: Math.min(worked, expected), late,
    summary: att.map((a) => `${a.in}${a.out ? ' تا ' + a.out : ' (ناقص)'}`).join('، ') || (onLeave ? 'مرخصی/ماموریت' : '—'),
    absent: Math.max(expected - covered, 0), overtime: Math.max(worked - expected, 0),
    incomplete: att.filter((a) => !a.out).length, holiday: D.holidays.some((h) => h.date === date),
  };
}

// ───────── گزارش کارکرد یک نفر در بازه
export function performance(D, person, from, to, { today } = {}) {
  const dates = daysBetween(from, to).filter((d) => !today || d <= today);
  const rows = dates.map((d) => dayRow(D, person, d));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const overtimeApproved = reqHours(D, person.id, 'اضافه کار', dates);
  return {
    id: person.id, code: person.code, name: fullName(person),
    inShift: hm(sum('inShift')), absent: hm(sum('absent')), overtime: hm(sum('overtime')),
    overtimeApproved: hm(overtimeApproved), late: hm(sum('late')),
    mission: reqDays(D, person.id, 'ماموریت', dates), earned: reqDays(D, person.id, 'مرخصی استحقاقی', dates),
    earnedHours: hm(reqHours(D, person.id, 'مرخصی استحقاقی', dates)),
    sick: reqDays(D, person.id, 'مرخصی استعلاجی', dates), unpaid: reqDays(D, person.id, 'مرخصی بی‌حقوق', dates),
    extra: hm(Math.max(sum('worked') - sum('expected'), 0)), workDays: rows.filter((r) => r.worked > 0).length,
    incomplete: sum('incomplete'),
    minutes: { worked: sum('worked'), expected: sum('expected'), absent: sum('absent'), overtime: sum('overtime') },
    rows,
  };
}

// ───────── مرخصی و سیاست کاری
const reqLen = (r, dayMinutes = 450) => (r.fromTime ? Math.max(mins(r.toTime) - mins(r.fromTime), 0) / dayMinutes : daysBetween(r.from, r.to || r.from).length);

export function leaveUsage(D, person, year, month /* 0-11 */) {
  const pol = byId(D.policies, person.policy) || {};
  const reqs = D.requests.filter((r) => r.person === person.id && r.kind === 'مرخصی استحقاقی' && r.status === 'تایید شده');
  const y = reqs.filter((r) => r.from.startsWith(String(year)));
  const m = y.filter((r) => Number(r.from.split('/')[1]) === month + 1);
  const yu = +y.reduce((s, r) => s + reqLen(r), 0).toFixed(2);
  const mu = +m.reduce((s, r) => s + reqLen(r), 0).toFixed(2);
  return {
    id: person.id, code: person.code, name: fullName(person), policy: pol.name,
    mu, yu, mc: m.length, yc: y.length,
    mr: +((pol.monthCap ?? 2.5) - mu).toFixed(2), yr: +((pol.yearCap ?? 26) - yu).toFixed(2), reqs: y,
  };
}

/**
 * قبل از ثبت درخواست، آن را با سیاست کاری پرسنل می‌سنجد.
 * خروجی: { ok, errors[] }
 */
export function validateRequest(D, req, { today } = {}) {
  const errors = [];
  const person = byId(D.personnel, req.person);
  if (!person) return { ok: false, errors: ['پرسنل یافت نشد'] };
  if (!req.kind) errors.push('نوع درخواست مشخص نیست');
  if (!isJDate(req.from)) errors.push('تاریخ شروع نامعتبر است');
  if (req.to && !isJDate(req.to)) errors.push('تاریخ پایان نامعتبر است');
  if (req.to && req.to < req.from) errors.push('تاریخ پایان قبل از تاریخ شروع است');
  if (req.fromTime && (!req.toTime || mins(req.toTime) <= mins(req.fromTime))) errors.push('بازه ساعت نامعتبر است');
  if (errors.length) return { ok: false, errors };

  const pol = byId(D.policies, person.policy);
  if (pol) {
    if (pol.enabled && pol.enabled[req.kind] === false) errors.push(`ثبت «${req.kind}» در سیاست کاری شما غیرفعال است`);
    if (today) {
      const after = pol.after?.[req.kind]; const before = pol.before?.[req.kind];
      const diff = J(req.from).diff(J(today), 'day');
      if (after != null && after !== '' && diff < -after) errors.push(`مهلت ثبت این درخواست تا ${after} روز بعد از تاریخ آن است`);
      if (before != null && before !== '' && diff < before && diff >= 0) errors.push(`این درخواست باید حداقل ${before} روز قبل ثبت شود`);
    }
    if (req.kind === 'مرخصی استحقاقی') {
      const [y, m] = req.from.split('/').map(Number);
      const u = leaveUsage(D, person, y, m - 1);
      const len = reqLen(req);
      if (pol.yearCap != null && u.yu + len > pol.yearCap && !pol.allowOverYear) errors.push(`از سقف مرخصی سالانه (${pol.yearCap} روز) بیشتر می‌شود؛ مانده: ${u.yr}`);
      if (pol.monthCap != null && u.mu + len > pol.monthCap && !pol.allowOverMonth) errors.push(`از سقف مرخصی ماهانه (${pol.monthCap} روز) بیشتر می‌شود؛ مانده: ${u.mr}`);
      if (pol.maxLen && !req.fromTime && len > pol.maxLen) errors.push(`حداکثر طول مرخصی ${pol.maxLen} روز است`);
      if (pol.minUnit === 'روزانه' && req.fromTime) errors.push('مرخصی ساعتی در سیاست کاری شما مجاز نیست');
      if (req.fromTime) {
        const hourly = D.requests.filter((r) => r.person === person.id && r.kind === 'مرخصی استحقاقی' && r.fromTime && r.status !== 'رد شده');
        if (pol.hourlyYear && hourly.filter((r) => r.from.startsWith(String(y))).length >= pol.hourlyYear) errors.push('سقف تعداد مرخصی ساعتی سالانه پر شده است');
        if (pol.hourlyMonth && hourly.filter((r) => r.from.startsWith(`${y}/${String(m).padStart(2, '0')}`)).length >= pol.hourlyMonth) errors.push('سقف تعداد مرخصی ساعتی ماهانه پر شده است');
      }
    }
  }
  // هم‌پوشانی با درخواست روزانه دیگر
  if (!req.fromTime) {
    const overlap = D.requests.find((r) => r.id !== req.id && r.person === person.id && r.status !== 'رد شده' && !r.fromTime
      && r.from <= (req.to || req.from) && (r.to || r.from) >= req.from);
    if (overlap) errors.push(`با درخواست «${overlap.kind}» از ${overlap.from} هم‌پوشانی دارد`);
  }
  return { ok: errors.length === 0, errors };
}

// ───────── داشبورد
export function dashboard(D, date) {
  const active = D.personnel.filter((p) => p.status !== 'غیر فعال');
  const todays = D.attendance.filter((a) => a.date === date);
  const present = active.filter((p) => todays.some((a) => a.person === p.id));
  const leave = active.filter((p) => approvedOn(D, p.id, LEAVE_KINDS, date));
  const mission = active.filter((p) => approvedOn(D, p.id, ['ماموریت'], date));
  const absent = active.filter((p) => !present.includes(p) && !leave.includes(p) && !mission.includes(p) && expectedMinutes(D, p, date) > 0);
  return { present, absent, leave, mission };
}

// ───────── دستگاه حضور و غیاب (ZKTeco) — تبدیل ثبت‌های خام به ورود/خروج
/** تاریخ شمسی 1405/07/18 ← میلادی 2026-10-10 */
export const toG = (j) => J(normJ(j)).calendar('gregory').format('YYYY-MM-DD');
/** میلادی «2026-10-10» یا «2026-10-10 08:05:00» ← شمسی 1405/07/18 */
export const toJ = (g) => fmt(dayjs(String(g).slice(0, 10)));
export const ZK_PUNCH = { 0: 'ورود', 1: 'خروج', 2: 'خروج موقت', 3: 'بازگشت', 4: 'ورود اضافه‌کار', 5: 'خروج اضافه‌کار' };

/**
 * ثبت‌های یک نفر در یک روز ← جفت‌های ورود/خروج.
 * punches: [{ ts: 'YYYY-MM-DD HH:MM:SS', device_name? }]
 * ثبت‌های با فاصله کمتر از ۱ دقیقه (انگشت دوباره) یکی حساب می‌شوند؛ ترتیب زمانی تعیین‌کننده است
 * (ثبت اول ورود، دوم خروج، …) چون بسیاری از دستگاه‌ها نوع ورود/خروج را درست نمی‌فرستند.
 */
export function zkPairs(punches) {
  const sorted = [...punches].sort((a, b) => a.ts.localeCompare(b.ts));
  const clean = [];
  const sec = (ts) => { const [h, m, s] = ts.slice(11, 19).split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };
  for (const p of sorted) if (!clean.length || sec(p.ts) - sec(clean[clean.length - 1].ts) >= 60) clean.push(p);
  const out = [];
  for (let i = 0; i < clean.length; i += 2) {
    const a = clean[i]; const b = clean[i + 1];
    out.push({ in: a.ts.slice(11, 16), out: b ? b.ts.slice(11, 16) : null, inDevice: a.device_name || null, outDevice: b?.device_name || null });
  }
  return out;
}
