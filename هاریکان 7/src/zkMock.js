// ─────────────────────────────────────────────────────────────
//  نسخه نمایشی سرویس دستگاه (فقط VITE_MODE=local)
//  همان API سرویس zk-sync را داخل مرورگر شبیه‌سازی می‌کند:
//  دستگاه مجازی برای کد پرسنلی‌های تعریف‌شده ورود/خروج تولید می‌کند، تخلیه بدون تکرار،
//  ویرایش/حذف نرم/بازگردانی، گزارش‌ها و زمان‌بند خودکار.
//  آی‌پی‌هایی که با 10.255. شروع شوند «در دسترس نیستند» (برای دیدن حالت خطا).
// ─────────────────────────────────────────────────────────────
import dayjs from 'dayjs';
import { MODE, db, replaceLocal } from './store.js';
import { zkPairs, toJ, ZK_PUNCH } from '../shared/core.js';

const KEY = 'aromin-hozour:zk-demo';
const STD = 450;
const blank = () => ({ devices: [], records: [], runs: [], audit: [], people: {}, seq: { dev: 0, rec: 0, run: 0, aud: 0 }, rev: 0 });
let S = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { return blank(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* حافظه پر */ } };
const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const running = new Set();
const lastAttempt = {};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

// ───────── دستگاه مجازی
const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const codes = () => { const c = db.list('personnel').map((p) => String(p.code || '').trim()).filter(Boolean); return c.length ? c : ['1001', '1002']; };
function virtualDevice(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && !/^[\w.-]+$/.test(ip)) throw new Error('آدرس دستگاه نامعتبر است');
  if (ip.startsWith('10.255.')) throw new Error("can't reach device (ping/tcp timeout)");
  const out = []; const t = dayjs();
  for (let d = 6; d >= 0; d--) {
    const day = t.subtract(d, 'day');
    if (day.day() === 5) continue; // جمعه
    for (const code of codes()) {
      const r = (k) => hash(`${ip}|${code}|${day.format('YYYY-MM-DD')}|${k}`);
      const tin = day.hour(7).minute(50).second(0).add(Math.floor(r('i') * 35), 'minute');
      const tout = day.hour(15).minute(20).second(0).add(Math.floor(r('o') * 70), 'minute');
      const push = (x, punch) => { if (!x.isAfter(t)) out.push({ user_id: code, ts: x.format('YYYY-MM-DD HH:mm:ss'), punch }); };
      push(tin, 0);
      if (r('d') < 0.2) push(tin.add(14, 'second'), 0); // انگشت دوباره
      push(tout, 1);
    }
  }
  return { records: out, info: { serial_number: 'DEMO' + ip.replace(/\D/g, '').slice(-6), device_name: 'ZKTeco (شبیه‌ساز)', firmware: 'Ver 6.60', device_time: now(), record_count: out.length, user_count: codes().length } };
}

// ───────── پل: ترددهای دستگاه ← جدول کارکرد
function bridge() {
  const people = new Map(db.list('personnel').map((p) => [String(p.code || '').trim(), p]));
  const groups = new Map();
  for (const r of S.records) {
    if (r.is_deleted) continue;
    const k = `${r.user_id}|${r.ts.slice(0, 10)}`;
    (groups.get(k) || groups.set(k, []).get(k)).push({ ts: r.ts, device_name: devName(r.device_id) });
  }
  const fresh = [];
  for (const [k, punches] of groups) {
    const [code, g] = k.split('|'); const p = people.get(code); if (!p) continue;
    zkPairs(punches).forEach((x, i) => fresh.push({ id: `zk_${p.id}_${g}_${i}`, person: p.id, date: toJ(g), in: x.in, out: x.out, type: 'حضور', zk: true, inMeta: { source: 'device', device: x.inDevice } }));
  }
  const all = db.list('attendance'); const old = all.filter((a) => a.zk);
  const sig = (arr) => arr.map((a) => `${a.person}${a.date}${a.in}${a.out}`).sort().join('|');
  if (sig(old) !== sig(fresh)) replaceLocal('attendance', [...all.filter((a) => !a.zk), ...fresh]);
}

