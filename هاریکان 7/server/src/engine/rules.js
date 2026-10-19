// قوانین هر مجموعه: فیلدهای الزامی، یکتا بودن، پاک‌سازی ورودی و رویدادها
import { repo, engineData } from '../db.js';
import { hashPassword } from '../auth.js';
import { validateRequest, isJDate, normJ, todayJ } from './helpers.js';
import { notify } from './sms.js';

export class ValidationError extends Error { constructor(errors) { super(errors.join('، ')); this.errors = errors; } }

// فیلدهای تاریخ شمسی هر مجموعه
const DATE_FIELDS = { requests: ['from', 'to'], holidays: ['date'], attendance: ['date'], personnel: ['shiftStart', 'shiftEnd'] };
const str = (v) => (v == null ? '' : String(v).trim());

function normalize(c, obj) {
  for (const f of DATE_FIELDS[c] || []) if (obj[f]) obj[f] = normJ(str(obj[f]));
  return obj;
}
function required(obj, fields, errors) {
  fields.forEach(([k, label]) => { if (!str(obj[k])) errors.push(`${label} الزامی است`); });
}
function unique(c, obj, field, label, id, errors) {
  const v = str(obj[field]); if (!v) return;
  if (repo.where(c, field, v).some((r) => r.id !== id)) errors.push(`${label} «${v}» تکراری است`);
}
function dates(c, obj, errors) {
  for (const f of DATE_FIELDS[c] || []) if (obj[f] && !isJDate(obj[f])) errors.push(`تاریخ «${obj[f]}» نامعتبر است (فرمت: ۱۴۰۵/۰۷/۱۷)`);
}

/** خروجی امن (حذف رمز عبور و…) */
export function sanitize(c, row) {
  if (!row) return row;
  if (c === 'personnel') { const { passwordHash, password, password2, ...rest } = row; return { ...rest, hasPassword: !!passwordHash }; }
  return row;
}

/**
 * قبل از ذخیره اجرا می‌شود. merged = رکورد نهایی (برای update: قبلی + تغییرات)
 * خروجی: داده‌ای که باید ذخیره شود
 */
