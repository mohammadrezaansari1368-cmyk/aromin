import { tenant,cloudApi } from './cloud.js';
// ─────────────────────────────────────────────────────────────
//  لایه داده پنل
//  دو حالت دارد:
//   • server (پیش‌فرض): داده‌ها روی سرور آرومین (پوشه server) ذخیره می‌شوند.
//   • local  (VITE_MODE=local): بدون سرور، داده‌ها در مرورگر — فقط برای دمو.
//  صفحات فقط از db و useCollection استفاده می‌کنند و از حالت خبر ندارند.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react';
import { todayJ, nowHM, validateRequest } from '../shared/core.js';

export const MODE = 'server';
export const today = () => todayJ();
export const nowTime = () => nowHM();

const KEY = 'aromin-hozour:';
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(KEY + k)); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(KEY + k) : localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* */ } },
};

// ───────── رویدادها
const listeners = new Set();
const emit = (name) => listeners.forEach((fn) => fn(name));
export const onError = (fn) => { const h = (e) => fn(e.detail); window.addEventListener('aromin:error', h); return () => window.removeEventListener('aromin:error', h); };
const fail = (msg) => { window.dispatchEvent(new CustomEvent('aromin:error', { detail: msg })); const e = new Error(msg); e.shown = true; return e; };

// ───────── ارتباط با سرور
export const auth = tenant;
export async function api(path, options={}) {
 try { return await cloudApi(path,options); }
 catch(error) { if(error.code==='CONFLICT') await bootstrap(); throw fail(error.message); }
}

// ───────── حافظه
const memory = {};
let settingsCache = {};
const uid = () => Math.random().toString(36).slice(2, 10);
const get = (name) => memory[name] ?? (memory[name] = MODE === 'local' ? (ls.get(name) || seed[name] || []) : []);
const put = (name, rows) => { memory[name] = rows; if (MODE === 'local') ls.set(name, rows); emit(name); };

/** بارگذاری همه داده‌ها از سرور (بعد از ورود) */
export async function bootstrap() {
  if (auth.business?.role === 'employee') return true;
  if (MODE === 'local') return true;
  const r = await api('/admin/bootstrap');
  auth.set(null,{...auth.business,logo:r.branding?.logo||null});
  Object.keys(memory).forEach(k=>delete memory[k]);
  Object.entries(r.data).forEach(([k, v]) => { memory[k] = v; emit(k); });
  settingsCache = r.settings || {};
  return true;
}

export const db = {
  list: (name) => get(name),
  find: (name, id) => get(name).find((r) => r.id === id),

  async add(name, row) {
    if (MODE === 'local') {
      if (name === 'requests') { const v = validateRequest(localData(), row, { today: today() }); if (!v.ok) throw fail(v.errors.join('، ')); }
      const { password, password2, ...clean } = row;
      const r = { id: uid(), createdAt: today(), ...clean }; put(name, [...get(name), r]); return r;
    }
    const saved = await api(`/admin/c/${name}`, { method: 'POST', body: row });
    put(name, [...get(name), saved]);
    return saved;
  },

  async update(name, id, patch) {
    if (MODE === 'local') { const { password, password2, ...clean } = patch; put(name, get(name).map((r) => (r.id === id ? { ...r, ...clean } : r))); return db.find(name, id); }
    const saved = await api(`/admin/c/${name}/${id}`, { method: 'PUT', body: { ...patch, _version: db.find(name,id)?._version } });
    put(name, get(name).map((r) => (r.id === id ? saved : r)));
    return saved;
  },

  async remove(name, id) {
    if (MODE !== 'local') await api(`/admin/c/${name}/${id}`, { method: 'DELETE' });
    put(name, get(name).filter((r) => r.id !== id));
  },
};
/** بارگذاری دوباره یک مجموعه از سرور (مثلاً ترددها بعد از تخلیه دستگاه) */
export async function reload(name) {
  if (MODE === 'local') { emit(name); return get(name); }
  const rows = await api(`/admin/c/${name}`); put(name, rows); return rows;
}
/** فقط حالت نمایشی: جایگزینی کامل یک مجموعه */
export const replaceLocal = (name, rows) => put(name, rows);