// ───────── کمکی‌ها
const devName = (id) => S.devices.find((d) => d.id === id)?.name || null;
const nextRun = (d) => {
  if (!d.active || !d.auto_sync) return null;
  const last = lastAttempt[d.id] || d.last_sync_at;
  return last ? dayjs(last).add(Math.max(1, d.interval_min), 'minute').format('YYYY-MM-DD HH:mm:ss') : now();
};
const devOut = (d) => ({ ...d, next_run_at: nextRun(d), running: running.has(d.id), record_total: S.records.filter((r) => r.device_id === d.id).length });
const bump = (r) => { r.rev = ++S.rev; };
const normTs = (v) => {
  const s = String(v || '').trim().replace('T', ' ');
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) fail(422, 'فرمت زمان باید YYYY-MM-DD HH:MM باشد');
  return `${m[1]} ${m[2]}:${m[3]}:${m[4] || '00'}`;
};
const audit = (id, action, before, after) => S.audit.push({ id: ++S.seq.aud, attendance_id: id, action, before_json: before ? JSON.stringify(before) : null, after_json: after ? JSON.stringify(after) : null, actor: 'نسخه نمایشی', at: now() });
const findRec = (id) => S.records.find((r) => r.id === +id) || fail(404, 'رکورد پیدا نشد');
const recOut = (r) => ({ ...r, device_name: devName(r.device_id), person_name: S.people[r.user_id] || '', punch_label: ZK_PUNCH[r.punch] ?? String(r.punch) });

function validateDevice(b) {
  const errs = [];
  if (!String(b.name || '').trim()) errs.push('نام دستگاه الزامی است');
  if (!String(b.ip || '').trim()) errs.push('آی‌پی الزامی است');
  const port = +b.port || 4370; if (port < 1 || port > 65535) errs.push('پورت نامعتبر است');
  const iv = +b.interval_min || 5; if (iv < 1 || iv > 1440) errs.push('بازه تخلیه بین ۱ تا ۱۴۴۰ دقیقه');
  if (errs.length) fail(422, errs.join('، '));
  return {
    name: String(b.name).trim(), ip: String(b.ip).trim(), port, comm_password: +b.comm_password || 0, timeout_sec: +b.timeout_sec || 10,
    location: b.location || '', auto_sync: b.auto_sync !== false, interval_min: iv, disable_during_read: !!b.disable_during_read, active: b.active !== false,
  };
}

