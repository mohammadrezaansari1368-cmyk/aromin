// تست کامل API:  npm test   (روی یک دیتابیس موقت اجرا می‌شود)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3917;
const DB = path.join(os.tmpdir(), `aromin-test-${Date.now()}.db`);
let proc; let admin; let emp;
const base = `http://127.0.0.1:${PORT}/api`;
async function call(p, { method = 'GET', body, token } = {}) {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}

before(async () => {
  proc = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, PORT, DB_FILE: DB, ADMIN_USER: 'admin', ADMIN_PASS: 'admin12345', JWT_SECRET: 'test', SMS_DRY_RUN: '1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => { proc.kill(); fs.rmSync(DB, { force: true }); });

const ids = {};
test('ورود مدیر و رد رمز اشتباه', async () => {
  assert.equal((await call('/auth/login', { method: 'POST', body: { username: 'admin', password: 'bad' } })).status, 401);
  const r = await call('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin12345' } });
  assert.equal(r.status, 200); admin = r.body.token;
  assert.equal((await call('/admin/bootstrap')).status, 401);
});

test('تعریف محل کار، شیفت و پرسنل', async () => {
  const wp = await call('/admin/c/workplaces', { method: 'POST', token: admin, body: { name: 'دفتر رشت', lat: 37.2808, lng: 49.5832, radius: 100, wifis: [{ ssid: 'office', bssid: 'AA:BB:CC:DD:EE:FF' }] } });
  assert.equal(wp.status, 201); ids.wp = wp.body.id;
  const days = Object.fromEntries(['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'].map((d) => [d, ['08:00', '15:30']]));
  const sh = await call('/admin/c/shifts', { method: 'POST', token: admin, body: { name: 'اداری', type: 'ساده', days } });
  ids.shift = sh.body.id;
  const pol = (await call('/admin/c/policies', { token: admin })).body[0]; ids.pol = pol.id;
  const bad = await call('/admin/c/personnel', { method: 'POST', token: admin, body: { firstName: 'علی' } });
  assert.equal(bad.status, 422); assert.ok(bad.body.errors.length >= 3);
  const p = await call('/admin/c/personnel', { method: 'POST', token: admin, body: { firstName: 'علی', lastName: 'تست', code: '1001', username: 'ali', password: 'pass1234', mobile: '09121111111', workplace: ids.wp, shift: ids.shift, policy: ids.pol } });
  assert.equal(p.status, 201); ids.ali = p.body.id;
  assert.equal(p.body.passwordHash, undefined, 'رمز نباید برگردانده شود');
  const dup = await call('/admin/c/personnel', { method: 'POST', token: admin, body: { firstName: 'x', lastName: 'y', code: '1001', username: 'ali2', password: 'pass1234' } });
  assert.equal(dup.status, 422);
});

test('اپلیکیشن پرسنل: ورود و ثبت تردد با GPS', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { username: 'ali', password: 'pass1234' } });
  assert.equal(r.body.user.role, 'employee'); emp = r.body.token;
  assert.equal((await call('/admin/bootstrap', { token: emp })).status, 403, 'پرسنل به پنل دسترسی ندارد');
  const far = await call('/app/clock', { method: 'POST', token: emp, body: { lat: 37.30, lng: 49.60, accuracy: 10 } });
  assert.equal(far.status, 422); assert.match(far.body.error, /فاصله/);
  const ok = await call('/app/clock', { method: 'POST', token: emp, body: { lat: 37.2810, lng: 49.5833, accuracy: 10 } });
  assert.equal(ok.status, 200); assert.equal(ok.body.action, 'in');
  const again = await call('/app/clock', { method: 'POST', token: emp, body: { lat: 37.2810, lng: 49.5833 } });
  assert.equal(again.status, 422, 'ثبت تکراری در همان دقیقه رد شود');
  const me = await call('/app/me', { token: emp });
  assert.equal(me.body.isIn, true);
});

test('ثبت تردد با WiFi محل کار', async () => {
  const p = await call('/admin/c/personnel', { method: 'POST', token: admin, body: { firstName: 'سارا', lastName: 'تست', code: '1002', username: 'sara', password: 'pass1234', workplace: ids.wp } });
  const t = (await call('/auth/login', { method: 'POST', body: { username: 'sara', password: 'pass1234' } })).body.token;
  const r = await call('/app/clock', { method: 'POST', token: t, body: { bssid: 'aa-bb-cc-dd-ee-ff' } });
  assert.equal(r.status, 200); assert.equal(r.body.method, 'wifi');
  ids.sara = p.body.id;
});