const localData = () => ({ personnel: get('personnel'), shifts: get('shifts'), holidays: get('holidays'), attendance: get('attendance'), requests: get('requests'), policies: get('policies') });

export function useCollection(name) {
  const [rows, setRows] = useState(() => get(name));
  useEffect(() => {
    const fn = (n) => n === name && setRows([...get(name)]);
    listeners.add(fn); setRows([...get(name)]);
    return () => listeners.delete(fn);
  }, [name]);
  return rows;
}

/** تنظیمات (قوانین پیامک و…) — در حالت سرور روی سرور ذخیره می‌شود */
export function useLocalSetting(name, initial) {
  const [v, setV] = useState(() => (MODE === 'local' ? ls.get('set:' + name) : settingsCache[name]) ?? initial);
  const save = useCallback((nv) => {

    if (MODE === 'local') ls.set('set:' + name, nv);
    else { api(`/admin/settings/${name}`, { method: 'PUT', body: { value: nv } }).then(()=>{ settingsCache[name]=nv;setV(nv); }).catch(() => {}); }
  }, [name]);
  return [v, save];
}

export const personName = (id) => { const p = db.find('personnel', id); return p ? `${p.firstName} ${p.lastName}` : '—'; };

// ───────── داده نمونه (فقط حالت دمو)
const seed = {
  workplaces: [{ id: 'w1', name: 'دفتر مرکزی آرومین', city: 'رشت', address: 'رشت، خیابان معلم', status: 'فعال', lat: 37.2808, lng: 49.5832, radius: 100 }],
  groups: [{ id: 'g1', name: 'فروش', parent: null }, { id: 'g2', name: 'مالی و اداری', parent: null }, { id: 'g3', name: 'پشتیبانی', parent: 'g1' }],
  shifts: [{ id: 's1', name: 'شیفت اداری', type: 'ساده', followHolidays: true, overtimeCap: 4,
    days: { 'شنبه': ['08:00', '15:30'], 'یک‌شنبه': ['08:00', '15:30'], 'دوشنبه': ['08:00', '15:30'], 'سه‌شنبه': ['08:00', '15:30'], 'چهارشنبه': ['08:00', '15:30'] } }],
  policies: [{ id: 'p1', name: 'سیاست کاری عمومی', description: 'طبق قانون کار', yearCap: 26, monthCap: 2.5 }],
  personnel: [
    { id: 'u1', code: '1001', username: 'user1', firstName: 'پرسنل', lastName: 'نمونه یک', mobile: '09120000000', workplace: 'w1', group: 'g1', policy: 'p1', shift: 's1', jobTitle: 'کارشناس فروش', status: 'فعال' },
    { id: 'u2', code: '1002', username: 'user2', firstName: 'پرسنل', lastName: 'نمونه دو', mobile: '09120000001', workplace: 'w1', group: 'g2', policy: 'p1', shift: 's1', jobTitle: 'حسابدار', status: 'فعال' },
  ],
  projects: [{ id: 'pr1', name: 'راه‌اندازی رستوران نمونه', status: 'فعال', members: ['u1'] }],
  holidays: [], requests: [], messages: [], tickets: [], devices: [], smsLines: [],
  attendance: [{ id: 'a1', person: 'u1', date: todayJ(), in: '08:05', out: null, type: 'حضور' }],
  requestTypes: [
    { id: 'rt1', cat: 'مرخصی', name: 'مرخصی استحقاقی', active: true }, { id: 'rt2', cat: 'مرخصی', name: 'مرخصی استعلاجی', active: true },
    { id: 'rt3', cat: 'مرخصی', name: 'مرخصی بی‌حقوق', active: true }, { id: 'rt4', cat: 'ماموریت', name: 'ماموریت', active: true },
    { id: 'rt5', cat: 'اضافه کار', name: 'اضافه کار', active: true }, { id: 'rt6', cat: 'تردد', name: 'تردد دستی', active: true },
  ],
};
