// تست یکپارچه دستگاه حضور و غیاب: سرور اصلی + سرویس zk-sync با دستگاه شبیه‌سازی‌شده
// نیازمند python3 با fastapi و uvicorn؛ اگر نصب نباشد این تست رد (skip) می‌شود.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { todayJ, toJ } from '../../shared/core.js';

const hasPy = spawnSync('python3', ['-c', 'import fastapi, uvicorn'], { stdio: 'ignore' }).status === 0;
const PORT = 3918; const ZKPORT = 8471;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aromin-zk-'));
const base = `http://127.0.0.1:${PORT}/api`;
let node; let py; let token;
const call = async (p, { method = 'GET', body } = {}) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  const t = r.headers.get('content-type') || '';
  return { status: r.status, body: t.includes('json') ? await r.json() : await r.text() };
};
const wait = async (url) => { for (let i = 0; i < 100; i++) { try { await fetch(url); return; } catch { await new Promise((r) => setTimeout(r, 100)); } } throw new Error('start failed ' + url); };
const ymd = (d) => d.toISOString().slice(0, 10);

before(async () => {
  if (!hasPy) return;
  py = spawn('python3', ['tests/run_fake_server.py', String(ZKPORT)], {
    cwd: path.resolve('../zk-sync'), stdio: 'ignore',
    env: { ...process.env, AZK_DRIVER: 'fake', AZK_API_KEY: 'k1', AZK_DB_PATH: path.join(tmp, 'zk.db'), AZK_SCHEDULER_TICK: '3600' },
  });
  node = spawn(process.execPath, ['src/index.js'], {
    stdio: 'ignore',
    env: { ...process.env, PORT, DB_FILE: path.join(tmp, 'main.db'), ADMIN_USER: 'admin', ADMIN_PASS: 'admin12345', JWT_SECRET: 't', SMS_DRY_RUN: '1', ZK_SERVICE_URL: `http://127.0.0.1:${ZKPORT}/api`, ZK_SERVICE_KEY: 'k1', ZK_BRIDGE_SEC: '3600' },
  });
  await wait(`http://127.0.0.1:${ZKPORT}/api/health`); await wait(base + '/health');
  token = (await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin12345' }) })).json()).token;
});
after(() => { node?.kill(); py?.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('دستگاه ← تخلیه ← کارکرد (بدون تکرار، با ویرایش و حذف)', { skip: !hasPy && 'python3/fastapi نصب نیست' }, async () => {
  const st = await call('/admin/zk/status');
  assert.equal(st.body.configured, true); assert.ok(st.body.service?.ok, JSON.stringify(st.body));

  const wp = (await call('/admin/c/workplaces', { method: 'POST', body: { name: 'دفتر', lat: 37.28, lng: 49.58, radius: 100 } })).body;
  const ali = (await call('/admin/c/personnel', { method: 'POST', body: { firstName: 'علی', lastName: 'تست', code: '1001', username: 'ali', password: 'pass1234', workplace: wp.id } })).body;

  // تست اتصال و افزودن دستگاه
  assert.equal((await call('/admin/zk/devices/test', { method: 'POST', body: { ip: '192.168.1.201', port: 4370 } })).body.ok, true);
  assert.equal((await call('/admin/zk/devices/test', { method: 'POST', body: { ip: '10.255.0.1' } })).body.ok, false);
  const bad = await call('/admin/zk/devices', { method: 'POST', body: { name: '', ip: '' } });
  assert.equal(bad.status, 422); assert.ok(bad.body.error);
  const dev = (await call('/admin/zk/devices', { method: 'POST', body: { name: 'ورودی', ip: '192.168.1.201', port: 4370, interval_min: 109, location: wp.id } })).body;
  assert.equal(dev.interval_min, 109);

  // تخلیه الان ← کارکرد ساخته می‌شود
  const s1 = (await call(`/admin/zk/devices/${dev.id}/sync`, { method: 'POST' })).body;
  assert.equal(s1.status, 'ok'); assert.equal(s1.inserted, 18);
  let att = (await call('/admin/c/attendance')).body.filter((a) => a.zk);
  assert.equal(att.length, 3, 'سه روز برای 1001 (1002 هنوز پرسنل نیست)');
  assert.ok(att.every((a) => a.person === ali.id && a.in === '08:05' && a.out === '15:40'), JSON.stringify(att));
  assert.deepEqual((await call('/admin/zk/status')).body.bridge.unmatchedCodes, ['1002']);

  // تخلیه دوباره ← هیچ تکراری
  const s2 = (await call(`/admin/zk/devices/${dev.id}/sync`, { method: 'POST' })).body;
  assert.equal(s2.inserted, 0);
  assert.equal((await call('/admin/c/attendance')).body.filter((a) => a.zk).length, 3);

  // پرسنل دوم اضافه شود ← ترددهای قبلی‌اش خودکار وصل می‌شوند
  await call('/admin/c/personnel', { method: 'POST', body: { firstName: 'سارا', lastName: 'تست', code: '1002', username: 'sara', password: 'pass1234', workplace: wp.id } });
  assert.equal((await call('/admin/c/attendance')).body.filter((a) => a.zk).length, 6);

  // ثبت جدید روی دستگاه امروز ← ورود ناقص
  const now = new Date(); const ts = `${ymd(now)} 09:00:00`;
  await fetch(`http://127.0.0.1:${ZKPORT}/api/_fake/punch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: '192.168.1.201', user_id: '1001', ts }) });
  assert.equal((await call(`/admin/zk/devices/${dev.id}/sync`, { method: 'POST' })).body.inserted, 1);
  const todayRow = (await call('/admin/c/attendance')).body.find((a) => a.zk && a.date === todayJ() && a.person === ali.id);
  assert.equal(todayRow.in, '09:00'); assert.equal(todayRow.out, null);

  // فهرست، ویرایش، حذف نرم، بازگردانی
  const list = (await call(`/admin/zk/attendance?user_id=1001&date_from=${ymd(now)}&date_to=${ymd(now)}`)).body;
  assert.equal(list.total, 1);
  const rec = list.items[0];
  await call(`/admin/zk/attendance/${rec.id}`, { method: 'PUT', body: { ts: `${ymd(now)} 08:10` } });
  assert.equal((await call('/admin/c/attendance')).body.find((a) => a.zk && a.date === todayJ() && a.person === ali.id).in, '08:10');
  await call('/admin/zk/attendance', { method: 'POST', body: { user_id: '1001', ts: `${ymd(now)} 16:00`, punch: 1, note: 'فراموشی خروج' } });
  const closed = (await call('/admin/c/attendance')).body.find((a) => a.zk && a.date === todayJ() && a.person === ali.id);
  assert.equal(closed.out, '16:00');
  await call(`/admin/zk/attendance/${rec.id}`, { method: 'DELETE' });
  assert.equal((await call('/admin/c/attendance')).body.find((a) => a.zk && a.date === todayJ() && a.person === ali.id).in, '16:00');
  await call(`/admin/zk/attendance/${rec.id}/restore`, { method: 'POST' });
  assert.equal((await call(`/admin/zk/attendance/${rec.id}/history`)).body.length >= 3, true);
  const s3 = (await call(`/admin/zk/devices/${dev.id}/sync`, { method: 'POST' })).body;
  assert.equal(s3.inserted, 0, 'رکورد ویرایش‌شده دوباره وارد نمی‌شود');

  // گزارش کارکرد از ترددهای دستگاه
  const d1 = toJ(ymd(new Date(Date.now() - 86400000 * 3)));
  const perf = (await call(`/admin/reports/performance?from=${d1}&to=${todayJ()}&person=${ali.id}`)).body[0];
  assert.ok(perf.minutes.worked >= 3 * 455, JSON.stringify(perf.minutes));

  // خروجی اکسل، سابقه تخلیه، مسیر غیرمجاز
  const csv = await call(`/admin/zk/attendance/export.csv?date_from=${ymd(now)}`);
  assert.equal(csv.status, 200); assert.match(String(csv.body), /کد پرسنلی/);
  assert.ok((await call('/admin/zk/sync-runs')).body.length >= 3);
  assert.equal((await call('/admin/zk/_fake/punch', { method: 'POST', body: {} })).status, 404);

  // بازسازی کامل همان نتیجه را می‌دهد
  const before = (await call('/admin/c/attendance')).body.filter((a) => a.zk).length;
  await call('/admin/zk/rebuild', { method: 'POST' });
  assert.equal((await call('/admin/c/attendance')).body.filter((a) => a.zk).length, before);
});