test('قفل یک دستگاه', async () => {
  await call(`/admin/c/personnel/${ids.sara}`, { method: 'PUT', token: admin, body: { deviceType: 'یک دستگاه ثابت' } });
  const t = (await call('/auth/login', { method: 'POST', body: { username: 'sara', password: 'pass1234' } })).body.token;
  await new Promise((r) => setTimeout(r, 10));
  const a = await call('/app/clock', { method: 'POST', token: t, body: { bssid: 'AA:BB:CC:DD:EE:FF', deviceId: 'phone-1' } });
  assert.ok([200, 422].includes(a.status)); // ممکن است به‌خاطر ثبت در همان دقیقه رد شود؛ ولی دستگاه ثبت می‌شود
  const b = await call('/app/clock', { method: 'POST', token: t, body: { bssid: 'AA:BB:CC:DD:EE:FF', deviceId: 'phone-2' } });
  assert.equal(b.status, 422); assert.match(b.body.error, /گوشی/);
});

test('درخواست مرخصی و سقف سیاست کاری', async () => {
  const y = (await call('/app/me', { token: emp })).body.date.slice(0, 4);
  const over = await call('/app/requests', { method: 'POST', token: emp, body: { kind: 'مرخصی استحقاقی', from: `${y}/11/01`, to: `${y}/11/05` } });
  assert.equal(over.status, 422); assert.match(over.body.error, /سقف/);
  const ok = await call('/app/requests', { method: 'POST', token: emp, body: { kind: 'مرخصی استحقاقی', from: `${y}/11/10`, to: `${y}/11/11` } });
  assert.equal(ok.status, 201); ids.req = ok.body.id;
  const overlap = await call('/app/requests', { method: 'POST', token: emp, body: { kind: 'ماموریت', from: `${y}/11/11` } });
  assert.equal(overlap.status, 422); assert.match(overlap.body.error, /هم‌پوشانی/);
  const appr = await call(`/admin/c/requests/${ids.req}`, { method: 'PUT', token: admin, body: { status: 'تایید شده' } });
  assert.equal(appr.body.status, 'تایید شده');
  const v = await call(`/admin/reports/vacation?year=${y}&month=10&person=${ids.ali}`, { token: admin });
  assert.equal(v.body[0].mu, 2); assert.equal(v.body[0].mr, 0.5);
});

test('گزارش کارکرد و جلوگیری از حذف وابسته', async () => {
  const me = (await call('/app/me', { token: emp })).body;
  const perf = await call(`/admin/reports/performance?from=${me.date}&to=${me.date}`, { token: admin });
  assert.equal(perf.status, 200); assert.ok(perf.body.find((r) => r.id === ids.ali));
  const del = await call(`/admin/c/workplaces/${ids.wp}`, { method: 'DELETE', token: admin });
  assert.equal(del.status, 422);
});

test('پیام به پرسنل و خوانده شدن', async () => {
  const m = await call('/admin/c/messages', { method: 'POST', token: admin, body: { title: 'جلسه', body: 'ساعت ۱۰', to: [ids.ali] } });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  const inbox = await call('/app/messages', { token: emp });
  assert.equal(inbox.body[0].read, false);
  await call(`/app/messages/${m.body.id}/read`, { method: 'POST', token: emp });
  assert.deepEqual((await call(`/admin/c/messages/${m.body.id}`, { token: admin })).body.read, [ids.ali]);
});

test('وب سرویس با توکن', async () => {
  assert.equal((await call('/v1/personnel')).status, 401);
  const t = (await call('/admin/tokens', { method: 'POST', token: admin, body: { name: 'حسابداری' } })).body.token;
  const list = await call('/v1/personnel', { token: t });
  assert.equal(list.status, 200); assert.ok(list.body.every((p) => !('passwordHash' in p)));
  const punch = await call('/v1/punch', { method: 'POST', token: t, body: { code: '1001', date: '1405/01/15', time: '08:30' } });
  assert.equal(punch.status, 200);
  const perf = await call('/v1/performance?from=1405/01/01&to=1405/01/31', { token: t });
  assert.equal(perf.status, 200);
});
