// تولید روزهای شیفت: الگوی هفتگی (ساده) و تکرار الگو (سفارشی/چرخشی)
import { daysOfJalaliYear, fromIso, iso } from './jalali.js';

/**
 * weekly: آرایه 7تایی (0=شنبه..6=جمعه):
 *  { enabled, p1_start, p1_end, p2_enabled, p2_start, p2_end }
 */
function generateSimple(jy, weekly) {
  return daysOfJalaliYear(jy)
    .filter(d => weekly[d.weekday] && weekly[d.weekday].enabled)
    .map(d => {
      const w = weekly[d.weekday];
      return {
        date: d.date,
        kind: 'fixed',
        p1_start: w.p1_start, p1_end: w.p1_end,
        p2_start: w.p2_enabled ? w.p2_start : null,
        p2_end: w.p2_enabled ? w.p2_end : null,
      };
    });
}

/**
 * تکرار الگو: روزهای انتخاب‌شده (با تعریفشان) هر cycleDays روز تکرار می‌شوند
 * تا انتهای ماه یا سال شمسی. روزهای خالی داخل چرخه، روز استراحت حساب می‌شوند.
 * scope: 'month' | 'year'
 */
function repeatPattern({ days, selectedDates, cycleDays, scope, jy, clearRestDays = false }) {
  const byDate = new Map(days.map(d => [d.date, d]));
  const sel = [...selectedDates].sort();
  if (!sel.length) return days;
  const first = fromIso(sel[0]);
  const last = fromIso(sel[sel.length - 1]);
  const span = Math.round((last - first) / 864e5) + 1;
  const cycle = cycleDays || Math.ceil(span / 7) * 7;

  const year = daysOfJalaliYear(jy);
  const firstJ = year.find(x => x.date === sel[0]);
  const end = year.filter(x => scope === 'year' || x.jm === firstJ.jm).pop().date;

  // الگو = تعریف هر روز از چرخه (یا null برای استراحت)
  const pattern = [];
  for (let i = 0; i < cycle; i++) {
    const d = new Date(first); d.setUTCDate(d.getUTCDate() + i);
    const key = iso(d);
    pattern.push(sel.includes(key) ? byDate.get(key) || null : null);
  }

  const cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() + cycle);
  let i = 0;
  while (iso(cursor) <= end) {
    const key = iso(cursor);
    const tpl = pattern[i % cycle];
    if (tpl) byDate.set(key, { ...tpl, date: key });
    else if (clearRestDays) byDate.delete(key); // شیفت چرخشی: روز استراحت چرخه پاک شود
    cursor.setUTCDate(cursor.getUTCDate() + 1); i++;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export { generateSimple, repeatPattern };