export function beforeSave(c, input, { id, existing, actor, force } = {}) {
  const errors = [];
  const merged = normalize(c, { ...(existing || {}), ...input });
  dates(c, merged, errors);

  switch (c) {
    case 'workplaces':
      required(merged, [['name', 'نام محل کار']], errors);
      if (merged.radius != null && (+merged.radius < 10 || +merged.radius > 5000)) errors.push('شعاع باید بین ۱۰ تا ۵۰۰۰ متر باشد');
      break;
    case 'shifts': required(merged, [['name', 'نام شیفت']], errors); break;
    case 'groups':
      required(merged, [['name', 'نام گروه']], errors);
      if (merged.parent && merged.parent === id) errors.push('گروه نمی‌تواند مرجع خودش باشد');
      break;
    case 'policies': required(merged, [['name', 'نام سیاست کاری']], errors); break;
    case 'projects': required(merged, [['name', 'نام پروژه']], errors); break;
    case 'holidays': required(merged, [['title', 'عنوان'], ['date', 'تاریخ']], errors); break;
    case 'personnel': {
      required(merged, [['firstName', 'نام'], ['lastName', 'نام خانوادگی'], ['code', 'کد پرسنلی'], ['username', 'نام کاربری']], errors);
      unique('personnel', merged, 'code', 'کد پرسنلی', id, errors);
      unique('personnel', merged, 'username', 'نام کاربری', id, errors);
      if (merged.mobile && !/^09\d{9}$/.test(merged.mobile)) errors.push('شماره موبایل نامعتبر است');
      if (merged.nationalId && !/^\d{10}$/.test(merged.nationalId)) errors.push('کد ملی باید ۱۰ رقم باشد');
      if (input.password) {
        if (String(input.password).length < 6) errors.push('رمز عبور حداقل ۶ کاراکتر');
        merged.passwordHash = hashPassword(input.password);
      } else if (!existing) errors.push('رمز عبور الزامی است');
      delete merged.password; delete merged.password2; delete merged.hasPassword;
      if (input.deviceType && existing && input.deviceType !== existing.deviceType) delete merged.boundDevice;
      merged.status = merged.status || 'فعال';
      break;
    }
    case 'requests': {
      required(merged, [['person', 'پرسنل'], ['kind', 'نوع درخواست'], ['from', 'تاریخ شروع']], errors);
      merged.status = merged.status || 'در دست بررسی';
      if (!errors.length && !force && (!existing || input.from || input.to || input.kind)) {
        const D = engineData();
        const v = validateRequest(D, { ...merged, id }, { today: todayJ() });
        errors.push(...v.errors);
      }
      break;
    }
    case 'attendance':
      required(merged, [['person', 'پرسنل'], ['date', 'تاریخ'], ['in', 'ساعت ورود']], errors);
      ['in', 'out'].forEach((k) => { if (merged[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(merged[k])) errors.push(`ساعت «${merged[k]}» نامعتبر است`); });
      if (actor) merged.editedBy = actor;
      break;
    case 'tickets':
      if (!existing) { required(merged, [['title', 'عنوان']], errors); merged.no = merged.no || 1000 + repo.count('tickets') + 1; merged.status = merged.status || 'باز'; }
      merged.updatedAt = todayJ();
      break;
    case 'messages':
      required(merged, [['title', 'عنوان'], ['body', 'متن']], errors);
      merged.to = Array.isArray(merged.to) ? merged.to : []; merged.read = Array.isArray(merged.read) ? merged.read : [];
      break;
    case 'devices': required(merged, [['ip', 'آی پی']], errors); break;
    case 'smsLines': required(merged, [['provider', 'سرویس دهنده'], ['line', 'سرشماره']], errors); break;
    default: break;
  }
  if (!existing && !merged.createdAt) merged.createdAt = todayJ();
  if (errors.length) throw new ValidationError(errors);
  return merged;
}

/** بعد از ذخیره: رویدادها (پیامک و…) */
export async function afterSave(c, row, { existing } = {}) {
  if (c === 'requests' && existing && existing.status !== row.status && row.status !== 'در دست بررسی') {
    const p = repo.get('personnel', row.person);
    await notify('تایید یا رد درخواست پرسنل', p?.mobile, `آرومین: درخواست ${row.kind} شما (${row.from}) ${row.status}.`);
  }
  if (c === 'requests' && !existing) {
    const managerMobile = process.env.MANAGER_MOBILE;
    const p = repo.get('personnel', row.person);
    if (managerMobile) await notify('ثبت درخواست جدید (به مدیر)', managerMobile, `آرومین: ${p?.firstName} ${p?.lastName} درخواست ${row.kind} از ${row.from} ثبت کرد.`);
  }
  if (c === 'messages' && !existing && row.sms) {
    for (const pid of row.to) { const p = repo.get('personnel', pid); await notify('ارسال پیام جدید از پنل', p?.mobile, `آرومین: پیام جدید «${row.title}». برای مشاهده وارد اپلیکیشن شوید.`); }
  }
}

/** قبل از حذف: جلوگیری از حذف داده‌ای که استفاده شده */
export function beforeDelete(c, id) {
  const refs = {
    workplaces: [['personnel', 'workplace', 'پرسنل']],
    shifts: [['personnel', 'shift', 'پرسنل']],
    policies: [['personnel', 'policy', 'پرسنل']],
    groups: [['personnel', 'group', 'پرسنل'], ['groups', 'parent', 'زیرگروه']],
  }[c] || [];
  const errors = [];
  for (const [rc, field, label] of refs) {
    const n = repo.where(rc, field, id).length;
    if (n) errors.push(`${n} ${label} به این مورد وابسته است؛ ابتدا آن‌ها را تغییر دهید`);
  }
  if (errors.length) throw new ValidationError(errors);
}
