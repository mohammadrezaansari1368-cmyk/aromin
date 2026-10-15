const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const RULE_KEYS = ['float_minutes', 'daily_overtime_cap', 'ot_before', 'ot_middle', 'ot_after',
  'late_grace', 'early_grace', 'float_before'];
const SETTING_KEYS = ['calc_holiday_work', 'calc_friday_work', 'add_grace_to_worktime', 'apply_float_over_limit'];

const isTime = v => v == null || v === '' || TIME.test(v);
const isMin = v => v == null || v === '' || (Number.isInteger(+v) && +v >= 0 && +v <= 1440);

function cleanRules(r = {}, errors, prefix = 'rules') {
  const out = {};
  for (const k of RULE_KEYS) {
    if (!isMin(r[k])) errors.push(`${prefix}.${k}: عدد دقیقه نامعتبر`);
    out[k] = r[k] === '' || r[k] == null ? null : +r[k];
  }
  for (const k of ['punch_window_start', 'punch_window_end']) {
    if (!isTime(r[k])) errors.push(`${prefix}.${k}: ساعت نامعتبر`);
    out[k] = r[k] || null;
  }
  return out;
}

function cleanDay(d, errors) {
  const e = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) e.push('تاریخ نامعتبر');
  const kind = d.kind === 'floating' ? 'floating' : 'fixed';
  for (const k of ['p1_start', 'p1_end', 'p2_start', 'p2_end', 'night_start']) if (!isTime(d[k])) e.push(`${k} نامعتبر`);
  if (kind === 'fixed' && (!d.p1_start || !d.p1_end)) e.push('زمان شروع و پایان قسمت اول الزامی است');
  if ((d.p2_start && !d.p2_end) || (!d.p2_start && d.p2_end)) e.push('قسمت دوم ناقص است');
  if (kind === 'floating' && !(+d.required_minutes > 0)) e.push('مدت زمان موظفی الزامی است');
  if (e.length) errors.push(`روز ${d.date}: ${e.join('، ')}`);
  return {
    date: d.date, kind,
    p1_start: kind === 'fixed' ? d.p1_start : null, p1_end: kind === 'fixed' ? d.p1_end : null,
    p2_start: kind === 'fixed' ? d.p2_start || null : null, p2_end: kind === 'fixed' ? d.p2_end || null : null,
    required_minutes: kind === 'floating' ? +d.required_minutes : null,
    ends_next_day: d.ends_next_day ? 1 : 0,
    night_start: d.night_start || null,
    night_minutes: d.night_minutes ? +d.night_minutes : null,
    rules: d.rules ? JSON.stringify(cleanRules(d.rules, errors, `day ${d.date}`)) : null,
  };
}

function cleanShift(body) {
  const errors = [];
  if (!body.name || !String(body.name).trim()) errors.push('نام شیفت الزامی است');
  if (!['simple', 'custom'].includes(body.type)) errors.push('نوع شیفت نامعتبر');
  if (!(+body.year >= 1390 && +body.year <= 1500)) errors.push('سال نامعتبر');
  if (!isMin(body.no_shift_overtime_cap)) errors.push('سقف اضافه‌کاری روز بدون شیفت نامعتبر');
  const days = Array.isArray(body.days) ? body.days.map(d => cleanDay(d, errors)) : [];
  if (!days.length) errors.push('حداقل یک روز شیفت تعریف کنید');
  const settings = {};
  for (const k of SETTING_KEYS) settings[k] = !!(body.settings || {})[k];
  if ((body.settings || {}).add_grace_to_worktime === undefined) settings.add_grace_to_worktime = true;
  return {
    errors,
    shift: {
      name: String(body.name || '').trim(), type: body.type, year: +body.year,
      no_shift_overtime_cap: body.no_shift_overtime_cap === '' || body.no_shift_overtime_cap == null ? null : +body.no_shift_overtime_cap,
      follow_official_holidays: body.follow_official_holidays ? 1 : 0,
      rules: JSON.stringify(cleanRules(body.rules, errors)),
      settings: JSON.stringify(settings),
      weekly: body.weekly ? JSON.stringify(body.weekly) : null,
    },
    days,
  };
}

export { cleanShift, isTime };