async function runSync(id, trigger, force) {
  const d = S.devices.find((x) => x.id === id); if (!d) return { status: 'error', message: 'دستگاه پیدا نشد' };
  if (running.has(id)) return { status: 'busy', message: 'تخلیه این دستگاه در حال اجراست' };
  running.add(id);
  const t0 = Date.now(); const run = { id: ++S.seq.run, device_id: id, trigger, started_at: now(), status: 'running', fetched: 0, inserted: 0, duplicates: 0 };
  S.runs.push(run);
  try {
    await sleep(500 + Math.random() * 600);
    const { records, info } = virtualDevice(d.ip);
    run.device_count = info.record_count;
    if (!force && d.last_record_count === info.record_count && ['ok', 'skipped'].includes(d.last_status)) {
      Object.assign(run, { status: 'skipped', message: 'رکورد جدیدی روی دستگاه نیست' });
    } else {
      const keys = new Set(S.records.filter((r) => r.device_id === id).map((r) => `${r.raw_user_id}|${r.raw_ts}|${r.raw_punch}`));
      let ins = 0;
      for (const p of records) {
        const k = `${p.user_id}|${p.ts}|${p.punch}`; if (keys.has(k)) continue; keys.add(k);
        const r = { id: ++S.seq.rec, device_id: id, raw_user_id: p.user_id, raw_ts: p.ts, raw_punch: p.punch, user_id: p.user_id, ts: p.ts, punch: p.punch, note: '', source: 'device', is_edited: 0, is_deleted: 0, sync_run_id: run.id, imported_at: now(), edited_at: null, edited_by: null };
        bump(r); S.records.push(r); ins++;
      }
      Object.assign(run, { status: 'ok', fetched: records.length, inserted: ins, duplicates: records.length - ins, message: `${ins} رکورد جدید از ${records.length} رکورد دستگاه` });
    }
    Object.assign(d, { last_sync_at: now(), last_success_at: now(), last_status: run.status, last_error: null, last_record_count: info.record_count, serial_number: info.serial_number, device_name: info.device_name, firmware: info.firmware });
  } catch (e) {
    Object.assign(run, { status: 'error', message: e.message });
    Object.assign(d, { last_sync_at: now(), last_status: 'error', last_error: e.message });
  } finally {
    Object.assign(run, { finished_at: now(), duration_ms: Date.now() - t0 });
    running.delete(id); S.runs = S.runs.slice(-300); save(); bridge();
  }
  const { started_at: _s, finished_at: _f, ...res } = run;
  return { run_id: run.id, ...res };
}

function filtered(q) {
  return S.records.filter((a) => {
    if (q.date_from && a.ts < q.date_from.slice(0, 10) + ' 00:00:00') return false;
    if (q.date_to && a.ts > q.date_to.slice(0, 10) + ' 23:59:59') return false;
    if (q.user_id && a.user_id !== String(q.user_id)) return false;
    if (q.device_id && a.device_id !== +q.device_id) return false;
    if (q.source && a.source !== q.source) return false;
    const st = q.status || 'active';
    if (st === 'deleted' && !a.is_deleted) return false;
    if (st === 'edited' && !(a.is_edited && !a.is_deleted)) return false;
    if (st === 'active' && a.is_deleted) return false;
    if (q.q && !`${a.user_id} ${S.people[a.user_id] || ''} ${a.note}`.includes(q.q)) return false;
    return true;
  });
}

function daily(q) {
  const groups = new Map();
  for (const r of filtered({ ...q, status: 'active' }).sort((a, b) => a.ts.localeCompare(b.ts))) {
    const k = `${r.user_id}|${r.ts.slice(0, 10)}`; (groups.get(k) || groups.set(k, []).get(k)).push(r);
  }
  const out = [];
  for (const [k, items] of groups) {
    const [uid, day] = k.split('|');
    const pairs = zkPairs(items);
    const times = pairs.flatMap((p) => [p.in, p.out].filter(Boolean));
    const worked = pairs.reduce((s, p) => s + (p.out ? (+p.out.slice(0, 2) * 60 + +p.out.slice(3)) - (+p.in.slice(0, 2) * 60 + +p.in.slice(3)) : 0), 0);
    const incomplete = pairs.some((p) => !p.out);
    out.push({ user_id: uid, name: S.people[uid] || '', date: day, first_in: times[0], last_out: times.length > 1 ? times[times.length - 1] : null, punches: items.length, times, worked_min: worked, standard_min: STD, diff_min: worked - STD, incomplete });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.user_id.localeCompare(b.user_id));
}

// ───────── مسیرها (هم‌شکل API سرویس)
export async function mock(method, path, q, body = {}) {
  if (MODE !== 'local') throw new Error('mock only in demo');
  try {
    return await route(method, path, q, body || {});
  } catch (e) {
    const msg = e.message || 'خطا';
    window.dispatchEvent(new CustomEvent('aromin:error', { detail: msg }));
    const err = new Error(msg); err.shown = true; throw err;
  }
}

