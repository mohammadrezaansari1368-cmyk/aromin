// پل دستگاه ← کارکرد
// رکوردهای تخلیه‌شده از دستگاه (سرویس zk-sync) را می‌خواند و برای هر پرسنل/روز
// به ردیف‌های «ورود/خروج» جدول attendance تبدیل می‌کند تا همه گزارش‌های کارکرد، تأخیر،
// اضافه‌کاری و تردد ناقص از آن‌ها محاسبه شوند.
//
//  • فقط تغییرات تازه خوانده می‌شود (شماره تغییر rev)، پس تکرار و بار اضافه ندارد.
//  • ردیف‌های ساخته‌شده علامت zk:true دارند؛ ثبت‌های اپلیکیشن و دستی هرگز دست نمی‌خورند.
//  • ویرایش یا حذف یک رکورد در «ترددهای تخلیه‌شده»، همان روز را دوباره محاسبه می‌کند.
//  • کد کاربر روی دستگاه = «کد پرسنلی» در سامانه.
import { sql, repo, settings, newId } from '../db.js';
import { zkPairs, toJ } from '../engine/helpers.js';
import { zkJson, zkConfigured } from './client.js';

sql.exec(`
  CREATE TABLE IF NOT EXISTS zk_punches (
    id INTEGER PRIMARY KEY, rev INTEGER, code TEXT NOT NULL, gdate TEXT NOT NULL, ts TEXT NOT NULL,
    punch INTEGER, deleted INTEGER NOT NULL DEFAULT 0, device_name TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_zk_punches ON zk_punches(code, gdate);
`);

const st = { running: null, lastPullAt: null, lastError: null, lastResult: null };
const q = {
  get: sql.prepare('SELECT code, gdate FROM zk_punches WHERE id = ?'),
  upsert: sql.prepare(`INSERT INTO zk_punches (id, rev, code, gdate, ts, punch, deleted, device_name) VALUES (@id, @rev, @code, @gdate, @ts, @punch, @deleted, @device_name)
    ON CONFLICT(id) DO UPDATE SET rev=excluded.rev, code=excluded.code, gdate=excluded.gdate, ts=excluded.ts, punch=excluded.punch, deleted=excluded.deleted, device_name=excluded.device_name`),
  day: sql.prepare('SELECT ts, device_name FROM zk_punches WHERE code = ? AND gdate = ? AND deleted = 0 ORDER BY ts'),
  daysOf: sql.prepare('SELECT DISTINCT gdate FROM zk_punches WHERE code = ?'),
  zkRows: sql.prepare("SELECT id, data FROM attendance WHERE json_extract(data, '$.zk') = 1"),
  del: sql.prepare('DELETE FROM attendance WHERE id = ?'),
  ins: sql.prepare('INSERT INTO attendance (id, data) VALUES (?, ?)'),
};

/** محاسبه دوباره ردیف‌های کارکرد برای مجموعه‌ای از «کد|تاریخ میلادی» */
function recompute(keys) {
  if (!keys.size) return 0;
  const people = new Map(repo.list('personnel').map((p) => [String(p.code ?? '').trim(), p]));
  const existing = new Map();
  for (const r of q.zkRows.all()) {
    const d = JSON.parse(r.data); const k = `${d.person}|${d.date}`;
    (existing.get(k) || existing.set(k, []).get(k)).push({ id: r.id, ...d });
  }
  let changed = 0;
  sql.transaction(() => {
    for (const key of keys) {
      const [code, gdate] = key.split('|');
      const person = people.get(code);
      if (!person) continue; // کد روی دستگاه هنوز به پرسنلی وصل نیست
      const date = toJ(gdate);
      const pairs = zkPairs(q.day.all(code, gdate));
      const old = existing.get(`${person.id}|${date}`) || [];
      const sig = (arr) => arr.map((a) => `${a.in}-${a.out}`).sort().join(',');
      if (sig(old) === sig(pairs)) continue;
      old.forEach((o) => q.del.run(o.id));
      for (const p of pairs) {
        q.ins.run(newId(), JSON.stringify({
          person: person.id, date, in: p.in, out: p.out, type: 'حضور', zk: true,
          inMeta: { source: 'device', device: p.inDevice }, outMeta: p.out ? { source: 'device', device: p.outDevice } : null,
        }));
      }
      changed++;
    }
  })();
  return changed;
}

