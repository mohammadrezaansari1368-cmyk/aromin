import test from 'node:test';
import assert from 'node:assert';

import {computeDay} from '../tgcloud/lib/shifts/attendance.js';
import {generateSimple,repeatPattern} from '../tgcloud/lib/shifts/generator.js';
import {daysOfJalaliYear} from '../tgcloud/lib/shifts/jalali.js';

const day = { kind: 'fixed', p1_start: '08:00', p1_end: '12:00', p2_start: '16:00', p2_end: '20:00' };

test('سال ۱۴۰۵: ۳۶۵ روز و شروع از ۱ فروردین', () => {
  const y = daysOfJalaliYear(1405);
  assert.equal(y.length, 365);
  assert.deepEqual([y[0].jm, y[0].jd, y[0].date], [1, 1, '2026-03-21']);
});

test('شیفت ساده: فقط شنبه‌ها', () => {
  const w = Array(7).fill({ enabled: false }); w[0] = { enabled: true, p1_start: '08:00', p1_end: '16:00' };
  const days = generateSimple(1405, w);
  assert.ok(days.length >= 52 && days.length <= 53);
  assert.equal(new Date(days[0].date).getUTCDay(), 6);
});

test('حضور کامل دو قسمتی', () => {
  const r = computeDay(day, [{ in: '08:00', out: '12:00' }, { in: '16:00', out: '20:00' }]);
  assert.deepEqual([r.required, r.worked, r.absence, r.overtime], [480, 480, 0, 0]);
});

test('تاخیر مجاز غیبت نیست', () => {
  const r = computeDay(day, [{ in: '08:10', out: '12:00' }, { in: '16:00', out: '20:00' }], { late_grace: 15 });
  assert.equal(r.absence, 0); assert.equal(r.late, 0); assert.equal(r.worked, 480);
});

test('تاخیر بیش از حد مجاز = غیبت', () => {
  const r = computeDay(day, [{ in: '08:30', out: '12:00' }, { in: '16:00', out: '20:00' }], { late_grace: 15 });
  assert.equal(r.late, 30); assert.equal(r.absence, 30);
});

test('شناوری: تاخیر با ماندن جبران می‌شود', () => {
  const d = { kind: 'fixed', p1_start: '08:00', p1_end: '16:00' };
  const r = computeDay(d, [{ in: '08:20', out: '16:20' }], { float_minutes: 30 });
  assert.deepEqual([r.late, r.absence, r.overtime], [0, 0, 0]);
});

test('سقف اضافه‌کار ابتدا/انتها و مازاد', () => {
  const d = { kind: 'fixed', p1_start: '08:00', p1_end: '16:00' };
  const r = computeDay(d, [{ in: '07:00', out: '18:00' }], { ot_before: 30, ot_after: 60 });
  assert.equal(r.overtime, 90); assert.equal(r.excess, 90);
});

test('شیفت شبانه از نیمه‌شب عبور می‌کند', () => {
  const d = { kind: 'fixed', p1_start: '22:00', p1_end: '06:00' };
  const r = computeDay(d, [{ in: '22:00', out: '06:00' }]);
  assert.equal(r.required, 480); assert.equal(r.worked, 480);
});

test('شناور: کم‌کاری و اضافه‌کار', () => {
  const d = { kind: 'floating', required_minutes: 450 };
  assert.equal(computeDay(d, [{ in: '09:00', out: '15:00' }]).absence, 90);
  assert.equal(computeDay(d, [{ in: '09:00', out: '18:00' }]).overtime, 90);
});

test('روز بدون شیفت با سقف', () => {
  const r = computeDay(null, [{ in: '09:00', out: '13:00' }], { no_shift_overtime_cap: 120 });
  assert.deepEqual([r.overtime, r.excess], [120, 120]);
});

test('تکرار الگوی چرخشی ۲ روز کار / ۱ روز استراحت', () => {
  const base = [{ date: '2026-09-26', kind: 'fixed', p1_start: '08:00', p1_end: '16:00' },
                { date: '2026-09-27', kind: 'fixed', p1_start: '16:00', p1_end: '23:00' }];
  const out = repeatPattern({ days: base, selectedDates: ['2026-09-26', '2026-09-27'], cycleDays: 3, scope: 'month', jy: 1405 });
  const dates = out.map(d => d.date);
  assert.ok(dates.includes('2026-09-29') && dates.includes('2026-09-30') && !dates.includes('2026-09-28'));
  assert.equal(out.find(d => d.date === '2026-09-30').p1_start, '16:00');
});