async function route(m, path, q, b) {
  let x;
  if (m === 'GET' && path === '/status') {
    return { configured: true, demo: true, service: { ok: true, driver: 'demo' }, bridge: { configured: true, lastPullAt: new Date().toISOString(), lastError: null, lastRev: S.rev, mirrored: S.records.filter((r) => !r.is_deleted).length, unmatchedCodes: [...new Set(S.records.filter((r) => !r.is_deleted).map((r) => r.user_id))].filter((c) => !db.list('personnel').some((p) => String(p.code) === c)) } };
  }
  if (m === 'POST' && (path === '/pull' || path === '/rebuild')) { bridge(); return { ok: true }; }
  if (path === '/devices') {
    if (m === 'GET') return S.devices.filter((d) => !d.archived).map(devOut);
    if (m === 'POST') {
      const v = validateDevice(b);
      const old = S.devices.find((d) => d.ip === v.ip && d.port === v.port);
      if (old && !old.archived) fail(409, 'دستگاهی با همین IP و پورت قبلاً ثبت شده است');
      if (old) { Object.assign(old, v, { archived: false, updated_at: now() }); save(); return devOut(old); }
      const d = { id: ++S.seq.dev, ...v, archived: false, last_record_count: null, last_sync_at: null, last_status: null, created_at: now(), updated_at: now() };
      S.devices.push(d); save(); return devOut(d);
    }
  }
  if (m === 'POST' && path === '/devices/test') {
    await sleep(400);
    try { const { info } = virtualDevice(String(b.ip || '')); return { ok: true, ...info, latency_ms: 40 + Math.floor(Math.random() * 60) }; } catch (e) { return { ok: false, error: e.message }; }
  }
  if ((x = path.match(/^\/devices\/(\d+)$/))) {
    const d = S.devices.find((y) => y.id === +x[1] && !y.archived) || fail(404, 'دستگاه پیدا نشد');
    if (m === 'PUT') {
      const v = validateDevice(b);
      if (S.devices.some((y) => y.id !== d.id && !y.archived && y.ip === v.ip && y.port === v.port)) fail(409, 'دستگاه دیگری با همین IP و پورت وجود دارد');
      Object.assign(d, v, { updated_at: now() }); delete lastAttempt[d.id]; save(); return devOut(d);
    }
    if (m === 'DELETE') { Object.assign(d, { archived: true, active: false }); save(); return { ok: true }; }
  }
  if ((x = path.match(/^\/devices\/(\d+)\/test$/)) && m === 'POST') {
    const d = S.devices.find((y) => y.id === +x[1]) || fail(404, 'دستگاه پیدا نشد');
    return route('POST', '/devices/test', {}, d);
  }
  if ((x = path.match(/^\/devices\/(\d+)\/sync$/)) && m === 'POST') return runSync(+x[1], 'manual', true);
  if (path === '/sync-all' && m === 'POST') return Promise.all(S.devices.filter((d) => d.active && !d.archived).map((d) => runSync(d.id, 'manual', true)));
  if (path === '/sync-runs') {
    return S.runs.filter((r) => !q.device_id || r.device_id === +q.device_id).slice().reverse().slice(0, +q.limit || 50).map((r) => ({ ...r, device_name: devName(r.device_id) }));
  }
  if (path === '/attendance') {
    if (m === 'GET') {
      const all = filtered(q).sort((a, b) => (q.order === 'asc' ? 1 : -1) * (a.ts.localeCompare(b.ts) || a.id - b.id));
      const page = +q.page || 1; const size = Math.min(+q.page_size || 50, 1000);
      return { total: all.length, page, page_size: size, items: all.slice((page - 1) * size, page * size).map(recOut) };
    }
    if (m === 'POST') {
      if (!String(b.user_id || '').trim()) fail(422, 'کد پرسنلی الزامی است');
      const r = { id: ++S.seq.rec, device_id: b.device_id || null, raw_user_id: null, raw_ts: null, raw_punch: null, user_id: String(b.user_id).trim(), ts: normTs(b.ts), punch: +b.punch || 0, note: b.note || '', source: 'manual', is_edited: 0, is_deleted: 0, imported_at: now(), edited_at: now(), edited_by: 'نسخه نمایشی' };
      bump(r); S.records.push(r); audit(r.id, 'manual_add', null, b); save(); bridge(); return recOut(r);
    }
  }
  if ((x = path.match(/^\/attendance\/(\d+)$/))) {
    const r = findRec(x[1]);
    if (m === 'PUT') {
      const ch = {};
      if (b.user_id != null) ch.user_id = String(b.user_id).trim();
      if (b.ts != null) ch.ts = normTs(b.ts);
      if (b.punch != null) ch.punch = +b.punch;
      if (b.note != null) ch.note = b.note;
      if (!Object.keys(ch).length) fail(400, 'تغییری ارسال نشده');
      audit(r.id, 'edit', Object.fromEntries(Object.keys(ch).map((k) => [k, r[k]])), ch);
      Object.assign(r, ch, { is_edited: 1, edited_at: now(), edited_by: 'نسخه نمایشی' }); bump(r); save(); bridge(); return recOut(r);
    }
    if (m === 'DELETE') { Object.assign(r, { is_deleted: 1, edited_at: now() }); bump(r); audit(r.id, 'delete'); save(); bridge(); return { ok: true }; }
  }
  if ((x = path.match(/^\/attendance\/(\d+)\/(restore|revert|history)$/))) {
    const r = findRec(x[1]);
    if (x[2] === 'history') return S.audit.filter((a) => a.attendance_id === r.id).slice().reverse();
    if (x[2] === 'restore') { r.is_deleted = 0; audit(r.id, 'restore'); }
    if (x[2] === 'revert') {
      if (r.source !== 'device') fail(400, 'رکورد دستی مقدار اصلی دستگاه ندارد');
      audit(r.id, 'revert', { user_id: r.user_id, ts: r.ts, punch: r.punch });
      Object.assign(r, { user_id: r.raw_user_id, ts: r.raw_ts, punch: r.raw_punch, is_edited: 0 });
    }
    r.edited_at = now(); bump(r); save(); bridge(); return recOut(r);
  }
  if (path === '/people' && m === 'GET') {
    const ids = [...new Set(S.records.map((r) => r.user_id))].sort((a, c) => a.localeCompare(c, undefined, { numeric: true }));
    return ids.map((id) => ({ user_id: id, name: S.people[id] || '', last_ts: S.records.filter((r) => r.user_id === id && !r.is_deleted).map((r) => r.ts).sort().pop() || null }));
  }
  if (path === '/reports/daily') return daily(q);
  if (path === '/reports/summary') {
    const agg = new Map();
    for (const d of daily(q)) {
      const a = agg.get(d.user_id) || agg.set(d.user_id, { user_id: d.user_id, name: d.name, days: 0, worked_min: 0, shortfall_min: 0, overtime_min: 0, incomplete_days: 0 }).get(d.user_id);
      a.days++; a.worked_min += d.worked_min;
      if (d.incomplete) a.incomplete_days++; else if (d.diff_min < 0) a.shortfall_min -= d.diff_min; else a.overtime_min += d.diff_min;
    }
    return [...agg.values()].map((a) => ({ ...a, avg_min: a.days ? Math.floor(a.worked_min / a.days) : 0 }));
  }
  fail(404, 'مسیر یافت نشد');
}

// ───────── زمان‌بند خودکار نسخه نمایشی (تا وقتی صفحه باز است)
if (MODE === 'local' && typeof window !== 'undefined') {
  setInterval(() => {
    const t = now();
    for (const d of S.devices) {
      if (d.archived || running.has(d.id)) continue;
      const nr = nextRun(d);
      if (nr && nr <= t) { lastAttempt[d.id] = t; runSync(d.id, 'auto', false); }
    }
  }, 15000);
}