async function doPull() {
  let rev = settings.get('zkLastRev', 0); let fetched = 0; let days = 0;
  for (let page = 0; page < 500; page++) {
    const r = await zkJson(`/changes?after_rev=${rev}&limit=2000`, { timeout: 60000 });
    if (r.max_rev < rev) { // دیتابیس سرویس دستگاه از نو ساخته شده ← از اول بخوان
      sql.exec('DELETE FROM zk_punches'); settings.set('zkLastRev', 0); rev = 0; continue;
    }
    const keys = new Set();
    sql.transaction(() => {
      for (const it of r.items) {
        const old = q.get.get(it.id);
        if (old) keys.add(`${old.code}|${old.gdate}`);
        const row = { id: it.id, rev: it.rev, code: String(it.user_id).trim(), gdate: it.ts.slice(0, 10), ts: it.ts, punch: it.punch, deleted: it.is_deleted ? 1 : 0, device_name: it.device_name || null };
        q.upsert.run(row); keys.add(`${row.code}|${row.gdate}`);
      }
    })();
    days += recompute(keys); fetched += r.items.length;
    rev = r.last_rev; settings.set('zkLastRev', rev);
    if (!r.more) break;
  }
  return { fetched, days, rev };
}

/** خواندن تغییرات تازه (هم‌زمان فقط یک اجرا) */
export function pull() {
  if (!zkConfigured()) return Promise.resolve({ skipped: true });
  if (!st.running) {
    st.running = doPull()
      .then((r) => { st.lastResult = r; st.lastError = null; return r; })
      .catch((e) => { if (st.lastError !== e.message) console.warn('⚠️  پل دستگاه:', e.message); st.lastError = e.message; throw e; })
      .finally(() => { st.lastPullAt = new Date().toISOString(); st.running = null; });
  }
  return st.running;
}

/** بعد از افزودن/ویرایش پرسنل یا تغییر کد پرسنلی: ردیف‌های دستگاهی آن نفر از نو ساخته می‌شوند */
export function rebuildPerson(person, oldCode) {
  const mine = q.zkRows.all().filter((r) => JSON.parse(r.data).person === person.id);
  mine.forEach((r) => q.del.run(r.id));
  const keys = new Set();
  for (const code of new Set([person.code, oldCode].filter(Boolean).map((c) => String(c).trim()))) {
    q.daysOf.all(code).forEach((d) => keys.add(`${code}|${d.gdate}`));
  }
  return recompute(keys);
}

/** بازسازی کامل همه ردیف‌های دستگاهی */
export function rebuildAll() {
  q.zkRows.all().forEach((r) => q.del.run(r.id));
  const keys = new Set(sql.prepare('SELECT DISTINCT code, gdate FROM zk_punches').all().map((r) => `${r.code}|${r.gdate}`));
  return { days: recompute(keys) };
}

export const bridgeStatus = () => ({
  configured: zkConfigured(), running: !!st.running, lastPullAt: st.lastPullAt, lastError: st.lastError,
  lastResult: st.lastResult, lastRev: settings.get('zkLastRev', 0),
  mirrored: sql.prepare('SELECT COUNT(*) n FROM zk_punches WHERE deleted = 0').get().n,
  unmatchedCodes: sql.prepare('SELECT DISTINCT code FROM zk_punches WHERE deleted = 0').all().map((r) => r.code)
    .filter((c) => !repo.where('personnel', 'code', c).length),
});

/** حلقه دوره‌ای (پیش‌فرض هر ۳۰ ثانیه) */
export function startBridge() {
  if (!zkConfigured()) { console.log('ℹ️  سرویس دستگاه تنظیم نشده (ZK_SERVICE_URL)؛ پل دستگاه غیرفعال است'); return; }
  const sec = Math.max(+process.env.ZK_BRIDGE_SEC || 30, 5);
  const tick = () => pull().catch(() => {});
  setTimeout(tick, 2000);
  setInterval(tick, sec * 1000).unref();
  console.log(`✓ پل دستگاه فعال شد — هر ${sec} ثانیه رکوردهای تازه خوانده می‌شود`);
}
