// موتور ثبت تردد پرسنل (ورود/خروج)
import dayjs from 'dayjs';
import { repo, sql } from '../db.js';
import { checkLocation, todayJ, nowHM, mins, shiftWindow, engineDataFor } from './helpers.js';

export class ClockError extends Error { constructor(msg, extra) { super(msg); this.extra = extra; } }

/**
 * ثبت ورود یا خروج.
 * input: { lat, lng, accuracy, bssid, deviceId, platform, project, source }
 * زمان همیشه از ساعت سرور گرفته می‌شود (نه گوشی کاربر) تا قابل دستکاری نباشد.
 */
export function clock(person, input = {}, now = dayjs()) {
  const methods = person.methods || ['اپلیکیشن موبایل'];
  if (!methods.some((m) => m === 'اپلیکیشن موبایل' || m === 'وب اپلیکیشن' || m === 'WiFi محل کار')) {
    throw new ClockError('ثبت تردد با اپلیکیشن برای شما فعال نیست');
  }

  // محدودیت دستگاه
  const dt = person.deviceType || 'همه';
  if (dt === 'فقط اندروید' && input.platform !== 'android') throw new ClockError('ثبت تردد فقط با گوشی اندروید مجاز است');
  if (dt === 'فقط iOS' && input.platform !== 'ios') throw new ClockError('ثبت تردد فقط با آیفون مجاز است');
  if (dt === 'یک دستگاه ثابت') {
    if (!input.deviceId) throw new ClockError('شناسه دستگاه دریافت نشد');
    if (!person.boundDevice) repo.update('personnel', person.id, { boundDevice: input.deviceId });
    else if (person.boundDevice !== input.deviceId) throw new ClockError('این گوشی برای ثبت تردد شما ثبت نشده است. با مدیر تماس بگیرید.');
  }

  // موقعیت
  const workplace = repo.get('workplaces', person.workplace);
  const loc = checkLocation(workplace, input);
  if (!loc.ok) throw new ClockError(loc.reason, { distance: loc.distance });

  const date = todayJ(now); const time = nowHM(now);
  const todays = repo.where('attendance', 'person', person.id).filter((a) => a.date === date);
  // ردیف‌های دستگاه (zk) را پل دستگاه مدیریت می‌کند؛ اپلیکیشن آن‌ها را نمی‌بندد
  const open = todays.find((a) => !a.out && !a.zk);
  const last = todays.map((a) => a.out || a.in).sort().pop();
  if (last && Math.abs(mins(time) - mins(last)) < 1) throw new ClockError('تردد شما همین الان ثبت شده است');

  const meta = { method: loc.method, distance: loc.distance, lat: input.lat ?? null, lng: input.lng ?? null, source: input.source || 'app' };
  let row; let action;
  if (open) {
    row = repo.update('attendance', open.id, { out: time, outMeta: meta });
    action = 'out';
  } else {
    row = repo.insert('attendance', { person: person.id, date, in: time, out: null, type: 'حضور', project: input.project || null, inMeta: meta });
    action = 'in';
  }

  // تأخیر نسبت به شیفت (فقط برای نمایش به کاربر)
  let late = 0;
  if (action === 'in' && todays.length === 0) {
    const win = shiftWindow(engineDataFor(person), person, date);
    if (win) late = Math.max(mins(time) - mins(win[0]), 0);
  }
  return { action, time, date, row, method: loc.method, late };
}

/** ثبت از دستگاه حضور و غیاب (از طریق وب سرویس) */
export function devicePunch({ code, date, time }) {
  const person = repo.where('personnel', 'code', String(code))[0];
  if (!person) throw new ClockError(`پرسنل با کد ${code} یافت نشد`);
  const open = repo.where('attendance', 'person', person.id).find((a) => a.date === date && !a.out && !a.zk);
  if (open) return repo.update('attendance', open.id, { out: time, outMeta: { source: 'device' } });
  return repo.insert('attendance', { person: person.id, date, in: time, out: null, type: 'حضور', inMeta: { source: 'device' } });
}

export function saveLocation(person, { lat, lng, accuracy }, now = dayjs()) {
  if (!person.tracking) return { skipped: true };
  sql.prepare('INSERT INTO locations (person, at, date, lat, lng, accuracy) VALUES (?, ?, ?, ?, ?, ?)')
    .run(person.id, now.format('HH:mm:ss'), todayJ(now), +lat, +lng, +accuracy || null);
  return { saved: true };
}
export const locationsFor = (personId, date) => sql.prepare('SELECT at, lat, lng, accuracy FROM locations WHERE person = ? AND date = ? ORDER BY at').all(personId, date);
