// موتور محاسبه کارکرد یک روز براساس تعریف شیفت و ترددها
// همه زمان‌ها به دقیقه از نیمه‌شب همان روز؛ خروج بعد از نیمه‌شب = +1440
const toMin = t => (t == null || t === '' ? null : (([h, m]) => h * 60 + m)(t.split(':').map(Number)));
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
const cap = (v, c) => (c == null ? v : Math.min(v, c));

/** بازه‌های کاری شیفت ثابت (با پشتیبانی از عبور از نیمه‌شب) */
function segments(day) {
  const segs = [];
  let prevEnd = -Infinity;
  for (const [s, e] of [[day.p1_start, day.p1_end], [day.p2_start, day.p2_end]]) {
    let a = toMin(s), b = toMin(e);
    if (a == null || b == null) continue;
    while (a < prevEnd) { a += 1440; b += 1440; }
    if (b <= a) b += 1440;
    segs.push([a, b]); prevEnd = b;
  }
  return segs;
}

/** ترددها: [{in:'08:05', out:'17:10'}] -> بازه‌های حضور */
function presence(punches, window) {
  const lo = toMin(window?.start) ?? -Infinity;
  let hi = toMin(window?.end) ?? Infinity;
  if (hi < lo) hi += 1440; // بازه مجاز از نیمه‌شب عبور می‌کند
  const out = [];
  let prev = -Infinity;
  for (const p of punches) {
    let a = toMin(p.in), b = toMin(p.out);
    if (a == null || b == null) continue; // تردد ناقص
    while (a < prev) { a += 1440; b += 1440; }
    if (b <= a) b += 1440;
    // خارج از بازه مجاز ثبت تردد، پذیرفته نمی‌شود
    a = Math.max(a, lo); b = Math.min(b, hi);
    if (b > a) out.push([a, b]);
    prev = b;
  }
  return out;
}
const sumOverlap = (pres, a, b) => pres.reduce((s, [x, y]) => s + overlap(x, y, a, b), 0);
const total = pres => pres.reduce((s, [a, b]) => s + b - a, 0);

/**
 * day: تعریف روز (یا null برای روز بدون شیفت)
 * rules: قوانین شیفت (دقیقه؛ null = بدون سقف)
 * ctx: { isHoliday, isFriday, settings }
 */
function computeDay(day, punches, rules = {}, ctx = {}) {
  const st = ctx.settings || {};
  const pres = presence(punches, { start: rules.punch_window_start, end: rules.punch_window_end });
  const present = total(pres);
  const r = { required: 0, worked: 0, late: 0, early: 0, absence: 0, overtime: 0, excess: 0, holidayWork: 0 };

  // روز تعطیل رسمی / جمعه
  if ((ctx.isHoliday && rules.follow_official_holidays) || (ctx.isFriday && !day)) {
    const enabled = ctx.isHoliday ? st.calc_holiday_work : st.calc_friday_work;
    if (enabled) r.holidayWork = present; else r.excess = present;
    return r;
  }

  // روز بدون شیفت: کل حضور اضافه‌کار با سقف
  if (!day) {
    r.overtime = cap(present, rules.no_shift_overtime_cap);
    r.excess = present - r.overtime;
    return r;
  }

  // شیفت شناور: فقط مدت موظفی مهم است
  if (day.kind === 'floating') {
    r.required = day.required_minutes || 0;
    r.worked = Math.min(present, r.required);
    r.absence = r.required - r.worked;
    const extra = present - r.worked;
    r.overtime = cap(extra, rules.daily_overtime_cap);
    r.excess = extra - r.overtime;
    return r;
  }

  // شیفت ثابت
  let segs = segments(day);
  if (!segs.length) return r;
  r.required = segs.reduce((s, [a, b]) => s + b - a, 0);

  // شناوری: جابه‌جایی کل شیفت به اندازه تاخیر (تا سقف شناوری) یا زودآمدن (تا شناوری قبل شیفت)
  const firstIn = pres.length ? pres[0][0] : null;
  if (firstIn != null) {
    const diff = firstIn - segs[0][0];
    let shift = 0;
    if (diff > 0 && rules.float_minutes) shift = st.apply_float_over_limit ? Math.min(diff, rules.float_minutes) : (diff <= rules.float_minutes ? diff : 0);
    if (diff < 0 && rules.float_before) shift = -Math.min(-diff, rules.float_before);
    if (shift) segs = segs.map(([a, b]) => [a + shift, b + shift]);
  }

  const start = segs[0][0], end = segs[segs.length - 1][1];
  const inShift = segs.reduce((s, [a, b]) => s + sumOverlap(pres, a, b), 0);

  const lastOut = pres.length ? pres[pres.length - 1][1] : null;
  r.late = firstIn == null ? 0 : Math.max(0, Math.min(firstIn, end) - start);
  r.early = lastOut == null ? 0 : Math.max(0, end - Math.max(lastOut, start));

  // تاخیر/تعجیل مجاز: غیبت حساب نمی‌شود (و در صورت تنظیم، جزو کارکرد)
  let forgiven = 0;
  if (r.late && rules.late_grace && r.late <= rules.late_grace) { forgiven += r.late; r.late = 0; }
  if (r.early && rules.early_grace && r.early <= rules.early_grace) { forgiven += r.early; r.early = 0; }

  r.worked = inShift + (st.add_grace_to_worktime !== false ? forgiven : 0);
  r.absence = Math.max(0, r.required - inShift - forgiven);

  // اضافه‌کار: ابتدا / میانه / انتها، هرکدام با سقف خود؛ مازاد = حضور بیش از سقف
  const before = sumOverlap(pres, -Infinity, start);
  const middle = segs.length > 1 ? sumOverlap(pres, segs[0][1], segs[1][0]) : 0;
  const after = sumOverlap(pres, end, Infinity);
  const ot = cap(before, rules.ot_before) + cap(middle, rules.ot_middle) + cap(after, rules.ot_after);
  r.overtime = cap(ot, rules.daily_overtime_cap);
  r.excess = before + middle + after - r.overtime;
  return r;
}

export { computeDay, segments, toMin };
